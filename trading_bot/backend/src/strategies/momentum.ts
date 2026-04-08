import { EventEmitter } from "events";
import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import { runSecurityChecks } from "../utils/token-filters.js";
import type { RuntimeState } from "../core/runtime-state.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { PositionTracker } from "../core/position-tracker.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";
import type { ExitMonitor } from "../core/exit-monitor.js";
import type { RegimeDetector } from "../core/regime-detector.js";
import type { BirdeyeService } from "../services/birdeye.js";
import type { MarketRouter } from "../services/market-router.js";
import type {
  ApiCallPurpose,
  ExecutionScope,
  JsonValue,
  PrefilterResult,
  SeedCandidate,
  SignalResult,
  TokenOverview,
  TradeData,
} from "../utils/types.js";
import { buildSignalTimingMetadata } from "../utils/timing-metadata.js";

const log = createChildLogger("s3-momentum");
const DEFAULT_SCOPE: ExecutionScope = { mode: config.tradeMode, configProfile: "default" };
type S3RuntimeConfig = RuntimeState["strategyConfigs"]["S3_MOMENTUM"];
type SeedRouter = Pick<MarketRouter, "getMomentumSeeds" | "prefilterCandidates">;

interface MomentumCandidate {
  address: string;
  symbol: string;
  name: string;
  source: string;
  seedPriceUsd: number;
  seedLiquidityUsd: number;
  seedMarketCap: number;
  prefilterPriceUsd?: number;
  prefilterLiquidityUsd?: number;
  pairAddress?: string;
  pairCreatedAt?: number;
}

interface MomentumFilterResult extends SignalResult {
  overview: TokenOverview | null;
  tradeData: TradeData | null;
}

export class MomentumStrategy extends EventEmitter {
  private scanInterval?: ReturnType<typeof setInterval>;
  private processingTokens: Set<string> = new Set();
  private pendingTranche2: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private scanInFlight = false;
  private activeEntryEvaluations = 0;
  private readonly runtimeState?: RuntimeState;
  private readonly fallbackConfig: S3RuntimeConfig;
  private readonly fallbackScope: ExecutionScope;

  constructor(
    private riskManager: RiskManager,
    private positionTracker: PositionTracker,
    private tradeExecutor: ITradeExecutor,
    private exitMonitor: ExitMonitor,
    private regimeDetector: RegimeDetector,
    private marketRouter: SeedRouter,
    private birdeye: BirdeyeService,
    options?: {
      runtimeState?: RuntimeState;
      scope?: ExecutionScope;
      strategyConfig?: typeof config.strategies.s3;
    },
  ) {
    super();
    this.runtimeState = options?.runtimeState;
    this.fallbackScope = options?.scope ?? DEFAULT_SCOPE;
    this.fallbackConfig = options?.strategyConfig ?? config.strategies.s3;
  }

  private get scope(): ExecutionScope {
    return this.runtimeState?.scope ?? this.fallbackScope;
  }

  private get cfg(): S3RuntimeConfig {
    return this.runtimeState?.strategyConfigs.S3_MOMENTUM ?? this.fallbackConfig;
  }

  start(): void {
    this.scanInterval = setInterval(() => {
      this.runScan().catch((err) => log.error({ err }, "momentum scan cycle failed"));
    }, this.cfg.scanIntervalMs);
    void this.runScan().catch((err) => log.error({ err }, "initial momentum scan failed"));
    log.info("S3 momentum strategy started");
  }

  stop(): void {
    if (this.scanInterval) clearInterval(this.scanInterval);
    for (const [, handle] of this.pendingTranche2) clearTimeout(handle);
    this.pendingTranche2.clear();
    log.info("S3 momentum strategy stopped");
  }

  private async runScan(): Promise<void> {
    if (this.scanInFlight) return;
    this.scanInFlight = true;
    try {
      const regime = this.regimeDetector.getRegime();
      if (regime === "RISK_OFF") return;
      if (!this.hasEntryEvaluationHeadroom("S3 scan")) return;

      const seeds = await this.marketRouter.getMomentumSeeds({
        limit: this.cfg.maxCandidatesPerScan * 2,
      });
      if (seeds.length === 0) return;

      const availableSeeds = seeds.filter((seed) =>
        !this.processingTokens.has(seed.address) && !this.positionTracker.holdsToken(seed.address, this.scope),
      );
      if (availableSeeds.length === 0) return;

      const prefilter = await this.marketRouter.prefilterCandidates(availableSeeds.map((seed) => seed.address));
      const toProcess = availableSeeds
        .map((seed) => this.buildCandidate(seed, prefilter.get(seed.address)))
        .filter((candidate): candidate is MomentumCandidate => candidate !== null)
        .slice(0, this.cfg.maxCandidatesPerScan);
      if (toProcess.length === 0) return;

      for (const candidate of toProcess) this.processingTokens.add(candidate.address);

      await Promise.allSettled(
        toProcess.map((candidate) =>
          this.evaluateCandidate(candidate).finally(() => {
            this.processingTokens.delete(candidate.address);
          }),
        ),
      );
    } finally {
      this.scanInFlight = false;
    }
  }

