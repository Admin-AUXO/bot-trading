import { EventEmitter } from "events";
import pLimit from "p-limit";
import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import {
  runFreshnessCheck,
  runHolderCountCheck,
  runLiquidityMarketCapChecks,
  runSecurityChecks,
  runTradeDataChecks,
} from "../utils/token-filters.js";
import type { RuntimeState } from "../core/runtime-state.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { PositionTracker } from "../core/position-tracker.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";
import type { ExitMonitor } from "../core/exit-monitor.js";
import type { RegimeDetector } from "../core/regime-detector.js";
import type { HeliusService } from "../services/helius.js";
import type { BirdeyeService } from "../services/birdeye.js";
import type { MarketRouter } from "../services/market-router.js";
import type {
  ApiCallPurpose,
  ExecutionScope,
  SignalResult,
  MemeToken,
  JsonValue,
  TokenOverview,
  TradeData,
} from "../utils/types.js";
import { buildSignalTimingMetadata } from "../utils/timing-metadata.js";

const log = createChildLogger("s2-graduation");
const DEFAULT_SCOPE: ExecutionScope = { mode: config.tradeMode, configProfile: "default" };
type S2RuntimeConfig = RuntimeState["strategyConfigs"]["S2_GRADUATION"];

interface GraduationFilterResult extends SignalResult {
  overview: TokenOverview | null;
  tradeData: TradeData | null;
}

export class GraduationStrategy extends EventEmitter {
  private scanInterval?: ReturnType<typeof setInterval>;
  private catchupInterval?: ReturnType<typeof setInterval>;
  private fallbackInterval?: ReturnType<typeof setInterval>;
  private processingTokens: Set<string> = new Set();
  private pendingGraduation: Map<string, { token: MemeToken; deadline: number }> = new Map();
  private pendingEntryDelays: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private recentSeedCooldownUntil = new Map<string, number>();
  private scanInFlight = false;
  private catchupInFlight = false;
  private fallbackInFlight = false;
  private activeEntryEvaluations = 0;
  private readonly runtimeState?: RuntimeState;
  private readonly fallbackConfig: S2RuntimeConfig;
  private readonly fallbackScope: ExecutionScope;

  constructor(
    private riskManager: RiskManager,
    private positionTracker: PositionTracker,
    private tradeExecutor: ITradeExecutor,
    private exitMonitor: ExitMonitor,
    private regimeDetector: RegimeDetector,
    private helius: HeliusService,
    private marketRouter: Pick<MarketRouter, "getRecentSeeds" | "prefilterCandidates">,
    private birdeye: BirdeyeService,
    options?: {
      runtimeState?: RuntimeState;
      scope?: ExecutionScope;
      strategyConfig?: typeof config.strategies.s2;
    },
  ) {
    super();
    this.runtimeState = options?.runtimeState;
    this.fallbackScope = options?.scope ?? DEFAULT_SCOPE;
    this.fallbackConfig = options?.strategyConfig ?? config.strategies.s2;
  }

  private get scope(): ExecutionScope {
    return this.runtimeState?.scope ?? this.fallbackScope;
  }

  private get cfg(): S2RuntimeConfig {
    return this.runtimeState?.strategyConfigs.S2_GRADUATION ?? this.fallbackConfig;
  }

  async start(): Promise<void> {
    this.scanInterval = setInterval(() => {
      void this.runSeedScan().catch((err) => {
        log.error({ err }, "graduation scan cycle failed");
      });
    }, this.cfg.scanIntervalMs);

    this.catchupInterval = setInterval(() => {
      void this.runCatchupScan().catch((err) => {
        log.error({ err }, "graduation catch-up scan failed");
      });
    }, config.birdeye.s2CatchupIntervalMs);

    if (this.cfg.enableNewListingFallback) {
      this.fallbackInterval = setInterval(() => {
        void this.runFallbackScan().catch((err) => {
          log.error({ err }, "graduation fallback scan failed");
        });
      }, this.cfg.fallbackScanIntervalMs);
    }

    void this.runSeedScan().catch((err) => {
      log.error({ err }, "initial graduation seed scan failed");
    });
    void this.runCatchupScan().catch((err) => {
      log.error({ err }, "initial graduation catch-up scan failed");
    });
    log.info("S2 graduation strategy started");
  }

