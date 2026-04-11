import { CandidateStatus, type Candidate } from "@prisma/client";
import { db } from "../db/client.js";
import { env } from "../config/env.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { HeliusClient } from "../services/helius-client.js";
import { ProviderBudgetService } from "../services/provider-budget-service.js";
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
const EVALUATION_POOL_MULTIPLIER = 6;

export class GraduationEngine {
  private discoveryInFlight = false;
  private evaluationInFlight = false;
  private readonly providerBudget = new ProviderBudgetService();

  constructor(
    private readonly birdeye: BirdeyeClient,
    private readonly helius: HeliusClient,
    private readonly execution: ExecutionEngine,
    private readonly risk: RiskEngine,
    private readonly config: RuntimeConfigService,
  ) {}

  async getResearchDiscoveryTokens(limit: number): Promise<DiscoveryToken[]> {
    const settings = await this.config.getSettings();
    return this.fetchDiscoveryTokens(settings, limit, false, "tradable");
  }

  async evaluateResearchToken(
    token: DiscoveryToken,
    settingsOverride?: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
  ): Promise<CandidateEvaluation> {
    const settings = settingsOverride ?? await this.config.getSettings();
    return this.evaluateCandidate(token.mint, token as unknown as Record<string, unknown>, settings);
  }

  scoreDiscoveryToken(
    token: DiscoveryToken,
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
  ): number {
    const discoveryState = this.toDiscoveryFilterState(token);
    return this.scoreFilterState(discoveryState, settings, {
      graduatedAt: token.graduatedAt,
      source: token.source,
    });
  }

  isLiveTradableSource(source: string): boolean {
    return this.isTradableSource(source);
  }

