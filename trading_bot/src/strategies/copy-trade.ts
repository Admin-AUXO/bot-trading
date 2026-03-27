import { EventEmitter } from "events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import { WorkerPool } from "../utils/worker-pool.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { PositionTracker } from "../core/position-tracker.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";
import type { ExitMonitor } from "../core/exit-monitor.js";
import type { RegimeDetector } from "../core/regime-detector.js";
import type { HeliusService } from "../services/helius.js";
import type { BirdeyeService } from "../services/birdeye.js";
import type { SignalResult, JsonValue } from "../utils/types.js";

const log = createChildLogger("s1-copy");
const cfg = config.strategies.s1;

interface ScoringTask {
  walletAddress: string;
  heliusApiKey: string;
  heliusRpcUrl: string;
}

interface ScoringResult {
  walletAddress: string;
  compositeScore: number;
  archetype: string;
}

export class CopyTradeStrategy extends EventEmitter {
  private eliteWallets: string[] = [];
  private processingTokens: Set<string> = new Set();
  private scoringPool: WorkerPool<ScoringTask, ScoringResult | null> | null = null;

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
    await this.loadEliteWallets();
    this.helius.connectWebSocket((data) => this.handleWebhookEvent(data));

    await Promise.all(
      this.eliteWallets.map((wallet) =>
        this.helius.subscribeToAccount(wallet).catch((err) => {
          log.warn({ wallet, err }, "wallet subscription failed");
        }),
      ),
    );