  stop(): void {
    if (this.scanInterval) clearInterval(this.scanInterval);
    if (this.catchupInterval) clearInterval(this.catchupInterval);
    if (this.fallbackInterval) clearInterval(this.fallbackInterval);
    for (const [, handle] of this.pendingEntryDelays) clearTimeout(handle);
    this.pendingEntryDelays.clear();
    this.pendingGraduation.clear();
    this.recentSeedCooldownUntil.clear();
    log.info("S2 graduation strategy stopped");
  }

  private async runSeedScan(): Promise<void> {
    if (this.scanInFlight) return;
    this.scanInFlight = true;
    try {
      if (this.regimeDetector.getRegime() === "RISK_OFF") return;
      if (!this.hasEntryEvaluationHeadroom("S2 seed scan")) return;

      await this.checkPendingGraduations();

      const seeds = await this.marketRouter.getRecentSeeds({
        limit: Math.max(this.cfg.memeListLimit, this.cfg.fallbackListingsBatchSize),
      });
      if (seeds.length === 0) return;

      const available = seeds.filter((seed) =>
        !this.processingTokens.has(seed.address)
        && !this.pendingGraduation.has(seed.address)
        && !this.pendingEntryDelays.has(seed.address)
        && !this.positionTracker.holdsToken(seed.address, this.scope)
        && this.shouldInspectRecentSeed(seed.address),
      );
      if (available.length === 0) return;

      const prefilter = await this.marketRouter.prefilterCandidates(available.map((seed) => seed.address));
      const limit = pLimit(this.cfg.fallbackScanConcurrency);
      const shortlisted = available
        .filter((seed) => {
          const result = prefilter.get(seed.address);
          if (!result?.passed) return false;
          return (result.liquidityUsd ?? 0) <= 0 || (result.liquidityUsd ?? 0) >= this.cfg.minLiquidity;
        })
        .filter((seed) => seed.marketCap <= 0 || seed.marketCap <= this.cfg.maxMarketCap * 2)
        .slice(0, this.cfg.memeListLimit);

      await Promise.allSettled(
        shortlisted.map((seed) => limit(() => this.processRecentSeed(seed.address))),
      );
    } finally {
      this.scanInFlight = false;
    }
  }

  private async runCatchupScan(): Promise<void> {
    if (this.catchupInFlight) return;
    this.catchupInFlight = true;
    try {
      if (this.regimeDetector.getRegime() === "RISK_OFF") return;
      if (!this.hasEntryEvaluationHeadroom("S2 catch-up scan")) return;

      const [nearGrad, justGrad] = await Promise.all([
        this.birdeye.getMemeTokenList({
          graduated: false,
          minProgressPercent: this.cfg.nearGradPercent,
          limit: this.cfg.memeListLimit,
        }, this.apiMeta("ENTRY_SCAN", false, this.cfg.memeListLimit)),
        this.birdeye.getMemeTokenList({
          graduated: true,
          minGraduatedTime: Math.floor(Date.now() / 1000) - this.cfg.justGraduatedLookbackSeconds,
          limit: this.cfg.memeListLimit,
        }, this.apiMeta("ENTRY_SCAN", false, this.cfg.memeListLimit)),
      ]);

      const candidates = [...nearGrad, ...justGrad];
      for (const token of candidates) {
        if (this.processingTokens.has(token.address)) continue;
        if (this.pendingGraduation.has(token.address)) continue;
        if (this.pendingEntryDelays.has(token.address)) continue;
        this.processingTokens.add(token.address);

        this.processCandidate(token).finally(() => {
          this.processingTokens.delete(token.address);
        });
      }
    } finally {
      this.catchupInFlight = false;
    }
  }