  async discover(): Promise<void> {
    if (this.discoveryInFlight) return;
    this.discoveryInFlight = true;

    try {
      const settings = await this.config.getSettings();
      const freshTokens = await this.fetchDiscoveryTokens(
        settings,
        settings.cadence.evaluationConcurrency * 20,
        true,
      );

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

  private async fetchDiscoveryTokens(
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
    limit: number,
    excludeExistingMints: boolean,
    sourceMode: "configured" | "all" | "tradable" = "configured",
  ): Promise<DiscoveryToken[]> {
    const nowUnix = Math.floor(Date.now() / 1000);
    const minGraduatedTime = nowUnix - env.DISCOVERY_LOOKBACK_SECONDS;
    const minLastTradeTime = env.DISCOVERY_QUERY_MIN_LAST_TRADE_SECONDS > 0
      ? nowUnix - env.DISCOVERY_QUERY_MIN_LAST_TRADE_SECONDS
      : null;
    const discoverySources = sourceMode === "all"
      ? ["all"]
      : sourceMode === "tradable"
      ? env.TRADABLE_SOURCES.includes("all")
        ? ["all"]
        : [...new Set(env.TRADABLE_SOURCES)]
      : env.DISCOVERY_SOURCES.includes("all")
      ? ["all"]
      : [...new Set(env.DISCOVERY_SOURCES)];
    const discoveryBudget = await this.providerBudget.canSpend("discovery", discoverySources.length * 100);
    if (!discoveryBudget.allowed) {
      logger.warn({ reason: discoveryBudget.reason }, "discovery skipped to preserve Birdeye monthly budget");
      return [];
    }

    const fetchedGroups = await Promise.all(discoverySources.map((source) => this.birdeye.getGraduatedMemeTokens({
      source,
      minGraduatedTime,
      limit,
      minLiquidityUsd: env.DISCOVERY_QUERY_MIN_LIQUIDITY_USD,
      minVolume5mUsd: env.DISCOVERY_QUERY_MIN_VOLUME_5M_USD,
      minHolders: env.DISCOVERY_QUERY_MIN_HOLDERS,
      minLastTradeTime,
      sortBy: env.DISCOVERY_SORT_BY,
      sortType: env.DISCOVERY_SORT_TYPE,
    })));
    const tokens = [...new Map(
      fetchedGroups
        .flat()
        .sort((left, right) => this.compareDiscoveryTokens(left, right))
        .map((token) => [token.mint, token] as const),
    ).values()];

    if (!excludeExistingMints || tokens.length === 0) {
      return tokens;
    }

    const existingMints = new Set(
      (
        await db.candidate.findMany({
          where: { mint: { in: tokens.map((token) => token.mint) } },
          select: { mint: true },
        })
      ).map((row) => row.mint),
    );

    return tokens.filter((token) => !existingMints.has(token.mint));
  }

  private compareDiscoveryTokens(left: DiscoveryToken, right: DiscoveryToken): number {
    const direction = env.DISCOVERY_SORT_TYPE === "asc" ? 1 : -1;
    const leftValue = this.readDiscoverySortValue(left);
    const rightValue = this.readDiscoverySortValue(right);

    if (leftValue === rightValue) {
      return ((right.lastTradeAt ?? 0) - (left.lastTradeAt ?? 0))
        || ((right.volume5mUsd ?? 0) - (left.volume5mUsd ?? 0))
        || ((right.graduatedAt ?? 0) - (left.graduatedAt ?? 0));
    }

    return leftValue > rightValue ? direction : -direction;
  }

  private readDiscoverySortValue(token: DiscoveryToken): number {
    switch (env.DISCOVERY_SORT_BY) {
      case "last_trade_unix_time":
        return token.lastTradeAt ?? 0;
      case "volume_5m_usd":
        return token.volume5mUsd ?? 0;
      case "trade_5m_count":
        return token.trades5m ?? 0;
      case "recent_listing_time":
        return token.recentListingAt ?? token.creationAt ?? 0;
      case "graduated_time":
      default:
        return token.graduatedAt ?? 0;
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
        orderBy: { scheduledEvaluationAt: "asc" },
        take: settings.cadence.evaluationConcurrency * EVALUATION_POOL_MULTIPLIER,
      });

      if (candidates.length === 0) {
        return;
      }

      const rankedCandidates = [...candidates]
        .sort((left, right) => this.scoreCandidate(right, settings) - this.scoreCandidate(left, settings))
        .slice(0, settings.cadence.evaluationConcurrency);

      const capacity = await this.risk.canOpenPosition(settings);
      if (!capacity.allowed) {
        await this.deferCandidates(
          candidates,
          capacity.retryable ? "SKIPPED" : "ERROR",
          capacity.reason ?? "risk blocked entry",
          settings.cadence.evaluationIntervalMs,
        );
        await this.risk.touchActivity("lastEvaluationAt");
        return;
      }

      for (const candidate of rankedCandidates) {
        try {
          const evaluation = await this.evaluateCandidate(
            candidate.mint,
            candidate.metrics as Record<string, unknown> | null,
            settings,
          );
          if (evaluation.deferReason) {
            await db.candidate.update({
              where: { id: candidate.id },
              data: {
                status: "SKIPPED",
                rejectReason: evaluation.deferReason,
                lastEvaluatedAt: new Date(),
                scheduledEvaluationAt: new Date(Date.now() + settings.cadence.evaluationIntervalMs),
                ...this.toCandidateData(evaluation.filterState, true),
                metrics: toJsonValue(evaluation.metrics),
              },
            });
            continue;
          }

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
            continue;
          }

          const effectiveSource = candidate.source || evaluation.filterState.source || "unknown";
          if (!this.isTradableSource(effectiveSource)) {
            await recordTokenSnapshot({
              candidateId: candidate.id,
              mint: candidate.mint,
              symbol: candidate.symbol,
              trigger: "evaluation_paper",
              ...evaluation.filterState,
              metadata: {
                ...evaluation.metrics,
                paperOnlySource: effectiveSource,
              },
            });

            await db.candidate.update({
              where: { id: candidate.id },
              data: {
                status: "REJECTED",
                rejectReason: `paper-only source: ${effectiveSource}`,
                lastEvaluatedAt: new Date(),
                ...this.toCandidateData(evaluation.filterState, true),
                metrics: toJsonValue({
                  ...evaluation.metrics,
                  paperOnlySource: effectiveSource,
                }),
              },
            });
            continue;
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

          const positionId = await this.execution.openPosition({
            candidateId: candidate.id,
            mint: candidate.mint,
            symbol: candidate.symbol,
            entryPriceUsd: evaluation.entryPriceUsd!,
            metrics: evaluation.metrics,
          });

          logger.info({ mint: candidate.mint, positionId, tradeMode: settings.tradeMode }, "candidate promoted to position");
        } catch (error) {
          await db.candidate.update({
            where: { id: candidate.id },
            data: {
              status: "ERROR",
              rejectReason: error instanceof Error ? error.message : String(error),
              lastEvaluatedAt: new Date(),
              scheduledEvaluationAt: new Date(Date.now() + settings.cadence.evaluationIntervalMs),
            },
          });
        }
      }

      await this.risk.touchActivity("lastEvaluationAt");
    } finally {
      this.evaluationInFlight = false;
    }
  }

