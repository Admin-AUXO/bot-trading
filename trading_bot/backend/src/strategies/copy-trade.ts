import { EventEmitter } from "events";
import pLimit from "p-limit";
import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { PositionTracker } from "../core/position-tracker.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";
import type { ExitMonitor } from "../core/exit-monitor.js";
import type { RegimeDetector } from "../core/regime-detector.js";
import type { HeliusService } from "../services/helius.js";
import type { BirdeyeService } from "../services/birdeye.js";
import type { ApiCallPurpose, ExecutionScope, SignalResult, JsonValue } from "../utils/types.js";

const log = createChildLogger("s1-copy");
const DEFAULT_SCOPE: ExecutionScope = { mode: config.tradeMode, configProfile: "default" };

interface ScoringResult {
  walletAddress: string;
  compositeScore: number;
  archetype: string;
  winRate: number;
  maxLoss: number;
  consistency: number;
  frequency: number;
  diversity: number;
  age: number;
}

interface WalletTradeSample {
  mint: string;
  side: "BUY" | "SELL";
  amountToken: number;
  amountSol: number;
  blockTime: number;
}

export class CopyTradeStrategy extends EventEmitter {
  private eliteWallets: string[] = [];
  private wsMessageHandler: ((data: unknown) => void) | null = null;
  private processingTokens: Set<string> = new Set();
  private recentWalletSignatures: Set<string> = new Set();
  private readonly cfg: typeof config.strategies.s1;
  private readonly scope: ExecutionScope;

  constructor(
    private riskManager: RiskManager,
    private positionTracker: PositionTracker,
    private tradeExecutor: ITradeExecutor,
    private exitMonitor: ExitMonitor,
    private regimeDetector: RegimeDetector,
    private helius: HeliusService,
    private birdeye: BirdeyeService,
    options?: {
      scope?: ExecutionScope;
      strategyConfig?: typeof config.strategies.s1;
    },
  ) {
    super();
    this.scope = options?.scope ?? DEFAULT_SCOPE;
    this.cfg = options?.strategyConfig ?? config.strategies.s1;
  }

  async start(): Promise<void> {
    await this.loadEliteWallets();
    if (this.eliteWallets.length === 0) {
      await this.runWalletScoring();
      await this.loadEliteWallets();
    }
    this.wsMessageHandler = (data) => {
      void this.handleWebhookEvent(data);
    };
    this.helius.connectWebSocket(this.wsMessageHandler);

    await this.subscribeToEliteWallets(this.eliteWallets);

    log.info({ wallets: this.eliteWallets.length }, "S1 copy trade started");
  }

  private async subscribeToEliteWallets(wallets: string[]): Promise<void> {
    await Promise.all(
      wallets.map((wallet) =>
        this.helius.subscribeToAccount(wallet).catch((err) => {
          log.warn({ wallet, err }, "wallet subscription failed");
        }),
      ),
    );
  }

  private async refreshEliteSubscriptions(): Promise<void> {
    if (!this.wsMessageHandler) return;
    this.helius.connectWebSocket(this.wsMessageHandler);
    await this.subscribeToEliteWallets(this.eliteWallets);
  }

  private async loadEliteWallets(): Promise<void> {
    const recent = await db.walletScore.findMany({
      where: { isElite: true },
      orderBy: { scoredAt: "desc" },
      take: this.cfg.walletCount * this.cfg.eliteWalletLoadMultiplier,
      select: { walletAddress: true },
    });

    const seen = new Set<string>();
    this.eliteWallets = recent
      .filter((w) => !seen.has(w.walletAddress) && seen.add(w.walletAddress) !== undefined)
      .slice(0, this.cfg.walletCount)
      .map((w) => w.walletAddress);

    if (this.eliteWallets.length === 0) {
      log.warn({ profile: this.scope.configProfile }, "no elite wallets found — bootstrapping wallet scoring");
    }
  }

  private apiMeta(purpose: ApiCallPurpose, essential = false, batchSize?: number) {
    return {
      strategy: "S1_COPY" as const,
      mode: this.scope.mode,
      configProfile: this.scope.configProfile,
      purpose,
      essential,
      batchSize,
    };
  }

  private trackRecentSignature(signature: string): void {
    this.recentWalletSignatures.add(signature);
    if (this.recentWalletSignatures.size <= this.cfg.recentSignatureCacheSize) return;
    const oldest = this.recentWalletSignatures.values().next().value;
    if (oldest) this.recentWalletSignatures.delete(oldest);
  }