  private async runFallbackScan(): Promise<void> {
    if (!this.cfg.enableNewListingFallback) return;
    if (this.fallbackInFlight) return;
    this.fallbackInFlight = true;
    try {
      if (!this.hasEntryEvaluationHeadroom("S2 fallback scan")) return;

      const listings = await this.birdeye.getNewListings(this.apiMeta("ENTRY_SCAN", false, this.cfg.fallbackListingsBatchSize));
      const limit = pLimit(this.cfg.fallbackScanConcurrency);
      const candidates = (listings as Array<Record<string, unknown>>)
        .map((listing) => (typeof listing.address === "string" ? listing.address : ""))
        .filter((address) =>
          !!address
          && !this.processingTokens.has(address)
          && !this.pendingGraduation.has(address)
          && !this.pendingEntryDelays.has(address),
        );

      await Promise.allSettled(
        candidates.map((address) =>
          limit(() => this.processFallbackListing(address)),
        ),
      );
    } finally {
      this.fallbackInFlight = false;
    }
  }

  private async processFallbackListing(address: string): Promise<void> {
    this.processingTokens.add(address);
    try {
      const detail = await this.withEntryEvaluationSlot(
        "S2 fallback listing detail",
        address,
        () => this.birdeye.getMemeTokenDetail(address, this.apiMeta("ENTRY_SCAN")),
      );
      if (detail?.graduated) {
        await this.processCandidate(detail);
      }
    } finally {
      this.processingTokens.delete(address);
    }
  }

  private async processRecentSeed(address: string): Promise<void> {
    this.processingTokens.add(address);
    this.recentSeedCooldownUntil.set(address, Date.now() + config.birdeye.s2CatchupIntervalMs);
    try {
      const detail = await this.withEntryEvaluationSlot(
        "S2 recent seed detail",
        address,
        () => this.birdeye.getMemeTokenDetail(address, this.apiMeta("ENTRY_SCAN")),
      );
      if (!detail) return;
      if (!detail.graduated && detail.progressPercent < this.cfg.nearGradPercent) return;
      await this.processCandidate(detail);
    } finally {
      this.processingTokens.delete(address);
    }
  }

  private shouldInspectRecentSeed(address: string): boolean {
    const cooldownUntil = this.recentSeedCooldownUntil.get(address) ?? 0;
    if (cooldownUntil <= Date.now()) {
      this.recentSeedCooldownUntil.delete(address);
      return true;
    }
    return false;
  }

  private async checkPendingGraduations(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];
    const toCheck: Array<{ address: string; token: MemeToken }> = [];

    for (const [address, entry] of this.pendingGraduation) {
      if (now >= entry.deadline) {
        expired.push(address);
      } else {
        toCheck.push({ address, token: entry.token });
      }
    }

    for (const address of expired) this.pendingGraduation.delete(address);
    if (toCheck.length === 0) return;

    if (!this.hasEntryEvaluationHeadroom("S2 pending graduation recheck")) return;

