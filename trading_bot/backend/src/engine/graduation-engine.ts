import { CandidateStatus } from "@prisma/client";
import { db } from "../db/client.js";
import { env } from "../config/env.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { HeliusClient } from "../services/helius-client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { recordTokenSnapshot } from "../services/token-snapshot-recorder.js";
import { toOptionalDate } from "../utils/dates.js";
import { ExecutionEngine } from "./execution-engine.js";
import { RiskEngine } from "./risk-engine.js";
import type {
  CandidateEvaluation,
  CandidateFilterState,
  DiscoveryToken,
} from "../types/domain.js";
import { toJsonValue } from "../utils/json.js";
import { logger } from "../utils/logger.js";

const DUE_CANDIDATE_STATUSES: CandidateStatus[] = ["DISCOVERED", "SKIPPED", "ERROR"];

export class GraduationEngine {
  private discoveryInFlight = false;
  private evaluationInFlight = false;

  constructor(
    private readonly birdeye: BirdeyeClient,
    private readonly helius: HeliusClient,
    private readonly execution: ExecutionEngine,
    private readonly risk: RiskEngine,
    private readonly config: RuntimeConfigService,
  ) {}

  async discover(): Promise<void> {
    if (this.discoveryInFlight) return;
    this.discoveryInFlight = true;

    try {
      const settings = await this.config.getSettings();
      const minGraduatedTime = Math.floor(Date.now() / 1000) - env.DISCOVERY_LOOKBACK_SECONDS;
      const tokens = await this.birdeye.getGraduatedMemeTokens({
        minGraduatedTime,
        limit: settings.cadence.evaluationConcurrency * 20,
        minLiquidityUsd: settings.filters.minLiquidityUsd,
        minVolume5mUsd: settings.filters.minVolume5mUsd,
        minHolders: settings.filters.minHolders,
      });
      const existingMints = new Set(
        (
          await db.candidate.findMany({
            where: { mint: { in: tokens.map((token) => token.mint) } },
            select: { mint: true },
          })
        ).map((row) => row.mint),
      );
      const freshTokens = tokens.filter((token) => !existingMints.has(token.mint));

      await Promise.all(freshTokens.map(async (token) => {
        const discoveryState = this.toDiscoveryFilterState(token);
        const created = await db.candidate.create({
          data: {
            mint: token.mint,
            symbol: token.symbol,
            name: token.name,
            source: token.source,
            creator: token.creator,
            status: "DISCOVERED",
            discoveredAt: new Date(),
            graduatedAt: toOptionalDate(token.graduatedAt),
            ...this.toCandidateData(discoveryState, false),
            scheduledEvaluationAt: new Date(Date.now() + settings.cadence.entryDelayMs),
            metadata: toJsonValue({
              stage: "discovered",
            }),
            metrics: toJsonValue(token),
          },
        });

        await recordTokenSnapshot({
          candidateId: created.id,
          mint: token.mint,
          symbol: token.symbol,
          trigger: "discovery",
          ...discoveryState,
          metadata: token,
        });
      }));

      await this.risk.touchActivity("lastDiscoveryAt");
    } finally {
      this.discoveryInFlight = false;
    }
  }

