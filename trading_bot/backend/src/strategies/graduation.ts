import { EventEmitter } from "events";
import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import { PROGRAM_IDS } from "../utils/types.js";
import { runSecurityChecks, runTradeDataChecks, runLiquidityMarketCapChecks } from "../utils/token-filters.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { PositionTracker } from "../core/position-tracker.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";
import type { ExitMonitor } from "../core/exit-monitor.js";
import type { RegimeDetector } from "../core/regime-detector.js";
import type { HeliusService } from "../services/helius.js";
import type { BirdeyeService } from "../services/birdeye.js";
import type { SignalResult, MemeToken, JsonValue } from "../utils/types.js";

const log = createChildLogger("s2-graduation");
const cfg = config.strategies.s2;

export class GraduationStrategy extends EventEmitter {
  private scanInterval?: ReturnType<typeof setInterval>;
  private fallbackInterval?: ReturnType<typeof setInterval>;
  private processingTokens: Set<string> = new Set();
  private pendingGraduation: Map<string, { token: MemeToken; deadline: number }> = new Map();
  private pendingEntryDelays: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    private riskManager: RiskManager,
    private positionTracker: PositionTracker,
    private tradeExecutor: ITradeExecutor,
    private exitMonitor: ExitMonitor,
    private regimeDetector: RegimeDetector,
    private helius: HeliusService,
    private birdeye: BirdeyeService,
  ) {
    super();
  }

  async start(): Promise<void> {
    await this.setupWebSocketSubscriptions();
    this.scanInterval = setInterval(() => this.runMemeListScan(), cfg.scanIntervalMs);
    this.fallbackInterval = setInterval(() => this.runFallbackScan(), 300_000);
    log.info("S2 graduation strategy started");
  }

  stop(): void {
    if (this.scanInterval) clearInterval(this.scanInterval);
    if (this.fallbackInterval) clearInterval(this.fallbackInterval);
    for (const [, handle] of this.pendingEntryDelays) clearTimeout(handle);
    this.pendingEntryDelays.clear();
    this.pendingGraduation.clear();
    log.info("S2 graduation strategy stopped");
  }

  private async setupWebSocketSubscriptions(): Promise<void> {
    const programs = [
      PROGRAM_IDS.PUMP_FUN,
      PROGRAM_IDS.RAYDIUM_LAUNCHLAB,
      PROGRAM_IDS.MOONIT,
      PROGRAM_IDS.BOOP_FUN,
      PROGRAM_IDS.BELIEVE_METEORA_DBC,
    ];

    const dexes = [
      PROGRAM_IDS.RAYDIUM_AMM_V4,
      PROGRAM_IDS.METEORA_DAMM,
      PROGRAM_IDS.ORCA_WHIRLPOOLS,
    ];

    await Promise.all([
      ...programs.map((programId) => this.helius.subscribeToProgram(programId)),
      ...dexes.map((dex) => this.helius.subscribeToLogs(dex)),
    ]);
  }

  private async runMemeListScan(): Promise<void> {
    if (this.regimeDetector.getRegime() === "RISK_OFF") return;

    await this.checkPendingGraduations();

    const [nearGrad, justGrad] = await Promise.all([
      this.birdeye.getMemeTokenList({
        graduated: false,
        minProgressPercent: cfg.nearGradPercent,
        limit: 10,
      }),
      this.birdeye.getMemeTokenList({
        graduated: true,
        minGraduatedTime: Math.floor(Date.now() / 1000) - 300,
        limit: 10,
      }),
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
  }

  private async runFallbackScan(): Promise<void> {
    const listings = await this.birdeye.getNewListings();
    const promises: Promise<void>[] = [];

    for (const listing of listings as Array<Record<string, unknown>>) {
      const address = listing.address as string;
      if (!address) continue;
      if (this.processingTokens.has(address)) continue;
      if (this.pendingGraduation.has(address)) continue;
      if (this.pendingEntryDelays.has(address)) continue;

      this.processingTokens.add(address);
      const detail = await this.birdeye.getMemeTokenDetail(address);
      if (detail?.graduated) {
        promises.push(
          this.processCandidate(detail).finally(() => {
            this.processingTokens.delete(address);
          }),
        );
      } else {
        this.processingTokens.delete(address);
      }
    }

    await Promise.allSettled(promises);
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

    const details = await Promise.allSettled(
      toCheck.map(({ address }) => this.birdeye.getMemeTokenDetail(address)),
    );

    for (let i = 0; i < toCheck.length; i++) {
      const result = details[i];
      const { address } = toCheck[i];
      if (result.status === "fulfilled" && result.value?.graduated) {
        this.pendingGraduation.delete(address);
        await this.onGraduated(result.value);
      }
    }
  }

  private async processCandidate(token: MemeToken): Promise<void> {
    if (token.graduated) {
      await this.onGraduated(token);
    } else {
      this.pendingGraduation.set(token.address, { token, deadline: Date.now() + config.strategies.s2.graduationPendingExpiryMs });
    }
  }

  private async onGraduated(token: MemeToken): Promise<void> {
    const overview = await this.birdeye.getTokenOverview(token.address);

    await db.graduationEvent.create({
      data: {
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        platform: token.source,
        creator: token.creator,
        liquidity: overview?.liquidity ?? null,
        marketCap: overview?.marketCap ?? null,
        holders: overview?.holder ?? null,
        priceAtGrad: overview?.price ?? null,
        wasTraded: false,
      },
    });

    const priceAtSignal = overview?.price ?? null;
    const delayMs = cfg.entryDelayMinutes * 60_000;
    const handle = setTimeout(() => {
      this.runFilterAndTrade(token, priceAtSignal).catch((err) => {
        log.error({ err, token: token.address }, "entry after delay failed");
      });
    }, delayMs);

    this.pendingEntryDelays.set(token.address, handle);
  }

  private async runFilterAndTrade(token: MemeToken, priceAtSignal: number | null): Promise<void> {
    this.pendingEntryDelays.delete(token.address);

    const signal = await this.runFilters(token);

    await db.signal.create({
      data: {
        strategy: "S2_GRADUATION",
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        signalType: "graduation",
        source: token.source,
        passed: signal.passed,
        rejectReason: signal.rejectReason ?? null,
        filterResults: signal.filterResults,
        regime: this.regimeDetector.getRegime(),
        tokenLiquidity: (signal.filterResults.liquidity as number) ?? null,
        tokenMcap: (signal.filterResults.marketCap as number) ?? null,
        tokenVolume5m: (signal.filterResults.volume5m as number) ?? null,
        buyPressure: (signal.filterResults.buyPercent as number) ?? null,
        priceAtSignal,
      },
    });

    if (!signal.passed) {
      log.info({ token: token.symbol, reason: signal.rejectReason }, "graduation signal rejected");
      return;
    }

    if (this.positionTracker.holdsToken(token.address)) return;

    const check = this.riskManager.canOpenPosition("S2_GRADUATION");
    if (!check.allowed) return;

    const positionSize = this.riskManager.getPositionSize("S2_GRADUATION");

    const result = await this.tradeExecutor.executeBuy({
      strategy: "S2_GRADUATION",
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      amountSol: positionSize,
      maxSlippageBps: cfg.maxSlippageBps,
      regime: this.regimeDetector.getRegime(),
      platform: token.source,
      entryVolume5m: (signal.filterResults.volume5m as number) ?? 0,
      entryLiquidity: (signal.filterResults.liquidity as number) ?? undefined,
      entryMcap: (signal.filterResults.marketCap as number) ?? undefined,
    });

    if (result.success) {
      const positions = this.positionTracker.getByStrategy("S2_GRADUATION");
      const newPos = positions.find((p) => p.tokenAddress === token.address);
      await db.graduationEvent.updateMany({
        where: { tokenAddress: token.address },
        data: { wasTraded: true, positionId: newPos?.id ?? null },
      });
      if (newPos) this.exitMonitor.startMonitoring(newPos);
    }
  }

  private async runFilters(token: MemeToken): Promise<SignalResult> {
    const filters: Record<string, JsonValue> = { source: token.source };

    const [security, holders, overview, tradeData, sigs, creatorSigs] = await Promise.all([
      this.birdeye.getTokenSecurity(token.address),
      this.birdeye.getTokenHolders(token.address, 1),
      this.birdeye.getTokenOverview(token.address),
      this.birdeye.getTradeData(token.address),
      this.helius.getSignaturesForAddress(token.address, 200),
      this.helius.getSignaturesForAddress(token.creator, 100),
    ]);

    const securityCheck = runSecurityChecks(security, holders, {
      maxTop10HolderPercent: cfg.maxTop10HolderPercent,
      maxSingleHolderPercent: cfg.maxSingleHolderPercent,
    });
    Object.assign(filters, securityCheck.filterResults);
    if (!securityCheck.pass) {
      return { passed: false, tokenAddress: token.address, tokenSymbol: token.symbol, rejectReason: securityCheck.reason, filterResults: filters };
    }

    filters.txCountFirst60s = sigs.length;
    if (sigs.length > cfg.maxBotTxs60s) {
      return { passed: false, tokenAddress: token.address, tokenSymbol: token.symbol, rejectReason: "bot swarm detected", filterResults: filters };
    }

    const recentCreatorTxs = creatorSigs.filter((s: unknown) => {
      const sig = s as Record<string, unknown>;
      const blockTime = sig.blockTime as number;
      return blockTime && blockTime > Date.now() / 1000 - 604_800;
    });

    if (recentCreatorTxs.length > cfg.maxSerialDeploys7d * 10) {
      return { passed: false, tokenAddress: token.address, tokenSymbol: token.symbol, rejectReason: "serial deployer", filterResults: filters };
    }

    const tradeDataCheck = runTradeDataChecks(tradeData, {
      minUniqueBuyers5m: cfg.minUniqueBuyers5m,
      minBuySellRatio: cfg.minBuySellRatio,
    });
    Object.assign(filters, tradeDataCheck.filterResults);
    if (!tradeDataCheck.pass) {
      return { passed: false, tokenAddress: token.address, tokenSymbol: token.symbol, rejectReason: tradeDataCheck.reason, filterResults: filters };
    }

    if (!overview) return { passed: false, tokenAddress: token.address, tokenSymbol: token.symbol, rejectReason: "no overview", filterResults: filters };

    const liqCapCheck = runLiquidityMarketCapChecks(overview.liquidity, overview.marketCap, {
      minLiquidity: cfg.minLiquidity,
      maxMarketCap: cfg.maxMarketCap,
    });
    Object.assign(filters, liqCapCheck.filterResults);
    if (!liqCapCheck.pass) {
      return { passed: false, tokenAddress: token.address, tokenSymbol: token.symbol, rejectReason: liqCapCheck.reason, filterResults: filters };
    }

    return { passed: true, tokenAddress: token.address, tokenSymbol: token.symbol, filterResults: filters };
  }
}