  private async handleWebhookEvent(data: unknown): Promise<void> {
    const detectedAt = Date.now();
    try {
      const event = data as Record<string, unknown>;
      const params = event.params as Record<string, unknown> | undefined;
      if (!params) return;

      const result = params.result as Record<string, unknown> | undefined;
      if (!result) return;

    const accountKey = typeof event.subscriptionAddress === "string"
      ? event.subscriptionAddress
      : "";
    if (!this.eliteWallets.includes(accountKey)) return;

      await this.processWalletActivity(accountKey, detectedAt);
    } catch (err) {
      log.error({ err: (err as Error).message }, "webhook event handler error");
    }
  }

  private async processWalletActivity(walletAddress: string, detectedAt: number): Promise<void> {
    const signatures = await this.helius.getSignaturesForAddressIncremental(
      walletAddress,
      this.cfg.walletActivityFetchLimit,
      this.apiMeta("WALLET_DISCOVERY", false, this.cfg.walletActivityFetchLimit),
    );
    if (!signatures.length) return;

    const nextSignature = signatures
      .map((entry) => (entry as Record<string, unknown>).signature)
      .find((signature): signature is string => typeof signature === "string" && !this.recentWalletSignatures.has(signature));
    if (!nextSignature) return;

    const walletTrade = await this.helius.getWalletTradeFromSignature(
      nextSignature,
      walletAddress,
      this.apiMeta("WALLET_DISCOVERY"),
    );
    if (!walletTrade || walletTrade.side !== "BUY") return;

    this.trackRecentSignature(nextSignature);
    const { tokenAddress, amountSol, amountToken, signature: txSignature } = walletTrade;
    if (!tokenAddress || this.processingTokens.has(tokenAddress)) return;

    this.processingTokens.add(tokenAddress);
    try {

      const walletScore = await db.walletScore.findFirst({
        where: { walletAddress, isElite: true },
        orderBy: { scoredAt: "desc" },
      });

      if (txSignature) {
        const existing = await db.walletActivity.findUnique({ where: { txSignature } });
        if (!existing) {
          const priceUsd = await this.birdeye.getMultiPrice([tokenAddress], this.apiMeta("ENTRY_SCAN"));
          const price = priceUsd.get(tokenAddress);

          await db.walletActivity.create({
            data: {
              walletAddress,
              tokenAddress,
              tokenSymbol: "",
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
    if (!tokenAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenAddress)) {
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
        mode: this.scope.mode,
        configProfile: this.scope.configProfile,
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

    if (this.positionTracker.holdsToken(tokenAddress, this.scope)) {
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
      maxSlippageBps: this.cfg.maxSlippageBps,
      regime: this.regimeDetector.getRegime(),
      walletSource: walletAddress,
      entryVolume5m: (signal.filterResults.volume5m as number) ?? 0,
      entryLiquidity: (signal.filterResults.liquidity as number) ?? undefined,
      entryMcap: (signal.filterResults.marketCap as number) ?? undefined,
      entryBuyPressure: (signal.filterResults.buyPercent as number) ?? undefined,
      copyLeadMs: Date.now() - detectedAt,
    });

    if (result.success) {
      const positions = this.positionTracker.getByStrategy("S1_COPY", this.scope);
      const newPos = positions.find((p) => p.tokenAddress === tokenAddress);
      if (newPos) this.exitMonitor.startMonitoring(newPos);
    }
  }

  private async runFilters(tokenAddress: string): Promise<SignalResult> {
    const filters: Record<string, JsonValue> = {};

    const [overview, security, holders, tradeData] = await Promise.all([
      this.birdeye.getTokenOverview(tokenAddress, this.apiMeta("ENTRY_SCAN")),
      this.birdeye.getTokenSecurity(tokenAddress, this.apiMeta("ENTRY_SCAN")),
      this.birdeye.getTokenHolders(tokenAddress, 1, this.apiMeta("ENTRY_SCAN", false, 1)),
      this.birdeye.getTradeData(tokenAddress, this.apiMeta("ENTRY_SCAN")),
    ]);

    if (!overview) return { passed: false, tokenAddress, tokenSymbol: "", rejectReason: "no overview data", filterResults: filters };

    filters.liquidity = overview.liquidity;
    filters.marketCap = overview.marketCap;
    filters.buyPercent = overview.buyPercent;
    filters.volume5m = overview.volume5m;
    filters.priceAtSignal = overview.price;

    if (overview.liquidity < this.cfg.minLiquidity) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `liquidity ${overview.liquidity} < ${this.cfg.minLiquidity}`, filterResults: filters };
    }

    if (overview.marketCap > this.cfg.maxMarketCap) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `mcap ${overview.marketCap} > ${this.cfg.maxMarketCap}`, filterResults: filters };
    }

    if (overview.buyPercent < this.cfg.minBuyPressure) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `buy pressure ${overview.buyPercent}% < ${this.cfg.minBuyPressure}%`, filterResults: filters };
    }