  async evaluateDueCandidates(): Promise<void> {
    if (this.evaluationInFlight) return;
    this.evaluationInFlight = true;

    try {
      const settings = await this.config.getSettings();
      const candidates = await db.candidate.findMany({
        where: {
          status: { in: DUE_CANDIDATE_STATUSES },
          scheduledEvaluationAt: { lte: new Date() },
        },
        orderBy: { discoveredAt: "asc" },
        take: settings.cadence.evaluationConcurrency,
      });

      await Promise.all(candidates.map(async (candidate) => {
        try {
          const evaluation = await this.evaluateCandidate(candidate.mint, candidate.metrics as Record<string, unknown> | null);
          if (!evaluation.passed) {
            await db.candidate.update({
              where: { id: candidate.id },
              data: {
                status: "REJECTED",
                rejectReason: evaluation.rejectReason ?? "rejected",
                lastEvaluatedAt: new Date(),
                ...this.toCandidateData(evaluation.filterState, true),
                metrics: toJsonValue(evaluation.metrics),
              },
            });
            await recordTokenSnapshot({
              candidateId: candidate.id,
              mint: candidate.mint,
              symbol: candidate.symbol,
              trigger: "evaluation_reject",
              ...evaluation.filterState,
              metadata: evaluation.metrics,
              securityRisk: evaluation.rejectReason ?? null,
            });
            return;
          }

          await recordTokenSnapshot({
            candidateId: candidate.id,
            mint: candidate.mint,
            symbol: candidate.symbol,
            trigger: "evaluation_accept",
            ...evaluation.filterState,
            metadata: evaluation.metrics,
          });

          await db.candidate.update({
            where: { id: candidate.id },
            data: {
              status: "ACCEPTED",
              acceptedAt: new Date(),
              lastEvaluatedAt: new Date(),
              rejectReason: null,
              ...this.toCandidateData(evaluation.filterState, true),
              metrics: toJsonValue(evaluation.metrics),
            },
          });

          const positionId = await this.execution.openDryRunPosition({
            candidateId: candidate.id,
            mint: candidate.mint,
            symbol: candidate.symbol,
            entryPriceUsd: evaluation.entryPriceUsd!,
            metrics: evaluation.metrics,
          });

          logger.info({ mint: candidate.mint, positionId }, "candidate promoted to dry-run position");
        } catch (error) {
          await db.candidate.update({
            where: { id: candidate.id },
            data: {
              status: "ERROR",
              rejectReason: error instanceof Error ? error.message : String(error),
              lastEvaluatedAt: new Date(),
            },
          });
        }
      }));

      await this.risk.touchActivity("lastEvaluationAt");
    } finally {
      this.evaluationInFlight = false;
    }
  }