  private async evaluateCandidate(candidate: MomentumCandidate): Promise<void> {
    if (this.positionTracker.holdsToken(candidate.address, this.scope)) return;

    const detectedAtMs = Date.now();
    const filterStartedAtMs = Date.now();
    const signal = await this.withEntryEvaluationSlot(
      "S3 candidate evaluation",
      candidate.address,
      () => this.runFilters(candidate),
    );
    const filterCompletedAtMs = Date.now();
    if (!signal) return;

    const overview = signal.overview;
    const tradeData = signal.tradeData;
    const signalPrice = overview?.price ?? candidate.prefilterPriceUsd ?? candidate.seedPriceUsd ?? null;
    const signalLiquidity = overview?.liquidity ?? candidate.prefilterLiquidityUsd ?? candidate.seedLiquidityUsd ?? null;
    const signalMarketCap = overview?.marketCap ?? candidate.seedMarketCap ?? null;
    const signalVolume5m = overview?.volume5m ?? tradeData?.volume5m ?? null;
    const signalBuyPressure = tradeData && tradeData.volume5m > 0
      ? (tradeData.volumeBuy5m / tradeData.volume5m) * 100
      : overview?.buyPercent ?? null;
    const signalCreatedAtMs = Date.now();
    const signalTimingMetadata = buildSignalTimingMetadata({
      detectedAtMs,
      filterStartedAtMs,
      filterCompletedAtMs,
      signalCreatedAtMs,
      cadenceMs: this.cfg.scanIntervalMs,
    });

    await db.signal.create({
      data: {
        mode: this.scope.mode,
        configProfile: this.scope.configProfile,
        strategy: "S3_MOMENTUM",
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        signalType: "momentum_scan",
        source: candidate.source,
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

    if (!signal.passed) return;
    if (!overview || !tradeData) return;

    const check = this.riskManager.canOpenPosition("S3_MOMENTUM");
    if (!check.allowed) return;

    const fullSize = this.riskManager.getPositionSize("S3_MOMENTUM");
    const tranche1Size = fullSize * (this.cfg.tranche1Percent / 100);

    const result = await this.tradeExecutor.executeBuy({
      strategy: "S3_MOMENTUM",
      tokenAddress: candidate.address,
      tokenSymbol: candidate.symbol,
      amountSol: tranche1Size,
      maxSlippageBps: this.cfg.maxSlippageBps,
      regime: this.regimeDetector.getRegime(),
      trancheNumber: 1,
      entryVolume5m: overview.volume5m,
      entryLiquidity: overview.liquidity,
      entryMcap: overview.marketCap,
      entryHolders: overview.holder,
      entryVolume1h: overview.volume1h,
      entryBuyPressure: signalBuyPressure ?? 0,
      signalDetectedAtMs: detectedAtMs,
      signalCreatedAtMs,
      filterCompletedAtMs,
      timingMetadata: signalTimingMetadata,
    });

    if (!result.success) return;

    const positions = this.positionTracker.getByStrategy("S3_MOMENTUM", this.scope);
    const newPos = positions.find((p) => p.tokenAddress === candidate.address);
    if (!newPos) return;

    this.exitMonitor.startMonitoring(newPos);

    const tranche2Timer = setTimeout(async () => {
      this.pendingTranche2.delete(newPos.id);
      try {
        await this.executeTranche2(newPos.id, candidate.address, candidate.symbol, fullSize);
      } catch (err) {
        log.error({ err, positionId: newPos.id }, "tranche 2 execution failed");
      }
    }, this.cfg.tranche2DelayMs);

    this.pendingTranche2.set(newPos.id, tranche2Timer);
  }

  private async executeTranche2(
    positionId: string,
    tokenAddress: string,
    tokenSymbol: string,
    fullSize: number,
  ): Promise<void> {
    const pos = this.positionTracker.getById(positionId);
    if (!pos || pos.status === "CLOSED") return;

    const tranche2Size = fullSize * (this.cfg.tranche2Percent / 100);
    const riskCheck = this.riskManager.canIncreasePosition("S3_MOMENTUM", tranche2Size);
    if (!riskCheck.allowed) {
      log.info({ token: tokenSymbol, reason: riskCheck.reason }, "tranche 2 skipped — risk manager blocked follow-on buy");
      return;
    }

    if (pos.currentPriceUsd < pos.entryPriceUsd) {
      log.info({ token: tokenSymbol }, "tranche 2 skipped — price below entry");
      return;
    }

    const [overview, tradeData] = await Promise.all([
      this.birdeye.getTokenOverview(tokenAddress, this.apiMeta("ENTRY_SCAN")),
      this.birdeye.getTradeData(tokenAddress, this.apiMeta("ENTRY_SCAN")),
    ]);

    if (!overview || !tradeData) {
      log.info({ token: tokenSymbol }, "tranche 2 skipped — no fresh market data");
      return;
    }

    const currentBuyPressure = tradeData.volume5m > 0
      ? (tradeData.volumeBuy5m / tradeData.volume5m) * 100
      : 0;
    const volumeRetention = tradeData.volumeHistory5m > 0
      ? tradeData.volume5m / tradeData.volumeHistory5m
      : 0;

    if (overview.liquidity < this.cfg.minLiquidity) {
      log.info({ token: tokenSymbol, liquidity: overview.liquidity }, "tranche 2 skipped — liquidity degraded");
      return;
    }

    if (overview.marketCap > this.cfg.maxMarketCap) {
      log.info({ token: tokenSymbol, marketCap: overview.marketCap }, "tranche 2 skipped — market cap drifted too high");
      return;
    }

    if (currentBuyPressure < this.cfg.minBuyPressure) {
      log.info({ token: tokenSymbol, buyPressure: currentBuyPressure }, "tranche 2 skipped — buy pressure faded");
      return;
    }

    if (tradeData.uniqueWallet5m < this.cfg.minHolders * this.cfg.tranche2MinHolderRatio) {
      log.info({ token: tokenSymbol, uniqueWallet5m: tradeData.uniqueWallet5m }, "tranche 2 skipped — participation too thin");
      return;
    }

    if (volumeRetention < this.cfg.tranche2MinVolumeRetention) {
      log.info({ token: tokenSymbol, volumeRetention }, "tranche 2 skipped — momentum faded");
      return;
    }

    await this.tradeExecutor.executeBuy({
      strategy: "S3_MOMENTUM",
      tokenAddress,
      tokenSymbol,
      amountSol: tranche2Size,
      maxSlippageBps: this.cfg.maxSlippageBps,
      regime: this.regimeDetector.getRegime(),
      trancheNumber: 2,
      positionId,
    });
  }

  private async runFilters(candidate: MomentumCandidate): Promise<MomentumFilterResult> {
    const filters: Record<string, JsonValue> = {
      seedSource: candidate.source,
      seedPriceUsd: candidate.seedPriceUsd,
      seedLiquidityUsd: candidate.seedLiquidityUsd,
      seedMarketCap: candidate.seedMarketCap,
      prefilterLiquidityUsd: candidate.prefilterLiquidityUsd ?? null,
      prefilterPriceUsd: candidate.prefilterPriceUsd ?? null,
      pairAddress: candidate.pairAddress ?? null,
      pairCreatedAt: candidate.pairCreatedAt ?? null,
    };

    if ((candidate.prefilterLiquidityUsd ?? 0) > 0 && (candidate.prefilterLiquidityUsd ?? 0) < this.cfg.minLiquidity) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: `liquidity ${candidate.prefilterLiquidityUsd} < ${this.cfg.minLiquidity}`,
        filterResults: filters,
        overview: null,
        tradeData: null,
      };
    }

    const [overview, tradeData] = await Promise.all([
      this.birdeye.getTokenOverview(candidate.address, this.apiMeta("ENTRY_SCAN")),
      this.birdeye.getTradeData(candidate.address, this.apiMeta("ENTRY_SCAN")),
    ]);

    if (!overview) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: "no overview data",
        filterResults: filters,
        overview: null,
        tradeData,
      };
    }