  private async evaluateCandidate(
    mint: string,
    baselineMetrics: Record<string, unknown> | null,
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
  ): Promise<CandidateEvaluation> {
    const baseline = this.extractBaselineDiscovery(baselineMetrics);
    const baselineMerged = this.mergeDiscoveryMetrics(null, baselineMetrics);
    const baselineFilterState: CandidateFilterState = {
      ...baselineMerged,
      priceUsd: baselineMerged.priceUsd,
    };
    const shouldRefreshDetail = this.readBoolean(baseline, "graduated") !== true
      || this.readNumber(baseline, "graduatedAt") === null
      || this.readString(baseline, "source") === null;
    const evaluationBudget = await this.providerBudget.canSpend(
      "evaluation",
      (shouldRefreshDetail ? 30 : 0) + 15,
    );
    if (!evaluationBudget.allowed) {
      return {
        passed: false,
        deferReason: evaluationBudget.reason ?? "evaluation lane budget pacing blocked",
        metrics: {
          ...(baselineMetrics ?? {}),
          budget: evaluationBudget.snapshot,
        },
        filterState: baselineFilterState,
      };
    }

    const [detail, mintAuthorities] = await Promise.all([
      shouldRefreshDetail ? this.birdeye.getMemeTokenDetail(mint) : Promise.resolve(null),
      this.helius.getMintAuthorities(mint),
    ]);

    const metrics: Record<string, unknown> = {
      ...(baselineMetrics ?? {}),
      detail,
      mintAuthorities,
    };

    const merged = this.mergeDiscoveryMetrics(detail, baselineMetrics);
    const baseFilterState: CandidateFilterState = {
      ...merged,
      priceUsd: merged.priceUsd,
    };

    const graduated = detail?.graduated ?? this.readBoolean(baseline, "graduated");
    if (!graduated || !merged.graduatedAt) {
      return { passed: false, rejectReason: "token is not confirmed as graduated", metrics, filterState: baseFilterState };
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - merged.graduatedAt;
    metrics.ageSeconds = ageSeconds;
    baseFilterState.graduationAgeSeconds = ageSeconds;
    if (ageSeconds > settings.filters.maxGraduationAgeSeconds) {
      return { passed: false, rejectReason: `graduation too old: ${ageSeconds}s`, metrics, filterState: baseFilterState };
    }

    const softIssues: string[] = [];
    const liquidityUsd = merged.liquidityUsd ?? 0;
    if (liquidityUsd < settings.filters.minLiquidityUsd) {
      if (liquidityUsd < settings.filters.minLiquidityUsd * 0.65) {
        return { passed: false, rejectReason: "liquidity far below floor", metrics, filterState: baseFilterState };
      }
      softIssues.push("liquidity below floor");
    }

    const marketCapUsd = merged.marketCapUsd ?? Number.MAX_SAFE_INTEGER;
    if (marketCapUsd > settings.filters.maxMarketCapUsd) {
      if (marketCapUsd > settings.filters.maxMarketCapUsd * 1.35) {
        return { passed: false, rejectReason: "market cap far above ceiling", metrics, filterState: baseFilterState };
      }
      softIssues.push("market cap above ceiling");
    }

    const holders = merged.holders ?? 0;
    if (holders < settings.filters.minHolders) {
      if (holders < settings.filters.minHolders * 0.65) {
        return { passed: false, rejectReason: "holder count far below floor", metrics, filterState: baseFilterState };
      }
      softIssues.push("holder count below floor");
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

    const volume5mUsd = tradeData?.volume5mUsd ?? 0;
    if (volume5mUsd < settings.filters.minVolume5mUsd) {
      if (volume5mUsd < settings.filters.minVolume5mUsd * 0.65) {
        return { passed: false, rejectReason: "5m volume far below floor", metrics, filterState: baseFilterState };
      }
      softIssues.push("5m volume below floor");
    }

    const uniqueBuyers5m = tradeData?.uniqueWallets5m ?? 0;
    if (uniqueBuyers5m < settings.filters.minUniqueBuyers5m) {
      if (uniqueBuyers5m < settings.filters.minUniqueBuyers5m * 0.65) {
        return { passed: false, rejectReason: "unique buyers far below floor", metrics, filterState: baseFilterState };
      }
      softIssues.push("unique buyers below floor");
    }

    const buySellRatio = (tradeData?.volumeBuy5mUsd ?? 0) / Math.max(tradeData?.volumeSell5mUsd ?? 0, 1);
    metrics.buySellRatio = buySellRatio;
    baseFilterState.buySellRatio = buySellRatio;
    if (buySellRatio < settings.filters.minBuySellRatio) {
      if (buySellRatio < settings.filters.minBuySellRatio * 0.7) {
        return { passed: false, rejectReason: "buy/sell ratio collapsed", metrics, filterState: baseFilterState };
      }
      softIssues.push("buy/sell ratio too weak");
    }

    const priceChange5m = tradeData?.priceChange5mPercent ?? merged.priceChange5mPercent ?? 0;
    metrics.priceChange5mPercent = priceChange5m;
    baseFilterState.priceChange5mPercent = priceChange5m;
    if (priceChange5m <= -settings.filters.maxNegativePriceChange5mPercent) {
      if (priceChange5m <= -settings.filters.maxNegativePriceChange5mPercent * 1.5) {
        return { passed: false, rejectReason: "price already dumping hard", metrics, filterState: baseFilterState };
      }
      softIssues.push("price already fading");
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
      if (holderConcentration.top10Percent > settings.filters.maxTop10HolderPercent * 1.25) {
        return { passed: false, rejectReason: "top10 concentration far too high", metrics, filterState: baseFilterState };
      }
      softIssues.push("top10 concentration too high");
    }

    if (holderConcentration.largestHolderPercent > settings.filters.maxSingleHolderPercent) {
      if (holderConcentration.largestHolderPercent > settings.filters.maxSingleHolderPercent * 1.25) {
        return { passed: false, rejectReason: "largest holder concentration far too high", metrics, filterState: baseFilterState };
      }
      softIssues.push("largest holder concentration too high");
    }

    const uniqueSoftIssues = [...new Set(softIssues)];
    metrics.softIssues = uniqueSoftIssues;
    metrics.softIssueCount = uniqueSoftIssues.length;
    if (uniqueSoftIssues.length >= 2) {
      return {
        passed: false,
        rejectReason: `multiple soft weaknesses: ${uniqueSoftIssues.join(", ")}`,
        metrics,
        filterState: baseFilterState,
      };
    }

    const securityBudget = await this.providerBudget.canSpend("security", 50);
    if (!securityBudget.allowed) {
      return {
        passed: false,
        deferReason: securityBudget.reason ?? "security lane budget pacing blocked",
        metrics: {
          ...metrics,
          budget: securityBudget.snapshot,
        },
        filterState: baseFilterState,
      };
    }

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

    const entryPriceUsd = tradeData?.priceUsd ?? merged.priceUsd;
    if (!entryPriceUsd || entryPriceUsd <= 0) {
      return { passed: false, rejectReason: "entry price unavailable", metrics, filterState: baseFilterState };
    }
    baseFilterState.priceUsd = entryPriceUsd;
    const entryScore = this.scoreFilterState(baseFilterState, settings, {
      graduatedAt: merged.graduatedAt,
      source: merged.source,
    });
    metrics.entryScore = entryScore;
    metrics.exitProfile = entryScore >= 0.82 ? "runner" : entryScore >= 0.62 ? "balanced" : "scalp";

    return {
      passed: true,
      metrics,
      entryPriceUsd,
      filterState: baseFilterState,
    };
  }

  private async deferCandidates(
    candidates: Candidate[],
    status: CandidateStatus,
    reason: string,
    delayMs: number,
  ): Promise<void> {
    const scheduledEvaluationAt = new Date(Date.now() + delayMs);
    await Promise.all(candidates.map((candidate) => db.candidate.update({
      where: { id: candidate.id },
      data: {
        status,
        rejectReason: reason,
        lastEvaluatedAt: new Date(),
        scheduledEvaluationAt,
      },
    })));
  }

  private scoreCandidate(candidate: Candidate, settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>): number {
    return this.scoreFilterState({
      liquidityUsd: Number(candidate.liquidityUsd ?? 0),
      volume5mUsd: Number(candidate.volume5mUsd ?? 0),
      buySellRatio: Number(candidate.buySellRatio ?? 0),
      priceChange5mPercent: Number(candidate.priceChange5mPercent ?? 0),
      uniqueWallets5m: Number(candidate.uniqueWallets5m ?? 0),
      holders: Number(candidate.holders ?? 0),
      top10HolderPercent: Number(candidate.top10HolderPercent ?? settings.filters.maxTop10HolderPercent),
      largestHolderPercent: Number(candidate.largestHolderPercent ?? settings.filters.maxSingleHolderPercent),
    }, settings, {
      graduatedAt: candidate.graduatedAt ? Math.floor(candidate.graduatedAt.getTime() / 1000) : null,
      discoveredAtMs: candidate.discoveredAt.getTime(),
      source: candidate.source,
      status: candidate.status,
    });
  }

  private scoreFilterState(
    filterState: Pick<
      CandidateFilterState,
      | "liquidityUsd"
      | "volume5mUsd"
      | "buySellRatio"
      | "priceChange5mPercent"
      | "uniqueWallets5m"
      | "holders"
      | "top10HolderPercent"
      | "largestHolderPercent"
    >,
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
    input: {
      graduatedAt?: number | null;
      discoveredAtMs?: number | null;
      source?: string | null;
      status?: CandidateStatus;
    },
  ): number {
    const now = Date.now();
    const referenceMs = input.graduatedAt
      ? input.graduatedAt * 1000
      : input.discoveredAtMs ?? now;
    const ageSeconds = Math.max(0, (now - referenceMs) / 1000);
    const ageScore = this.clamp(1 - (ageSeconds / Math.max(settings.filters.maxGraduationAgeSeconds, 1)), 0, 1);

    const volumeScore = this.logScore(Number(filterState.volume5mUsd ?? 0), settings.filters.minVolume5mUsd);
    const ratioScore = this.clamp(
      (Number(filterState.buySellRatio ?? 0) - settings.filters.minBuySellRatio)
        / Math.max(settings.filters.minBuySellRatio, 1),
      0,
      1,
    );
    const priceScore = this.clamp(
      (Number(filterState.priceChange5mPercent ?? 0) + settings.filters.maxNegativePriceChange5mPercent)
        / Math.max(settings.filters.maxNegativePriceChange5mPercent + 20, 1),
      0,
      1,
    );
    const momentumScore = (volumeScore * 0.45) + (ratioScore * 0.35) + (priceScore * 0.2);

    const uniqueBuyerScore = this.clamp(
      Number(filterState.uniqueWallets5m ?? 0) / Math.max(settings.filters.minUniqueBuyers5m * 2, 1),
      0,
      1,
    );
    const holderScore = this.clamp(
      Number(filterState.holders ?? 0) / Math.max(settings.filters.minHolders * 2, 1),
      0,
      1,
    );
    const top10Score = this.clamp(
      1 - (Number(filterState.top10HolderPercent ?? settings.filters.maxTop10HolderPercent) / Math.max(settings.filters.maxTop10HolderPercent, 1)),
      0,
      1,
    );
    const largestHolderScore = this.clamp(
      1 - (Number(filterState.largestHolderPercent ?? settings.filters.maxSingleHolderPercent) / Math.max(settings.filters.maxSingleHolderPercent, 1)),
      0,
      1,
    );
    const structureScore = (uniqueBuyerScore * 0.5) + (holderScore * 0.25) + (top10Score * 0.15) + (largestHolderScore * 0.1);

    const liquidityScore = this.logScore(Number(filterState.liquidityUsd ?? 0), settings.filters.minLiquidityUsd);
    const exitabilityScore = (liquidityScore * 0.75) + (ageScore * 0.25);

    const sourceBoost = input.source === "pump_dot_fun" ? 0.03 : 0;
    const statusAdjustment = input.status === "ERROR"
      ? -0.05
      : input.status === "SKIPPED"
        ? -0.01
        : 0;

    return (momentumScore * 0.35) + (structureScore * 0.35) + (exitabilityScore * 0.3) + sourceBoost + statusAdjustment;
  }

  private logScore(value: number, floor: number): number {
    const normalized = Math.log1p(Math.max(value, 0)) / Math.log1p(Math.max(floor * 6, 1));
    return this.clamp(normalized, 0, 1);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
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

  private readBoolean(source: Record<string, unknown>, key: string): boolean | null {
    const value = source[key];
    return typeof value === "boolean" ? value : null;
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

  private isTradableSource(source: string): boolean {
    if (env.TRADABLE_SOURCES.includes("all")) {
      return true;
    }

    return env.TRADABLE_SOURCES.includes(source);
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