  private async evaluateCandidate(
    mint: string,
    baselineMetrics: Record<string, unknown> | null,
  ): Promise<CandidateEvaluation> {
    const settings = await this.config.getSettings();
    const [detail, livePriceUsd, mintAuthorities, capacity] = await Promise.all([
      this.birdeye.getMemeTokenDetail(mint),
      this.birdeye.getPrice(mint),
      this.helius.getMintAuthorities(mint),
      this.risk.canOpenPosition(),
    ]);

    if (!capacity.allowed) {
      return {
        passed: false,
        rejectReason: capacity.reason ?? "risk blocked entry",
        metrics: {
          ...(baselineMetrics ?? {}),
          capacity,
        },
        filterState: {},
      };
    }

    const metrics: Record<string, unknown> = {
      ...(baselineMetrics ?? {}),
      detail,
      livePriceUsd,
      mintAuthorities,
    };

    const merged = this.mergeDiscoveryMetrics(detail, baselineMetrics);
    const baseFilterState: CandidateFilterState = {
      ...merged,
      priceUsd: livePriceUsd ?? merged.priceUsd,
    };

    if (!detail?.graduated || !merged.graduatedAt) {
      return { passed: false, rejectReason: "token is not confirmed as graduated", metrics, filterState: baseFilterState };
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - merged.graduatedAt;
    metrics.ageSeconds = ageSeconds;
    baseFilterState.graduationAgeSeconds = ageSeconds;
    if (ageSeconds > settings.filters.maxGraduationAgeSeconds) {
      return { passed: false, rejectReason: `graduation too old: ${ageSeconds}s`, metrics, filterState: baseFilterState };
    }

    if ((merged.liquidityUsd ?? 0) < settings.filters.minLiquidityUsd) {
      return { passed: false, rejectReason: "liquidity below floor", metrics, filterState: baseFilterState };
    }

    if ((merged.marketCapUsd ?? Number.MAX_SAFE_INTEGER) > settings.filters.maxMarketCapUsd) {
      return { passed: false, rejectReason: "market cap above ceiling", metrics, filterState: baseFilterState };
    }

    if ((merged.holders ?? 0) < settings.filters.minHolders) {
      return { passed: false, rejectReason: "holder count below floor", metrics, filterState: baseFilterState };
    }

    const tradeData = await this.birdeye.getTradeData(mint);
    metrics.tradeData = tradeData;
    Object.assign(baseFilterState, {
      lastTradeAt: tradeData?.lastTradeAt ?? baseFilterState.lastTradeAt,
      priceUsd: tradeData?.priceUsd ?? baseFilterState.priceUsd,
      volume1mUsd: tradeData?.volume1mUsd ?? baseFilterState.volume1mUsd,
      volume5mUsd: tradeData?.volume5mUsd ?? baseFilterState.volume5mUsd,
      volume30mUsd: tradeData?.volume30mUsd ?? baseFilterState.volume30mUsd,
      volume1hUsd: tradeData?.volume1hUsd ?? baseFilterState.volume1hUsd,
      volume24hUsd: tradeData?.volume24hUsd ?? baseFilterState.volume24hUsd,
      volume1mChangePercent: tradeData?.volume1mChangePercent ?? baseFilterState.volume1mChangePercent,
      volume5mChangePercent: tradeData?.volume5mChangePercent ?? baseFilterState.volume5mChangePercent,
      volume30mChangePercent: tradeData?.volume30mChangePercent ?? baseFilterState.volume30mChangePercent,
      volume1hChangePercent: tradeData?.volume1hChangePercent ?? baseFilterState.volume1hChangePercent,
      volume24hChangePercent: tradeData?.volume24hChangePercent ?? baseFilterState.volume24hChangePercent,
      volumeBuy1mUsd: tradeData?.volumeBuy1mUsd,
      volumeBuy5mUsd: tradeData?.volumeBuy5mUsd,
      volumeBuy30mUsd: tradeData?.volumeBuy30mUsd,
      volumeBuy1hUsd: tradeData?.volumeBuy1hUsd,
      volumeBuy24hUsd: tradeData?.volumeBuy24hUsd,
      volumeSell1mUsd: tradeData?.volumeSell1mUsd,
      volumeSell5mUsd: tradeData?.volumeSell5mUsd,
      volumeSell30mUsd: tradeData?.volumeSell30mUsd,
      volumeSell1hUsd: tradeData?.volumeSell1hUsd,
      volumeSell24hUsd: tradeData?.volumeSell24hUsd,
      uniqueWallets1m: tradeData?.uniqueWallets1m,
      uniqueWallets5m: tradeData?.uniqueWallets5m,
      uniqueWallets30m: tradeData?.uniqueWallets30m,
      uniqueWallets1h: tradeData?.uniqueWallets1h,
      uniqueWallets24h: tradeData?.uniqueWallets24h,
      trades1m: tradeData?.trades1m,
      trades5m: tradeData?.trades5m,
      trades30m: tradeData?.trades30m,
      trades1h: tradeData?.trades1h,
      trades24h: tradeData?.trades24h,
      buys1m: tradeData?.buys1m,
      buys5m: tradeData?.buys5m,
      buys30m: tradeData?.buys30m,
      buys1h: tradeData?.buys1h,
      buys24h: tradeData?.buys24h,
      sells1m: tradeData?.sells1m,
      sells5m: tradeData?.sells5m,
      sells30m: tradeData?.sells30m,
      sells1h: tradeData?.sells1h,
      sells24h: tradeData?.sells24h,
      priceChange1mPercent: tradeData?.priceChange1mPercent ?? baseFilterState.priceChange1mPercent,
      priceChange5mPercent: tradeData?.priceChange5mPercent ?? baseFilterState.priceChange5mPercent,
      priceChange30mPercent: tradeData?.priceChange30mPercent ?? baseFilterState.priceChange30mPercent,
      priceChange1hPercent: tradeData?.priceChange1hPercent ?? baseFilterState.priceChange1hPercent,
      priceChange24hPercent: tradeData?.priceChange24hPercent ?? baseFilterState.priceChange24hPercent,
    });

    if ((tradeData?.volume5mUsd ?? 0) < settings.filters.minVolume5mUsd) {
      return { passed: false, rejectReason: "5m volume below floor", metrics, filterState: baseFilterState };
    }

    if ((tradeData?.uniqueWallets5m ?? 0) < settings.filters.minUniqueBuyers5m) {
      return { passed: false, rejectReason: "unique buyers below floor", metrics, filterState: baseFilterState };
    }

    const buySellRatio = (tradeData?.volumeBuy5mUsd ?? 0) / Math.max(tradeData?.volumeSell5mUsd ?? 0, 1);
    metrics.buySellRatio = buySellRatio;
    baseFilterState.buySellRatio = buySellRatio;
    if (buySellRatio < settings.filters.minBuySellRatio) {
      return { passed: false, rejectReason: "buy/sell ratio too weak", metrics, filterState: baseFilterState };
    }

    const priceChange5m = tradeData?.priceChange5mPercent ?? merged.priceChange5mPercent ?? 0;
    metrics.priceChange5mPercent = priceChange5m;
    baseFilterState.priceChange5mPercent = priceChange5m;
    if (priceChange5m <= -settings.filters.maxNegativePriceChange5mPercent) {
      return { passed: false, rejectReason: "price already dumping", metrics, filterState: baseFilterState };
    }

    if (!mintAuthorities) {
      return { passed: false, rejectReason: "mint account unavailable", metrics, filterState: baseFilterState };
    }

    Object.assign(baseFilterState, {
      decimals: mintAuthorities.decimals,
      mintAuthorityActive: Boolean(mintAuthorities.mintAuthority),
      freezeAuthorityActive: Boolean(mintAuthorities.freezeAuthority),
    });

    if (mintAuthorities.mintAuthority) {
      return { passed: false, rejectReason: "mint authority still active", metrics, filterState: baseFilterState };
    }

    if (mintAuthorities.freezeAuthority) {
      return { passed: false, rejectReason: "freeze authority still active", metrics, filterState: baseFilterState };
    }

    const holderConcentration = await this.helius.getHolderConcentration(mint, mintAuthorities.supplyRaw);
    metrics.holderConcentration = holderConcentration;
    Object.assign(baseFilterState, {
      top10HolderPercent: holderConcentration?.top10Percent,
      largestHolderPercent: holderConcentration?.largestHolderPercent,
      largestAccountsCount: holderConcentration?.largestAccountsCount,
      largestHolderAddress: holderConcentration?.largestHolderAddress,
    });

    if (!holderConcentration) {
      return { passed: false, rejectReason: "holder concentration unavailable", metrics, filterState: baseFilterState };
    }

    if (holderConcentration.top10Percent > settings.filters.maxTop10HolderPercent) {
      return { passed: false, rejectReason: "top10 concentration too high", metrics, filterState: baseFilterState };
    }

    if (holderConcentration.largestHolderPercent > settings.filters.maxSingleHolderPercent) {
      return { passed: false, rejectReason: "largest holder concentration too high", metrics, filterState: baseFilterState };
    }

    const shouldRunDeepSecurity = (merged.liquidityUsd ?? 0) >= settings.filters.securityCheckMinLiquidityUsd
      || (tradeData?.volume5mUsd ?? 0) >= settings.filters.minVolume5mUsd * settings.filters.securityCheckVolumeMultiplier;

    if (shouldRunDeepSecurity) {
      const security = await this.birdeye.getTokenSecurity(mint);
      metrics.security = security;
      Object.assign(baseFilterState, {
        creatorBalancePercent: security?.creatorBalancePercent,
        ownerBalancePercent: security?.ownerBalancePercent,
        updateAuthorityBalancePercent: security?.updateAuthorityBalancePercent,
        top10UserPercent: security?.top10UserPercent,
        top10HolderPercent: baseFilterState.top10HolderPercent ?? security?.top10HolderPercent,
        transferFeeEnabled: security?.transferFeeEnabled,
        transferFeePercent: security?.transferFeePercent,
        trueToken: security?.trueToken,
        token2022: security?.token2022,
        nonTransferable: security?.nonTransferable,
        fakeToken: security?.fakeToken,
        honeypot: security?.honeypot,
        freezeable: security?.freezeable,
        mutableMetadata: security?.mutableMetadata,
        securityCheckedAt: Date.now(),
      });

      if (!security) {
        return { passed: false, rejectReason: "deep security unavailable", metrics, filterState: baseFilterState };
      }

      if (security.fakeToken) {
        return { passed: false, rejectReason: "fake token flagged by Birdeye", metrics, filterState: baseFilterState };
      }

      if (security.honeypot) {
        return { passed: false, rejectReason: "honeypot risk flagged by Birdeye", metrics, filterState: baseFilterState };
      }

      if (security.freezeable === true) {
        return { passed: false, rejectReason: "token remains freezeable", metrics, filterState: baseFilterState };
      }

      if (security.mintAuthorityEnabled === true) {
        return { passed: false, rejectReason: "token remains mintable", metrics, filterState: baseFilterState };
      }

      if ((security.transferFeePercent ?? 0) > settings.filters.maxTransferFeePercent) {
        return { passed: false, rejectReason: "transfer fee above allowed ceiling", metrics, filterState: baseFilterState };
      }
    }

    const entryPriceUsd = tradeData?.priceUsd ?? livePriceUsd ?? merged.priceUsd;
    if (!entryPriceUsd || entryPriceUsd <= 0) {
      return { passed: false, rejectReason: "entry price unavailable", metrics, filterState: baseFilterState };
    }
    baseFilterState.priceUsd = entryPriceUsd;

    return {
      passed: true,
      metrics,
      entryPriceUsd,
      filterState: baseFilterState,
    };
  }

  private mergeDiscoveryMetrics(
    detail: DiscoveryToken | null,
    baselineMetrics: Record<string, unknown> | null,
  ): CandidateFilterState & { graduatedAt: number | null } {
    const baseline = this.extractBaselineDiscovery(baselineMetrics);

    return {
      platformId: detail?.platformId ?? this.readString(baseline, "platformId"),
      creationAt: detail?.creationAt ?? this.readNumber(baseline, "creationAt"),
      recentListingAt: detail?.recentListingAt ?? this.readNumber(baseline, "recentListingAt"),
      lastTradeAt: detail?.lastTradeAt ?? this.readNumber(baseline, "lastTradeAt"),
      decimals: detail?.decimals ?? this.readNumber(baseline, "decimals"),
      progressPercent: detail?.progressPercent ?? this.readNumber(baseline, "progressPercent"),
      priceUsd: detail?.priceUsd ?? this.readNumber(baseline, "priceUsd"),
      liquidityUsd: detail?.liquidityUsd ?? this.readNumber(baseline, "liquidityUsd"),
      marketCapUsd: detail?.marketCapUsd ?? this.readNumber(baseline, "marketCapUsd"),
      fdvUsd: detail?.fdvUsd ?? this.readNumber(baseline, "fdvUsd"),
      totalSupply: detail?.totalSupply ?? this.readNumber(baseline, "totalSupply"),
      circulatingSupply: detail?.circulatingSupply ?? this.readNumber(baseline, "circulatingSupply"),
      holders: detail?.holders ?? this.readNumber(baseline, "holders"),
      volume1mUsd: detail?.volume1mUsd ?? this.readNumber(baseline, "volume1mUsd"),
      volume5mUsd: detail?.volume5mUsd ?? this.readNumber(baseline, "volume5mUsd"),
      volume30mUsd: detail?.volume30mUsd ?? this.readNumber(baseline, "volume30mUsd"),
      volume1hUsd: detail?.volume1hUsd ?? this.readNumber(baseline, "volume1hUsd"),
      volume24hUsd: detail?.volume24hUsd ?? this.readNumber(baseline, "volume24hUsd"),
      volume1mChangePercent: detail?.volume1mChangePercent ?? this.readNumber(baseline, "volume1mChangePercent"),
      volume5mChangePercent: detail?.volume5mChangePercent ?? this.readNumber(baseline, "volume5mChangePercent"),
      volume30mChangePercent: detail?.volume30mChangePercent ?? this.readNumber(baseline, "volume30mChangePercent"),
      volume1hChangePercent: detail?.volume1hChangePercent ?? this.readNumber(baseline, "volume1hChangePercent"),
      volume24hChangePercent: detail?.volume24hChangePercent ?? this.readNumber(baseline, "volume24hChangePercent"),
      trades1m: detail?.trades1m ?? this.readNumber(baseline, "trades1m"),
      trades5m: detail?.trades5m ?? this.readNumber(baseline, "trades5m"),
      trades30m: detail?.trades30m ?? this.readNumber(baseline, "trades30m"),
      trades1h: detail?.trades1h ?? this.readNumber(baseline, "trades1h"),
      trades24h: detail?.trades24h ?? this.readNumber(baseline, "trades24h"),
      priceChange1mPercent: detail?.priceChange1mPercent ?? this.readNumber(baseline, "priceChange1mPercent"),
      priceChange5mPercent: detail?.priceChange5mPercent ?? this.readNumber(baseline, "priceChange5mPercent"),
      priceChange30mPercent: detail?.priceChange30mPercent ?? this.readNumber(baseline, "priceChange30mPercent"),
      priceChange1hPercent: detail?.priceChange1hPercent ?? this.readNumber(baseline, "priceChange1hPercent"),
      priceChange24hPercent: detail?.priceChange24hPercent ?? this.readNumber(baseline, "priceChange24hPercent"),
      source: detail?.source ?? this.readString(baseline, "source"),
      creator: detail?.creator ?? this.readString(baseline, "creator"),
      graduatedAt: detail?.graduatedAt ?? this.readNumber(baseline, "graduatedAt"),
    };
  }

  private toDiscoveryFilterState(token: DiscoveryToken): CandidateFilterState {
    return {
      platformId: token.platformId,
      creationAt: token.creationAt,
      recentListingAt: token.recentListingAt,
      lastTradeAt: token.lastTradeAt,
      decimals: token.decimals,
      progressPercent: token.progressPercent,
      priceUsd: token.priceUsd,
      liquidityUsd: token.liquidityUsd,
      marketCapUsd: token.marketCapUsd,
      fdvUsd: token.fdvUsd,
      totalSupply: token.totalSupply,
      circulatingSupply: token.circulatingSupply,
      holders: token.holders,
      volume1mUsd: token.volume1mUsd,
      volume5mUsd: token.volume5mUsd,
      volume30mUsd: token.volume30mUsd,
      volume1hUsd: token.volume1hUsd,
      volume24hUsd: token.volume24hUsd,
      volume1mChangePercent: token.volume1mChangePercent,
      volume5mChangePercent: token.volume5mChangePercent,
      volume30mChangePercent: token.volume30mChangePercent,
      volume1hChangePercent: token.volume1hChangePercent,
      volume24hChangePercent: token.volume24hChangePercent,
      trades1m: token.trades1m,
      trades5m: token.trades5m,
      trades30m: token.trades30m,
      trades1h: token.trades1h,
      trades24h: token.trades24h,
      priceChange1mPercent: token.priceChange1mPercent,
      priceChange5mPercent: token.priceChange5mPercent,
      priceChange30mPercent: token.priceChange30mPercent,
      priceChange1hPercent: token.priceChange1hPercent,
      priceChange24hPercent: token.priceChange24hPercent,
      source: token.source,
      creator: token.creator,
    };
  }

  private readNumber(source: Record<string, unknown>, key: string): number | null {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readString(source: Record<string, unknown>, key: string): string | null {
    const value = source[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private extractBaselineDiscovery(baselineMetrics: Record<string, unknown> | null): Record<string, unknown> {
    const baseline = (baselineMetrics ?? {}) as Record<string, unknown>;
    return baseline.detail && typeof baseline.detail === "object"
      ? baseline.detail as Record<string, unknown>
      : baseline;
  }

  private toCandidateData(input: CandidateFilterState, evaluated: boolean) {
    return {
      platformId: input.platformId ?? null,
      creationAt: toOptionalDate(input.creationAt),
      recentListingAt: toOptionalDate(input.recentListingAt),
      lastTradeAt: toOptionalDate(input.lastTradeAt),
      decimals: input.decimals ?? null,
      progressPercent: input.progressPercent ?? null,
      priceUsd: input.priceUsd ?? null,
      liquidityUsd: input.liquidityUsd ?? null,
      marketCapUsd: input.marketCapUsd ?? null,
      fdvUsd: input.fdvUsd ?? null,
      totalSupply: input.totalSupply ?? null,
      circulatingSupply: input.circulatingSupply ?? null,
      holders: input.holders ?? null,
      volume1mUsd: input.volume1mUsd ?? null,
      volume5mUsd: input.volume5mUsd ?? null,
      volume30mUsd: input.volume30mUsd ?? null,
      volume1hUsd: input.volume1hUsd ?? null,
      volume24hUsd: input.volume24hUsd ?? null,
      volume1mChangePercent: input.volume1mChangePercent ?? null,
      volume5mChangePercent: input.volume5mChangePercent ?? null,
      volume30mChangePercent: input.volume30mChangePercent ?? null,
      volume1hChangePercent: input.volume1hChangePercent ?? null,
      volume24hChangePercent: input.volume24hChangePercent ?? null,
      volumeBuy1mUsd: input.volumeBuy1mUsd ?? null,
      volumeBuy5mUsd: input.volumeBuy5mUsd ?? null,
      volumeBuy30mUsd: input.volumeBuy30mUsd ?? null,
      volumeBuy1hUsd: input.volumeBuy1hUsd ?? null,
      volumeBuy24hUsd: input.volumeBuy24hUsd ?? null,
      volumeSell1mUsd: input.volumeSell1mUsd ?? null,
      volumeSell5mUsd: input.volumeSell5mUsd ?? null,
      volumeSell30mUsd: input.volumeSell30mUsd ?? null,
      volumeSell1hUsd: input.volumeSell1hUsd ?? null,
      volumeSell24hUsd: input.volumeSell24hUsd ?? null,
      uniqueWallets1m: input.uniqueWallets1m ?? null,
      uniqueWallets5m: input.uniqueWallets5m ?? null,
      uniqueWallets30m: input.uniqueWallets30m ?? null,
      uniqueWallets1h: input.uniqueWallets1h ?? null,
      uniqueWallets24h: input.uniqueWallets24h ?? null,
      trades1m: input.trades1m ?? null,
      trades5m: input.trades5m ?? null,
      trades30m: input.trades30m ?? null,
      trades1h: input.trades1h ?? null,
      trades24h: input.trades24h ?? null,
      buys1m: input.buys1m ?? null,
      buys5m: input.buys5m ?? null,
      buys30m: input.buys30m ?? null,
      buys1h: input.buys1h ?? null,
      buys24h: input.buys24h ?? null,
      sells1m: input.sells1m ?? null,
      sells5m: input.sells5m ?? null,
      sells30m: input.sells30m ?? null,
      sells1h: input.sells1h ?? null,
      sells24h: input.sells24h ?? null,
      buySellRatio: input.buySellRatio ?? null,
      priceChange1mPercent: input.priceChange1mPercent ?? null,
      priceChange5mPercent: input.priceChange5mPercent ?? null,
      priceChange30mPercent: input.priceChange30mPercent ?? null,
      priceChange1hPercent: input.priceChange1hPercent ?? null,
      priceChange24hPercent: input.priceChange24hPercent ?? null,
      graduationAgeSeconds: input.graduationAgeSeconds ?? null,
      top10HolderPercent: input.top10HolderPercent ?? null,
      largestHolderPercent: input.largestHolderPercent ?? null,
      largestAccountsCount: input.largestAccountsCount ?? null,
      largestHolderAddress: input.largestHolderAddress ?? null,
      creatorBalancePercent: input.creatorBalancePercent ?? null,
      ownerBalancePercent: input.ownerBalancePercent ?? null,
      updateAuthorityBalancePercent: input.updateAuthorityBalancePercent ?? null,
      top10UserPercent: input.top10UserPercent ?? null,
      mintAuthorityActive: input.mintAuthorityActive ?? null,
      freezeAuthorityActive: input.freezeAuthorityActive ?? null,
      transferFeeEnabled: input.transferFeeEnabled ?? null,
      transferFeePercent: input.transferFeePercent ?? null,
      trueToken: input.trueToken ?? null,
      token2022: input.token2022 ?? null,
      nonTransferable: input.nonTransferable ?? null,
      fakeToken: input.fakeToken ?? null,
      honeypot: input.honeypot ?? null,
      freezeable: input.freezeable ?? null,
      mutableMetadata: input.mutableMetadata ?? null,
      lastFilterSnapshotAt: new Date(),
      securityCheckedAt: evaluated ? toOptionalDate(input.securityCheckedAt) : null,
    };
  }
}