    filters.volume5m = overview.volume5m;
    filters.volume1h = overview.volume1h;
    filters.liquidity = overview.liquidity;
    filters.marketCap = overview.marketCap;
    filters.holders = overview.holder;
    filters.priceChange1h = overview.priceChange1h;

    if (overview.liquidity < this.cfg.minLiquidity) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: `liquidity ${overview.liquidity} < ${this.cfg.minLiquidity}`,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    if (overview.marketCap > this.cfg.maxMarketCap) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: `mcap ${overview.marketCap} > ${this.cfg.maxMarketCap}`,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    if (overview.holder < this.cfg.minHolders) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: `holders ${overview.holder} < ${this.cfg.minHolders}`,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    if (!tradeData) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: "no trade data",
        filterResults: filters,
        overview,
        tradeData: null,
      };
    }

    const hasCompleteTradeData = tradeData.volume5m > 0 && tradeData.volumeHistory5m > 0 && tradeData.trade5m > 0;
    filters.tradeDataComplete = hasCompleteTradeData;
    if (!hasCompleteTradeData) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: "incomplete trade data",
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    filters.volumeHistory5m = tradeData.volumeHistory5m;
    filters.uniqueWallet5m = tradeData.uniqueWallet5m;
    filters.buyPercent = tradeData.volume5m > 0 ? (tradeData.volumeBuy5m / tradeData.volume5m) * 100 : 0;

    const volumeSpike = tradeData.volumeHistory5m > 0
      ? tradeData.volume5m / tradeData.volumeHistory5m
      : 0;
    filters.volumeSpike = volumeSpike;

    if (volumeSpike < this.cfg.volumeSpikeMultiplier) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: `volume spike ${volumeSpike.toFixed(1)}x < ${this.cfg.volumeSpikeMultiplier}x`,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    if ((filters.buyPercent as number) < this.cfg.minBuyPressure) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: `buy pressure ${(filters.buyPercent as number).toFixed(0)}% < ${this.cfg.minBuyPressure}%`,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    if (tradeData.volume5m > 0) {
      const washRatio = tradeData.uniqueWallet5m / (tradeData.volume5m / 1000);
      filters.washRatio = washRatio;
      if (washRatio < this.cfg.washTradingThreshold) {
        return {
          passed: false,
          tokenAddress: candidate.address,
          tokenSymbol: candidate.symbol,
          rejectReason: "wash trading detected",
          filterResults: filters,
          overview,
          tradeData,
        };
      }
    }

    if (overview.priceChange1h > this.cfg.alreadyPumpedPercent) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: `already pumped ${overview.priceChange1h.toFixed(0)}%`,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    const [security, holders] = await Promise.all([
      this.birdeye.getTokenSecurity(candidate.address, this.apiMeta("ENTRY_SCAN")),
      this.birdeye.getTokenHolders(candidate.address, 1, this.apiMeta("ENTRY_SCAN", false, 1)),
    ]);

    const securityCheck = runSecurityChecks(security, holders, {
      maxTop10HolderPercent: this.cfg.maxTop10HolderPercent,
      maxSingleHolderPercent: this.cfg.maxSingleHolderPercent,
    });
    Object.assign(filters, securityCheck.filterResults);
    if (!securityCheck.pass) {
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: securityCheck.reason,
        filterResults: filters,
        overview,
        tradeData,
      };
    }

    return {
      passed: true,
      tokenAddress: candidate.address,
      tokenSymbol: candidate.symbol,
      filterResults: filters,
      overview,
      tradeData,
    };
  }

  private buildCandidate(seed: SeedCandidate, prefilter: PrefilterResult | undefined): MomentumCandidate | null {
    if (!prefilter?.passed) return null;
    if (seed.marketCap > 0 && seed.marketCap > this.cfg.maxMarketCap * 2) return null;

    return {
      address: seed.address,
      symbol: seed.symbol,
      name: seed.name,
      source: seed.source,
      seedPriceUsd: seed.priceUsd,
      seedLiquidityUsd: seed.liquidityUsd,
      seedMarketCap: seed.marketCap,
      prefilterPriceUsd: prefilter.priceUsd,
      prefilterLiquidityUsd: prefilter.liquidityUsd,
      pairAddress: prefilter.pairAddress,
      pairCreatedAt: prefilter.pairCreatedAt,
    };
  }

  private apiMeta(purpose: ApiCallPurpose, essential = false, batchSize?: number) {
    return {
      strategy: "S3_MOMENTUM" as const,
      mode: this.scope.mode,
      configProfile: this.scope.configProfile,
      purpose,
      essential,
      batchSize,
    };
  }

  private hasEntryEvaluationHeadroom(context: string): boolean {
    const capacity = this.riskManager.getEntryCapacity("S3_MOMENTUM");
    if (!capacity.allowed) {
      log.info({ reason: capacity.reason }, `${context} skipped — no S3 entry capacity`);
      return false;
    }

    if (capacity.remaining <= this.activeEntryEvaluations) {
      log.info(
        { remaining: capacity.remaining, inFlight: this.activeEntryEvaluations },
        `${context} skipped — S3 Birdeye evaluation slots are busy`,
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
    const capacity = this.riskManager.getEntryCapacity("S3_MOMENTUM");
    if (!capacity.allowed) {
      log.info({ tokenAddress, reason: capacity.reason }, `${context} skipped — no S3 entry capacity`);
      return null;
    }

    if (capacity.remaining <= this.activeEntryEvaluations) {
      log.info(
        { tokenAddress, remaining: capacity.remaining, inFlight: this.activeEntryEvaluations },
        `${context} skipped — S3 Birdeye evaluation slots are busy`,
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