    log.info({ wallets: this.eliteWallets.length }, "S1 copy trade started");
  }

  private async loadEliteWallets(): Promise<void> {
    const recent = await db.walletScore.findMany({
      where: { isElite: true },
      orderBy: { scoredAt: "desc" },
      take: cfg.walletCount * 10,
      select: { walletAddress: true },
    });

    const seen = new Set<string>();
    this.eliteWallets = recent
      .filter((w) => !seen.has(w.walletAddress) && seen.add(w.walletAddress) !== undefined)
      .slice(0, cfg.walletCount)
      .map((w) => w.walletAddress);

    if (this.eliteWallets.length === 0) {
      log.warn("no elite wallets found — S1 will be idle until wallet scoring runs");
    }
  }

  private async handleWebhookEvent(data: unknown): Promise<void> {
    const detectedAt = Date.now();
    try {
      const event = data as Record<string, unknown>;
      const params = event.params as Record<string, unknown> | undefined;
      if (!params) return;

      const result = params.result as Record<string, unknown> | undefined;
      if (!result) return;

      const accountKey = (result as Record<string, unknown>).value?.toString() ?? "";
      if (!this.eliteWallets.includes(accountKey)) return;

      await this.processWalletActivity(accountKey, detectedAt);
    } catch (err) {
      log.error({ err: (err as Error).message }, "webhook event handler error");
    }
  }

  private async processWalletActivity(walletAddress: string, detectedAt: number): Promise<void> {
    const recentTxs = await this.helius.getTransactionsForAddress(walletAddress, {
      tokenAccounts: "balanceChanged",
      limit: 5,
    });
    if (!recentTxs.length) return;

    const latestTx = recentTxs[0] as Record<string, unknown>;
    const tokenTransfers = latestTx.tokenTransfers as Array<Record<string, unknown>> | undefined;
    if (!tokenTransfers?.length) return;

    const buyTransfer = tokenTransfers.find(
      (t) => t.fromUserAccount === "" || t.fromUserAccount === null,
    );
    if (!buyTransfer) return;

    const tokenAddress = buyTransfer.mint as string;
    const txSignature = latestTx.signature as string;
    if (!tokenAddress || this.processingTokens.has(tokenAddress)) return;

    this.processingTokens.add(tokenAddress);
    try {
      const nativeChange = (latestTx.nativeTransfers as Array<Record<string, unknown>> | undefined)?.[0];
      const amountSol = Math.abs((nativeChange?.amount as number) ?? 0) / 1e9;
      const amountToken = Number(buyTransfer.tokenAmount ?? 0);

      const walletScore = await db.walletScore.findFirst({
        where: { walletAddress, isElite: true },
        orderBy: { scoredAt: "desc" },
      });

      if (txSignature) {
        const existing = await db.walletActivity.findUnique({ where: { txSignature } });
        if (!existing) {
          const priceUsd = await this.birdeye.getMultiPrice([tokenAddress]);
          const price = priceUsd.get(tokenAddress);

          await db.walletActivity.create({
            data: {
              walletAddress,
              tokenAddress,
              tokenSymbol: (buyTransfer.tokenStandard as string) ?? "",
              side: "BUY",
              amountSol,
              amountToken,
              priceAtTrade: price?.value ?? null,
              txSignature,
              walletArchetype: walletScore?.archetype ?? null,
              isElite: !!walletScore?.isElite,
            },
          });
        }
      }

      await this.evaluateAndTrade(tokenAddress, walletAddress, detectedAt);
    } finally {
      this.processingTokens.delete(tokenAddress);
    }
  }

  private async evaluateAndTrade(tokenAddress: string, walletAddress: string, detectedAt: number): Promise<void> {
    if (!tokenAddress || tokenAddress.length !== 44 || !/^[1-9A-HJ-NP-Z]{44}$/.test(tokenAddress)) {
      log.warn({ tokenAddress }, "invalid token address in webhook — skipping");
      return;
    }

    const BANNED_ADDRS = new Set([
      "11111111111111111111111111111111",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);
    if (BANNED_ADDRS.has(tokenAddress)) {
      log.warn({ tokenAddress }, "banned token address — skipping");
      return;
    }

    const regime = this.regimeDetector.getRegime();
    if (regime === "RISK_OFF") {
      log.info({ tokenAddress }, "S1 signal skipped — RISK_OFF regime");
      return;
    }

    const signal = await this.runFilters(tokenAddress);

    await db.signal.create({
      data: {
        strategy: "S1_COPY",
        tokenAddress,
        tokenSymbol: signal.tokenSymbol,
        signalType: "webhook_buy",
        source: walletAddress,
        passed: signal.passed,
        rejectReason: signal.rejectReason ?? null,
        filterResults: signal.filterResults,
        regime: this.regimeDetector.getRegime(),
        tokenLiquidity: (signal.filterResults.liquidity as number) ?? null,
        tokenMcap: (signal.filterResults.marketCap as number) ?? null,
        tokenVolume5m: (signal.filterResults.volume5m as number) ?? null,
        buyPressure: (signal.filterResults.buyPercent as number) ?? null,
        priceAtSignal: (signal.filterResults.priceAtSignal as number) ?? null,
      },
    });

    if (!signal.passed) {
      log.info({ token: signal.tokenSymbol, reason: signal.rejectReason }, "signal rejected");
      return;
    }

    if (this.positionTracker.holdsToken(tokenAddress)) {
      log.info({ token: signal.tokenSymbol }, "already holding token");
      return;
    }

    const check = this.riskManager.canOpenPosition("S1_COPY");
    if (!check.allowed) {
      log.info({ reason: check.reason }, "risk manager blocked entry");
      return;
    }

    const positionSize = this.riskManager.getPositionSize("S1_COPY");

    const result = await this.tradeExecutor.executeBuy({
      strategy: "S1_COPY",
      tokenAddress,
      tokenSymbol: signal.tokenSymbol,
      amountSol: positionSize,
      maxSlippageBps: cfg.maxSlippageBps,
      regime: this.regimeDetector.getRegime(),
      walletSource: walletAddress,
      entryVolume5m: (signal.filterResults.volume5m as number) ?? 0,
      entryLiquidity: (signal.filterResults.liquidity as number) ?? undefined,
      entryMcap: (signal.filterResults.marketCap as number) ?? undefined,
      entryBuyPressure: (signal.filterResults.buyPercent as number) ?? undefined,
      copyLeadMs: Date.now() - detectedAt,
    });

    if (result.success) {
      const positions = this.positionTracker.getByStrategy("S1_COPY");
      const newPos = positions.find((p) => p.tokenAddress === tokenAddress);
      if (newPos) this.exitMonitor.startMonitoring(newPos);
    }
  }

  private async runFilters(tokenAddress: string): Promise<SignalResult> {
    const filters: Record<string, JsonValue> = {};

    const [overview, security, holders, tradeData] = await Promise.all([
      this.birdeye.getTokenOverview(tokenAddress),
      this.birdeye.getTokenSecurity(tokenAddress),
      this.birdeye.getTokenHolders(tokenAddress, 1),
      this.birdeye.getTradeData(tokenAddress),
    ]);

    if (!overview) return { passed: false, tokenAddress, tokenSymbol: "", rejectReason: "no overview data", filterResults: filters };

    filters.liquidity = overview.liquidity;
    filters.marketCap = overview.marketCap;
    filters.buyPercent = overview.buyPercent;
    filters.volume5m = overview.volume5m;
    filters.priceAtSignal = overview.price;

    if (overview.liquidity < cfg.minLiquidity) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `liquidity ${overview.liquidity} < ${cfg.minLiquidity}`, filterResults: filters };
    }

    if (overview.marketCap > cfg.maxMarketCap) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `mcap ${overview.marketCap} > ${cfg.maxMarketCap}`, filterResults: filters };
    }

    if (overview.buyPercent < cfg.minBuyPressure) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `buy pressure ${overview.buyPercent}% < ${cfg.minBuyPressure}%`, filterResults: filters };
    }

    if (!security) return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: "no security data", filterResults: filters };

    filters.top10HolderPercent = security.top10HolderPercent;
    filters.freezeable = security.freezeable;
    filters.mintAuthority = security.mintAuthority;

    if (security.top10HolderPercent > cfg.maxTop10HolderPercent) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `top10 holders ${security.top10HolderPercent}% > ${cfg.maxTop10HolderPercent}%`, filterResults: filters };
    }

    if (security.freezeable) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: "token is freezeable", filterResults: filters };
    }

    if (security.mintAuthority) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: "mint authority active", filterResults: filters };
    }

    if (security.transferFeeEnable) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: "transfer fee enabled", filterResults: filters };
    }

    if (holders.length > 0 && holders[0].percent > cfg.maxSingleHolderPercent) {
      filters.topHolderPercent = holders[0].percent;
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `top holder ${holders[0].percent}% > ${cfg.maxSingleHolderPercent}%`, filterResults: filters };
    }

    if (tradeData) {
      filters.uniqueWallet5m = tradeData.uniqueWallet5m;
      filters.washTradingRatio = tradeData.volume5m > 0
        ? tradeData.uniqueWallet5m / (tradeData.volume5m / 1000)
        : 0;
      if ((filters.washTradingRatio as number) < 0.1) {
        return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: "wash trading detected", filterResults: filters };
      }
    }

    return {
      passed: true,
      tokenAddress,
      tokenSymbol: overview.symbol,
      filterResults: filters,
    };
  }

  async runWalletScoring(): Promise<void> {
    log.info("starting daily wallet scoring (worker pool)");
    const candidateWallets = await this.getCandidateWallets();

    if (!this.scoringPool) {
      const workerPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../workers/wallet-scorer.js",
      );
      this.scoringPool = new WorkerPool<ScoringTask, ScoringResult | null>(workerPath, config.walletScorer.workerPoolSize, {
        scoringConfig: config.walletScorer,
      });
    }

    const tasks: ScoringTask[] = candidateWallets.map((addr) => ({
      walletAddress: addr,
      heliusApiKey: config.helius.apiKey,
      heliusRpcUrl: config.helius.rpcUrl,
    }));

    const results = await this.scoringPool.executeBatch(tasks);

    const scores = results
      .filter((r): r is ScoringResult => r !== null)
      .map((r) => ({ address: r.walletAddress, score: r.compositeScore }));

    scores.sort((a, b) => b.score - a.score);

    await db.walletScore.updateMany({
      where: { isElite: true },
      data: { isElite: false },
    });

    const topWallets = scores.slice(0, cfg.walletCount);
    this.eliteWallets = topWallets.map((w) => w.address);

    log.info({ eliteWallets: this.eliteWallets, scored: scores.length }, "wallet scoring complete");
  }

  private async getCandidateWallets(): Promise<string[]> {
    const existing = await db.walletScore.findMany({
      orderBy: { compositeScore: "desc" },
      take: cfg.scoringPoolSize * 10,
      select: { walletAddress: true },
    });
    const seen = new Set<string>();
    return existing
      .filter((w) => !seen.has(w.walletAddress) && seen.add(w.walletAddress) !== undefined)
      .slice(0, cfg.scoringPoolSize)
      .map((w) => w.walletAddress);
  }

  stop(): void {
    this.helius.disconnect();
    this.scoringPool?.terminate();
    log.info("S1 copy trade stopped");
  }
}