    if (!security) return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: "no security data", filterResults: filters };

    filters.top10HolderPercent = security.top10HolderPercent;
    filters.freezeable = security.freezeable;
    filters.mintAuthority = security.mintAuthority;

    if (security.top10HolderPercent > this.cfg.maxTop10HolderPercent) {
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `top10 holders ${security.top10HolderPercent}% > ${this.cfg.maxTop10HolderPercent}%`, filterResults: filters };
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

    if (holders.length > 0 && holders[0].percent > this.cfg.maxSingleHolderPercent) {
      filters.topHolderPercent = holders[0].percent;
      return { passed: false, tokenAddress, tokenSymbol: overview.symbol, rejectReason: `top holder ${holders[0].percent}% > ${this.cfg.maxSingleHolderPercent}%`, filterResults: filters };
    }

    if (tradeData) {
      filters.uniqueWallet5m = tradeData.uniqueWallet5m;
      filters.washTradingRatio = tradeData.volume5m > 0
        ? tradeData.uniqueWallet5m / (tradeData.volume5m / 1000)
        : 0;
      if ((filters.washTradingRatio as number) < this.cfg.washTradingThreshold) {
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
    log.info("starting daily wallet scoring");
    const candidateWallets = await this.getCandidateWallets();
    if (candidateWallets.length === 0) {
      log.warn({ profile: this.scope.configProfile }, "wallet scoring skipped — no candidate wallets discovered");
      return;
    }
    const limit = pLimit(config.walletScorer.workerPoolSize);
    const results = await Promise.all(candidateWallets.map((walletAddress) => limit(() => this.scoreWallet(walletAddress))));

    const scores = results
      .filter((r): r is ScoringResult => r !== null)
      .map((r) => ({ address: r.walletAddress, score: r.compositeScore }));

    scores.sort((a, b) => b.score - a.score);

    const previousElites = [...this.eliteWallets];
    const topWallets = scores.slice(0, this.cfg.walletCount);
    const nextEliteWallets = topWallets.map((w) => w.address);

    await db.$transaction(async (tx) => {
      await tx.walletScore.updateMany({
        where: { isElite: true },
        data: { isElite: false },
      });

      for (const walletAddress of nextEliteWallets) {
        const latest = await tx.walletScore.findFirst({
          where: { walletAddress },
          orderBy: { scoredAt: "desc" },
          select: { id: true },
        });
        if (latest) {
          await tx.walletScore.update({
            where: { id: latest.id },
            data: { isElite: true },
          });
        }
      }
    });

    this.eliteWallets = nextEliteWallets;

    const eliteSetChanged =
      previousElites.length !== nextEliteWallets.length ||
      previousElites.some((wallet, idx) => wallet !== nextEliteWallets[idx]);

    if (eliteSetChanged) {
      await this.refreshEliteSubscriptions();
    }

    log.info({ eliteWallets: this.eliteWallets, scored: scores.length }, "wallet scoring complete");
  }

  private async scoreWallet(walletAddress: string): Promise<ScoringResult | null> {
    const txs = await this.helius.getTransactionsForAddress(
      walletAddress,
      { limit: config.walletScorer.txFetchLimit, tokenAccounts: "balanceChanged" },
      this.apiMeta("WALLET_SCORING"),
    );
    const walletTrades = (txs as Array<Record<string, unknown>>)
      .map((tx) => this.extractWalletTrade(tx, walletAddress))
      .filter((trade): trade is WalletTradeSample => trade !== null)
      .sort((a, b) => a.blockTime - b.blockTime);

    if (walletTrades.length < config.walletScorer.minTxCount) return null;

    let wins = 0;
    let losses = 0;
    let maxLoss = 0;
    const tokens = new Set<string>();
    const redFlags = new Set<string>();
    const inventory = new Map<string, { quantity: number; costSol: number }>();

    for (const trade of walletTrades) {
      tokens.add(trade.mint);
      const holding = inventory.get(trade.mint) ?? { quantity: 0, costSol: 0 };

      if (trade.side === "BUY") {
        holding.quantity += trade.amountToken;
        holding.costSol += trade.amountSol;
        inventory.set(trade.mint, holding);
        continue;
      }

      if (holding.quantity <= 0 || holding.costSol <= 0) {
        redFlags.add("unmatched-sells");
        continue;
      }

      const realizedQuantity = Math.min(trade.amountToken, holding.quantity);
      if (realizedQuantity <= 0) {
        redFlags.add("oversold-balance");
        continue;
      }

      const avgCostPerToken = holding.costSol / holding.quantity;
      const realizedCost = avgCostPerToken * realizedQuantity;
      const realizedProceeds = trade.amountToken > 0
        ? trade.amountSol * (realizedQuantity / trade.amountToken)
        : 0;
      const realizedPnlPct = realizedCost > 0 ? (realizedProceeds - realizedCost) / realizedCost : 0;

      if (realizedPnlPct > 0) wins++;
      else losses++;
      maxLoss = Math.max(maxLoss, Math.abs(Math.min(realizedPnlPct, 0)));

      holding.quantity -= realizedQuantity;
      holding.costSol = Math.max(0, holding.costSol - realizedCost);
      if (holding.quantity <= 1e-9 || holding.costSol <= 1e-9) inventory.delete(trade.mint);
      else inventory.set(trade.mint, holding);

      if (trade.amountToken > realizedQuantity + 1e-9) {
        redFlags.add("oversold-balance");
      }
    }

    const totalTrades = wins + losses;
    if (totalTrades === 0) return null;

    const winRate = wins / totalTrades;
    const frequency = walletTrades.length;
    const diversity = tokens.size;
    const consistency = winRate * config.walletScorer.consistencyMultiplier;
    const oldestTradeTime = walletTrades.find((trade) => trade.blockTime > 0)?.blockTime ?? 0;
    const age = oldestTradeTime > 0
      ? Math.max(1, Math.floor((Date.now() / 1000 - oldestTradeTime) / 86_400))
      : 0;
    const weights = config.walletScorer.weights;

    const compositeScore =
      winRate * weights.winRate +
      (1 - Math.min(maxLoss, 1)) * weights.maxLoss +
      consistency * weights.consistency +
      (frequency >= config.walletScorer.freqMin && frequency <= config.walletScorer.freqMax ? 1 : 0.5) * weights.frequency +
      (diversity >= config.walletScorer.diversityMin ? 1 : diversity / config.walletScorer.diversityMin) * weights.diversity +
      (age >= config.walletScorer.ageMinDays ? 1 : age / config.walletScorer.ageMinDays) * weights.age;

    const archetype = winRate > config.walletScorer.archetypeSniper.minWinRate && frequency > config.walletScorer.archetypeSniper.minFreq
      ? "sniper"
      : frequency < config.walletScorer.archetypeSwingMaxFreq
      ? "swing"
      : "scalper";

    await db.walletScore.create({
      data: {
        walletAddress,
        winRate,
        maxLossPercent: maxLoss,
        pnlConsistency: consistency,
        tradeFrequency: frequency,
        tokenDiversity: diversity,
        walletAgeDays: age,
        compositeScore,
        isElite: false,
        redFlags: [...redFlags],
        archetype,
      },
    });

    return {
      walletAddress,
      compositeScore,
      archetype,
      winRate,
      maxLoss,
      consistency,
      frequency,
      diversity,
      age,
    };
  }

  private extractWalletTrade(tx: Record<string, unknown>, walletAddress: string): WalletTradeSample | null {
    const tokenTransfers = (tx.tokenTransfers as Array<Record<string, unknown>> | undefined) ?? [];
    const nativeTransfers = (tx.nativeTransfers as Array<Record<string, unknown>> | undefined) ?? [];
    if (tokenTransfers.length === 0 || nativeTransfers.length === 0) return null;

    const tokenDeltas = new Map<string, number>();
    for (const transfer of tokenTransfers) {
      const mint = typeof transfer.mint === "string" ? transfer.mint : "";
      if (!mint) continue;

      const amount = this.parseTransferAmount(
        transfer.tokenAmount
          ?? transfer.amount
          ?? transfer.uiAmount
          ?? transfer.uiAmountString
          ?? transfer.rawTokenAmount,
      );
      if (amount <= 0) continue;

      const fromWallet = this.extractTransferWalletAddress(transfer, [
        "fromUserAccount",
        "fromWallet",
        "fromOwner",
        "from",
      ]);
      const toWallet = this.extractTransferWalletAddress(transfer, [
        "toUserAccount",
        "toWallet",
        "toOwner",
        "to",
      ]);

      let delta = tokenDeltas.get(mint) ?? 0;
      if (fromWallet === walletAddress) delta -= amount;
      if (toWallet === walletAddress) delta += amount;
      if (delta !== 0) tokenDeltas.set(mint, delta);
    }

    const primary = [...tokenDeltas.entries()]
      .filter(([, delta]) => delta !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    if (!primary) return null;

    const lamportDelta = nativeTransfers.reduce((sum, transfer) => {
      const amount = this.parseTransferAmount(transfer.amount);
      if (amount <= 0) return sum;

      const fromWallet = this.extractTransferWalletAddress(transfer, [
        "fromUserAccount",
        "fromWallet",
        "fromOwner",
        "from",
      ]);
      const toWallet = this.extractTransferWalletAddress(transfer, [
        "toUserAccount",
        "toWallet",
        "toOwner",
        "to",
      ]);

      let delta = sum;
      if (fromWallet === walletAddress) delta -= amount;
      if (toWallet === walletAddress) delta += amount;
      return delta;
    }, 0);

    if (lamportDelta === 0) return null;

    const [mint, tokenDelta] = primary;
    const amountToken = Math.abs(tokenDelta);
    const amountSol = Math.abs(lamportDelta) / 1e9;
    const blockTime = Number(tx.timestamp ?? tx.blockTime ?? 0);

    if (tokenDelta > 0 && lamportDelta < 0) {
      return { mint, side: "BUY", amountToken, amountSol, blockTime };
    }

    if (tokenDelta < 0 && lamportDelta > 0) {
      return { mint, side: "SELL", amountToken, amountSol, blockTime };
    }

    return null;
  }

  private parseTransferAmount(value: unknown): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const uiAmount = record.uiAmount ?? record.uiAmountString ?? record.tokenAmount;
      if (uiAmount !== undefined) return this.parseTransferAmount(uiAmount);
      const rawAmount = Number(record.tokenAmount ?? 0);
      const decimals = Number(record.decimals ?? 0);
      if (Number.isFinite(rawAmount) && Number.isFinite(decimals) && decimals >= 0) {
        return rawAmount / Math.pow(10, decimals);
      }
    }
    return 0;
  }

  private extractTransferWalletAddress(value: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === "string") return candidate;
    }
    return "";
  }

  private async getCandidateWallets(): Promise<string[]> {
    const [existing, observedWallets, discoveredTopTraders] = await Promise.all([
      db.walletScore.findMany({
        orderBy: { compositeScore: "desc" },
        take: this.cfg.scoringPoolSize * this.cfg.candidatePoolMultiplier,
        select: { walletAddress: true },
      }),
      db.walletActivity.findMany({
        distinct: ["walletAddress"],
        orderBy: { detectedAt: "desc" },
        take: this.cfg.scoringPoolSize,
        select: { walletAddress: true },
      }),
      this.discoverTopTraderWallets(),
    ]);

    const seen = new Set<string>();
    return [
      ...existing.map((w) => w.walletAddress),
      ...observedWallets.map((w) => w.walletAddress),
      ...discoveredTopTraders,
    ]
      .filter((walletAddress) => {
        if (!walletAddress || seen.has(walletAddress)) return false;
        seen.add(walletAddress);
        return true;
      })
      .slice(0, this.cfg.scoringPoolSize);
  }

  private async discoverTopTraderWallets(): Promise<string[]> {
    const trending = await this.birdeye.getTokenTrending(this.apiMeta("WALLET_DISCOVERY"));
    const tokenAddresses = trending
      .map((entry) => this.extractBase58((entry as Record<string, unknown>)["address"]))
      .filter((address): address is string => !!address)
      .slice(0, this.cfg.topTraderSeedCount);

    if (tokenAddresses.length === 0) return [];

    const limit = pLimit(this.cfg.topTraderConcurrency);
    const topTraderLists = await Promise.all(
      tokenAddresses.map((address) => limit(() => this.birdeye.getTopTraders(address, this.apiMeta("WALLET_DISCOVERY")))),
    );

    const seen = new Set<string>();
    const wallets: string[] = [];
    for (const traders of topTraderLists) {
      for (const trader of traders as Array<Record<string, unknown>>) {
        const walletAddress = this.extractWalletAddress(trader);
        if (!walletAddress || seen.has(walletAddress)) continue;
        seen.add(walletAddress);
        wallets.push(walletAddress);
      }
    }
    return wallets;
  }

  private extractWalletAddress(value: Record<string, unknown>): string | null {
    for (const key of ["walletAddress", "wallet", "owner", "ownerAddress", "trader", "maker", "address"]) {
      const candidate = this.extractBase58(value[key]);
      if (candidate) return candidate;
    }
    return null;
  }

  private extractBase58(value: unknown): string | null {
    const text = typeof value === "string" ? value.trim() : "";
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) ? text : null;
  }

  stop(): void {
    this.helius.disconnect();
    log.info("S1 copy trade stopped");
  }
}