    for (const { address } of toCheck) {
      const detail = await this.withEntryEvaluationSlot(
        "S2 pending graduation detail",
        address,
        () => this.birdeye.getMemeTokenDetail(address, this.apiMeta("ENTRY_SCAN")),
      );
      if (detail?.graduated) {
        this.pendingGraduation.delete(address);
        await this.onGraduated(detail);
      }
    }
  }

  private async processCandidate(token: MemeToken): Promise<void> {
    if (token.graduated) {
      await this.onGraduated(token);
    } else {
      this.pendingGraduation.set(token.address, { token, deadline: Date.now() + this.cfg.graduationPendingExpiryMs });
    }
  }

  private async onGraduated(token: MemeToken): Promise<void> {
    const detectedAtMs = Date.now();
    await this.withEntryEvaluationSlot("S2 graduated candidate", token.address, async () => {
      await db.graduationEvent.create({
        data: {
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          platform: token.source,
          creator: token.creator,
          wasTraded: false,
        },
      });

      const delayMs = this.cfg.entryDelayMinutes * 60_000;
      const handle = setTimeout(() => {
        this.runFilterAndTrade(token, null, detectedAtMs).catch((err) => {
          log.error({ err, token: token.address }, "entry after delay failed");
        });
      }, delayMs);

      this.pendingEntryDelays.set(token.address, handle);
    });
  }

  private async runFilterAndTrade(token: MemeToken, priceAtSignal: number | null, detectedAtMs: number): Promise<void> {
    this.pendingEntryDelays.delete(token.address);

    if (this.positionTracker.holdsToken(token.address, this.scope)) return;

    const filterStartedAtMs = Date.now();
    const signal = await this.withEntryEvaluationSlot(
      "S2 delayed entry",
      token.address,
      () => this.runFilters(token),
    );
    const filterCompletedAtMs = Date.now();
    if (!signal) return;

    const prefilterLiquidity = typeof signal.filterResults.prefilterLiquidityUsd === "number"
      ? signal.filterResults.prefilterLiquidityUsd
      : null;
    const prefilterPrice = typeof signal.filterResults.prefilterPriceUsd === "number"
      ? signal.filterResults.prefilterPriceUsd
      : null;
    const signalLiquidity = signal.overview?.liquidity ?? prefilterLiquidity;
    const signalMarketCap = signal.overview?.marketCap ?? null;
    const signalVolume5m = signal.tradeData?.volume5m ?? signal.overview?.volume5m ?? null;
    const signalBuyPressure = signal.tradeData && signal.tradeData.volume5m > 0
      ? (signal.tradeData.volumeBuy5m / signal.tradeData.volume5m) * 100
      : signal.overview?.buyPercent ?? null;
    const signalPrice = signal.overview?.price ?? prefilterPrice ?? priceAtSignal;
    const signalCreatedAtMs = Date.now();
    const signalTimingMetadata = buildSignalTimingMetadata({
      detectedAtMs,
      filterStartedAtMs,
      filterCompletedAtMs,
      signalCreatedAtMs,
      intentionalDelayMs: this.cfg.entryDelayMinutes * 60_000,
    });

    await db.signal.create({
      data: {
        mode: this.scope.mode,
        configProfile: this.scope.configProfile,
        strategy: "S2_GRADUATION",
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        signalType: "graduation",
        source: token.source,
        passed: signal.passed,
        rejectReason: signal.rejectReason ?? null,
        filterResults: signal.filterResults,
        metadata: signalTimingMetadata,
        regime: this.regimeDetector.getRegime(),
        tokenLiquidity: signalLiquidity,
        tokenMcap: signalMarketCap,
        tokenVolume5m: signalVolume5m,
        buyPressure: signalBuyPressure,
        priceAtSignal: signalPrice,
        detectedAt: new Date(detectedAtMs),
      },
    });

    if (!signal.passed) {
      log.info({ token: token.symbol, reason: signal.rejectReason }, "graduation signal rejected");
      return;
    }

    const check = this.riskManager.canOpenPosition("S2_GRADUATION");
    if (!check.allowed) return;

    const positionSize = this.riskManager.getPositionSize("S2_GRADUATION");

    const result = await this.tradeExecutor.executeBuy({
      strategy: "S2_GRADUATION",
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      amountSol: positionSize,
      maxSlippageBps: this.cfg.maxSlippageBps,
      regime: this.regimeDetector.getRegime(),
      platform: token.source,
      entryVolume5m: signal.tradeData?.volume5m ?? signal.overview?.volume5m ?? 0,
      entryLiquidity: signal.overview?.liquidity ?? undefined,
      entryMcap: signal.overview?.marketCap ?? undefined,
      entryHolders: signal.overview?.holder ?? undefined,
      entryBuyPressure: signalBuyPressure ?? undefined,
      signalDetectedAtMs: detectedAtMs,
      signalCreatedAtMs,
      filterCompletedAtMs,
      timingMetadata: signalTimingMetadata,
    });

    if (result.success) {
      const positions = this.positionTracker.getByStrategy("S2_GRADUATION", this.scope);
      const newPos = positions.find((p) => p.tokenAddress === token.address);
      await db.graduationEvent.updateMany({
        where: { tokenAddress: token.address },
        data: { wasTraded: true, positionId: newPos?.id ?? null },
      });
      if (newPos) this.exitMonitor.startMonitoring(newPos);
    }
  }

  private async runFilters(token: MemeToken): Promise<GraduationFilterResult> {
    const filters: Record<string, JsonValue> = { source: token.source };
    const nowSec = Date.now() / 1000;
    const graduationFreshnessCheck = runFreshnessCheck(token.graduatedTime ?? null, {
      maxAgeSeconds: this.cfg.maxGraduationAgeAtEntrySeconds,
      requireTimestamp: this.scope.mode === "LIVE",
      ageKey: "graduationAgeSec",
      label: "graduation",
    });
    Object.assign(filters, graduationFreshnessCheck.filterResults);
    if (!graduationFreshnessCheck.pass) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: graduationFreshnessCheck.reason,
        filterResults: filters,
        overview: null,
        tradeData: null,
      };
    }

    const prefilter = await this.marketRouter.prefilterCandidates([token.address]);
    const prefilterResult = prefilter.get(token.address);
    filters.prefilterSource = prefilterResult?.source ?? "DEX_SCREENER";
    filters.prefilterLiquidityUsd = prefilterResult?.liquidityUsd ?? null;
    filters.prefilterPriceUsd = prefilterResult?.priceUsd ?? null;
    filters.prefilterReason = prefilterResult?.reason ?? null;

    if (!prefilterResult?.passed) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: prefilterResult?.reason ?? "no DEX Screener market data",
        filterResults: filters,
        overview: null,
        tradeData: null,
      };
    }

    if ((prefilterResult.liquidityUsd ?? 0) > 0 && (prefilterResult.liquidityUsd ?? 0) < this.cfg.minLiquidity) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: `liquidity ${prefilterResult.liquidityUsd} < ${this.cfg.minLiquidity}`,
        filterResults: filters,
        overview: null,
        tradeData: null,
      };
    }

    const [overview, tradeData] = await Promise.all([
      this.birdeye.getTokenOverview(token.address, this.apiMeta("ENTRY_SCAN")),
      this.birdeye.getTradeData(token.address, this.apiMeta("ENTRY_SCAN")),
    ]);

    if (!overview) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: "no overview",
        filterResults: filters,
        overview: null,
        tradeData,
      };
    }

    if (tradeData) {
      filters.volumeHistory5m = tradeData.volumeHistory5m;
      filters.buyPercent = tradeData.volume5m > 0
        ? (tradeData.volumeBuy5m / tradeData.volume5m) * 100
        : overview.buyPercent;
    }

    const tradeDataCheck = runTradeDataChecks(tradeData, {
      minUniqueBuyers5m: this.cfg.minUniqueBuyers5m,
      minBuySellRatio: this.cfg.minBuySellRatio,
      requireTradeData: this.scope.mode === "LIVE" && this.cfg.requireTradeDataInLive,
    });
    Object.assign(filters, tradeDataCheck.filterResults);
    if (!tradeDataCheck.pass) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: tradeDataCheck.reason,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    const holderCountCheck = runHolderCountCheck(overview, {
      minHolderCount: this.cfg.minUniqueHolders,
    });
    Object.assign(filters, holderCountCheck.filterResults);
    if (!holderCountCheck.pass) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: holderCountCheck.reason,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    const liqCapCheck = runLiquidityMarketCapChecks(overview.liquidity, overview.marketCap, {
      minLiquidity: this.cfg.minLiquidity,
      maxMarketCap: this.cfg.maxMarketCap,
    });
    Object.assign(filters, liqCapCheck.filterResults);
    if (!liqCapCheck.pass) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: liqCapCheck.reason,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    const creator = token.creator.trim();
    filters.creatorAvailable = creator.length > 0;
    if (creator.length === 0) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: "missing creator",
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    const [sigs, creatorSigs] = await Promise.all([
      this.helius.getSignaturesForAddress(
        token.address,
        this.cfg.tokenSignatureLimit,
        this.apiMeta("ENTRY_SCAN", false, this.cfg.tokenSignatureLimit),
      ),
      this.helius.getSignaturesForAddress(
        creator,
        this.cfg.creatorSignatureLimit,
        this.apiMeta("ENTRY_SCAN", false, this.cfg.creatorSignatureLimit),
      ),
    ]);

    const recentTokenTxs = sigs.filter((s: unknown) => {
      const sig = s as Record<string, unknown>;
      const blockTime = Number(sig.blockTime ?? 0);
      return blockTime > nowSec - 60;
    });
    filters.txCount60s = recentTokenTxs.length;
    if (recentTokenTxs.length > this.cfg.maxBotTxs60s) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: "bot swarm detected",
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    const recentCreatorTxs = creatorSigs.filter((s: unknown) => {
      const sig = s as Record<string, unknown>;
      const blockTime = Number(sig.blockTime ?? 0);
      return blockTime > nowSec - this.cfg.serialDeployLookbackSeconds;
    });
    filters.creatorTxsLookback = recentCreatorTxs.length;

    if (recentCreatorTxs.length > this.cfg.maxSerialDeploys7d) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: "serial deployer",
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    const [security, holders] = await Promise.all([
      this.birdeye.getTokenSecurity(token.address, this.apiMeta("ENTRY_SCAN")),
      this.birdeye.getTokenHolders(token.address, 1, this.apiMeta("ENTRY_SCAN", false, 1)),
    ]);

    const securityCheck = runSecurityChecks(security, holders, {
      maxTop10HolderPercent: this.cfg.maxTop10HolderPercent,
      maxSingleHolderPercent: this.cfg.maxSingleHolderPercent,
    });
    Object.assign(filters, securityCheck.filterResults);
    if (!securityCheck.pass) {
      return {
        passed: false,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        rejectReason: securityCheck.reason,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    return {
      passed: true,
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      filterResults: filters,
      overview,
      tradeData,
    };
  }

  private apiMeta(purpose: ApiCallPurpose, essential = false, batchSize?: number) {
    return {
      strategy: "S2_GRADUATION" as const,
      mode: this.scope.mode,
      configProfile: this.scope.configProfile,
      purpose,
      essential,
      batchSize,
    };
  }

  private hasEntryEvaluationHeadroom(context: string): boolean {
    const capacity = this.riskManager.getEntryCapacity("S2_GRADUATION");
    if (!capacity.allowed) {
      log.info({ reason: capacity.reason }, `${context} skipped — no S2 entry capacity`);
      return false;
    }

    if (capacity.remaining <= this.activeEntryEvaluations) {
      log.info(
        { remaining: capacity.remaining, inFlight: this.activeEntryEvaluations },
        `${context} skipped — S2 Birdeye evaluation slots are busy`,
      );
      return false;
    }

    return true;
  }

  private async withEntryEvaluationSlot<T>(
    context: string,
    tokenAddress: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const capacity = this.riskManager.getEntryCapacity("S2_GRADUATION");
    if (!capacity.allowed) {
      log.info({ tokenAddress, reason: capacity.reason }, `${context} skipped — no S2 entry capacity`);
      return null;
    }

    if (capacity.remaining <= this.activeEntryEvaluations) {
      log.info(
        { tokenAddress, remaining: capacity.remaining, inFlight: this.activeEntryEvaluations },
        `${context} skipped — S2 Birdeye evaluation slots are busy`,
      );
      return null;
    }

    this.activeEntryEvaluations += 1;
    try {
      return await fn();
    } finally {
      this.activeEntryEvaluations = Math.max(0, this.activeEntryEvaluations - 1);
    }
  }
}
