import { EventEmitter } from "events";
import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import { runSecurityChecks } from "../utils/token-filters.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { PositionTracker } from "../core/position-tracker.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";
import type { ExitMonitor } from "../core/exit-monitor.js";
import type { RegimeDetector } from "../core/regime-detector.js";
import type { BirdeyeService } from "../services/birdeye.js";
import type { SignalResult, TokenOverview, JsonValue } from "../utils/types.js";

const log = createChildLogger("s3-momentum");
const cfg = config.strategies.s3;

export class MomentumStrategy extends EventEmitter {
  private scanInterval?: ReturnType<typeof setInterval>;
  private processingTokens: Set<string> = new Set();
  private pendingTranche2: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    private riskManager: RiskManager,
    private positionTracker: PositionTracker,
    private tradeExecutor: ITradeExecutor,
    private exitMonitor: ExitMonitor,
    private regimeDetector: RegimeDetector,
    private birdeye: BirdeyeService,
  ) {
    super();
  }

  start(): void {
    this.scanInterval = setInterval(() => {
      this.runScan().catch((err) => log.error({ err }, "momentum scan cycle failed"));
    }, cfg.scanIntervalMs);
    log.info("S3 momentum strategy started");
  }

  stop(): void {
    if (this.scanInterval) clearInterval(this.scanInterval);
    for (const [, handle] of this.pendingTranche2) clearTimeout(handle);
    this.pendingTranche2.clear();
    log.info("S3 momentum strategy stopped");
  }

  private async runScan(): Promise<void> {
    const regime = this.regimeDetector.getRegime();
    if (regime === "RISK_OFF") return;

    const candidates = await this.birdeye.getTokenList({
      sortBy: "volume_5m_change_percent",
      minVolume5m: cfg.minVolume5m,
      minLiquidity: cfg.minLiquidity,
      maxMarketCap: cfg.maxMarketCap,
      minHolder: cfg.minHolders,
      limit: cfg.maxCandidatesPerScan,
    });

    if (candidates.length === 0) return;

    const toProcess = candidates.filter((c) =>
      !this.processingTokens.has(c.address) && !this.positionTracker.holdsToken(c.address),
    );

    for (const c of toProcess) this.processingTokens.add(c.address);

    await Promise.allSettled(
      toProcess.map((candidate) =>
        this.evaluateCandidate(candidate).finally(() => {
          this.processingTokens.delete(candidate.address);
        }),
      ),
    );
  }

  private async evaluateCandidate(candidate: TokenOverview): Promise<void> {
    const signal = await this.runFilters(candidate);

    await db.signal.create({
      data: {
        strategy: "S3_MOMENTUM",
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        signalType: "momentum_scan",
        source: "v3/token/list",
        passed: signal.passed,
        rejectReason: signal.rejectReason ?? null,
        filterResults: signal.filterResults,
        regime: this.regimeDetector.getRegime(),
        tokenLiquidity: candidate.liquidity,
        tokenMcap: candidate.marketCap,
        tokenVolume5m: candidate.volume5m,
        buyPressure: candidate.buyPercent,
        priceAtSignal: candidate.price,
      },
    });

    if (!signal.passed) return;

    const check = this.riskManager.canOpenPosition("S3_MOMENTUM");
    if (!check.allowed) return;

    const fullSize = this.riskManager.getPositionSize("S3_MOMENTUM");
    const tranche1Size = fullSize * (cfg.tranche1Percent / 100);

    const result = await this.tradeExecutor.executeBuy({
      strategy: "S3_MOMENTUM",
      tokenAddress: candidate.address,
      tokenSymbol: candidate.symbol,
      amountSol: tranche1Size,
      maxSlippageBps: cfg.maxSlippageBps,
      regime: this.regimeDetector.getRegime(),
      trancheNumber: 1,
      entryVolume5m: candidate.volume5m,
      entryLiquidity: candidate.liquidity,
      entryMcap: candidate.marketCap,
      entryHolders: candidate.holder,
      entryVolume1h: candidate.volume1h,
      entryBuyPressure: candidate.buyPercent,
    });

    if (!result.success) return;

    const positions = this.positionTracker.getByStrategy("S3_MOMENTUM");
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
    }, cfg.tranche2DelayMs);

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

    if (pos.currentPriceUsd < pos.entryPriceUsd) {
      log.info({ token: tokenSymbol }, "tranche 2 skipped — price below entry");
      return;
    }

    const tranche2Size = fullSize * (cfg.tranche2Percent / 100);

    await this.tradeExecutor.executeBuy({
      strategy: "S3_MOMENTUM",
      tokenAddress,
      tokenSymbol,
      amountSol: tranche2Size,
      maxSlippageBps: cfg.maxSlippageBps,
      regime: this.regimeDetector.getRegime(),
      trancheNumber: 2,
      positionId,
    });
  }

  private async runFilters(candidate: TokenOverview): Promise<SignalResult> {
    const filters: Record<string, JsonValue> = {
      volume5m: candidate.volume5m,
      liquidity: candidate.liquidity,
      marketCap: candidate.marketCap,
      holders: candidate.holder,
    };

    const [tradeData, security] = await Promise.all([
      this.birdeye.getTradeData(candidate.address),
      this.birdeye.getTokenSecurity(candidate.address),
    ]);

    if (!tradeData) {
      return { passed: false, tokenAddress: candidate.address, tokenSymbol: candidate.symbol, rejectReason: "no trade data", filterResults: filters };
    }

    filters.volumeHistory5m = tradeData.volumeHistory5m;
    filters.uniqueWallet5m = tradeData.uniqueWallet5m;
    filters.buyPercent = tradeData.volume5m > 0 ? (tradeData.volumeBuy5m / tradeData.volume5m) * 100 : 0;

    const volumeSpike = tradeData.volumeHistory5m > 0
      ? tradeData.volume5m / tradeData.volumeHistory5m
      : 0;
    filters.volumeSpike = volumeSpike;

    if (volumeSpike < cfg.volumeSpikeMultiplier) {
      return { passed: false, tokenAddress: candidate.address, tokenSymbol: candidate.symbol, rejectReason: `volume spike ${volumeSpike.toFixed(1)}x < ${cfg.volumeSpikeMultiplier}x`, filterResults: filters };
    }

    if ((filters.buyPercent as number) < cfg.minBuyPressure) {
      return { passed: false, tokenAddress: candidate.address, tokenSymbol: candidate.symbol, rejectReason: `buy pressure ${(filters.buyPercent as number).toFixed(0)}% < ${cfg.minBuyPressure}%`, filterResults: filters };
    }

    if (tradeData.volume5m > 0) {
      const washRatio = tradeData.uniqueWallet5m / (tradeData.volume5m / 1000);
      filters.washRatio = washRatio;
      if (washRatio < cfg.washTradingThreshold) {
        return { passed: false, tokenAddress: candidate.address, tokenSymbol: candidate.symbol, rejectReason: "wash trading detected", filterResults: filters };
      }
    }

    if (candidate.priceChange1h > cfg.alreadyPumpedPercent) {
      return { passed: false, tokenAddress: candidate.address, tokenSymbol: candidate.symbol, rejectReason: `already pumped ${candidate.priceChange1h.toFixed(0)}%`, filterResults: filters };
    }

    const securityCheck = runSecurityChecks(security, [], {
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 25,
    });
    Object.assign(filters, securityCheck.filterResults);
    if (!securityCheck.pass) {
      return { passed: false, tokenAddress: candidate.address, tokenSymbol: candidate.symbol, rejectReason: securityCheck.reason, filterResults: filters };
    }

    return { passed: true, tokenAddress: candidate.address, tokenSymbol: candidate.symbol, filterResults: filters };
  }
}
