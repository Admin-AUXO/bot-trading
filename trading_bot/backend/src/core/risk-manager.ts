import Decimal from "decimal.js";
import { EventEmitter } from "events";
import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import type { RuntimeState } from "./runtime-state.js";
import type { PositionTracker } from "./position-tracker.js";
import type { RegimeDetector } from "./regime-detector.js";
import type { Strategy, CapitalLevel, BotStateSnapshot, CapitalConfig, ExecutionScope } from "../utils/types.js";

const log = createChildLogger("risk-manager");

type StrategyRiskConfig = {
  enabled: boolean;
  maxPositions: number;
  positionSizeSol: number;
};

type StrategyRiskConfigMap = Record<Strategy, StrategyRiskConfig>;
type RiskRuntimeState = Omit<RuntimeState, "strategyConfigs"> & {
  strategyConfigs: StrategyRiskConfigMap;
};

export interface StrategyEntryCapacity {
  allowed: boolean;
  reason?: string;
  globalRemaining: number;
  strategyRemaining: number;
  remaining: number;
}

interface RiskManagerOptions {
  capitalConfig?: CapitalConfig;
  persistState?: boolean;
  scope?: ExecutionScope;
  strategyConfigs?: StrategyRiskConfigMap;
  runtimeState?: RiskRuntimeState;
}

export class RiskManager extends EventEmitter {
  private capitalUsd: number;
  private capitalSol: number;
  private walletBalance: number;
  private walletCapitalUsd: number;
  private walletCapitalSol: number;
  private dailyLossUsd = 0;
  private weeklyLossUsd = 0;
  private totalTradesCount = 0;
  private capitalLevel: CapitalLevel = "NORMAL";
  private pauseReasons: Set<string> = new Set();
  private lastDailyReset: Date;
  private lastWeeklyReset: Date;
  private recentResults: boolean[] = [];
  private pendingByStrategy: Map<Strategy, number> = new Map();
  private readonly persistState: boolean;
  private readonly runtimeState: RiskRuntimeState;

  constructor(
    private positionTracker: PositionTracker,
    private regimeDetector: RegimeDetector,
    options?: RiskManagerOptions,
  ) {
    super();
    this.persistState = options?.persistState ?? true;
    this.runtimeState = options?.runtimeState ?? {
      scope: options?.scope ?? { mode: config.tradeMode, configProfile: "default" },
      capitalConfig: options?.capitalConfig ?? config.capital,
      strategyConfigs: options?.strategyConfigs ?? {
        S1_COPY: {
          enabled: config.strategies.s1.enabled,
          maxPositions: config.strategies.s1.maxPositions,
          positionSizeSol: config.strategies.s1.positionSizeSol,
        },
        S2_GRADUATION: {
          enabled: config.strategies.s2.enabled,
          maxPositions: config.strategies.s2.maxPositions,
          positionSizeSol: config.strategies.s2.positionSizeSol,
        },
        S3_MOMENTUM: {
          enabled: config.strategies.s3.enabled,
          maxPositions: config.strategies.s3.maxPositions,
          positionSizeSol: config.strategies.s3.positionSizeSol,
        },
      },
    };
    this.capitalUsd = this.runtimeState.capitalConfig.startingUsd;
    this.capitalSol = this.runtimeState.capitalConfig.startingSol;
    this.walletBalance = this.runtimeState.capitalConfig.startingSol;
    this.walletCapitalUsd = this.runtimeState.capitalConfig.startingUsd;
    this.walletCapitalSol = this.runtimeState.capitalConfig.startingSol;
    this.lastDailyReset = new Date();
    this.lastWeeklyReset = new Date();
  }

  async loadState(): Promise<void> {
    if (!this.persistState) return;
    const state = await db.botState.findUnique({ where: { id: "singleton" } });
    if (!state) return;

    this.capitalUsd = Number(state.capitalUsd);
    this.capitalSol = Number(state.capitalSol);
    this.walletBalance = Number(state.walletBalance);
    this.walletCapitalUsd = Number(state.capitalUsd);
    this.walletCapitalSol = Number(state.walletBalance);
    this.dailyLossUsd = Number(state.dailyLossUsd);
    this.weeklyLossUsd = Number(state.weeklyLossUsd);
    this.capitalLevel = state.capitalLevel;
    this.totalTradesCount = state.totalTradesCount;
    const restoredReasons = state.pauseReasons.length > 0
      ? state.pauseReasons
      : state.pauseReason
      ? [state.pauseReason]
      : [];
    this.pauseReasons = new Set(restoredReasons);
    this.lastDailyReset = state.lastDailyReset;
    this.lastWeeklyReset = state.lastWeeklyReset;
  }

  async saveState(): Promise<void> {
    if (!this.persistState) return;
    await db.botState.upsert({
      where: { id: "singleton" },
      update: {
        capitalUsd: this.capitalUsd,
        capitalSol: this.capitalSol,
        walletBalance: this.walletBalance,
        dailyLossUsd: this.dailyLossUsd,
        weeklyLossUsd: this.weeklyLossUsd,
        dailyLossLimit: this.getDailyLossLimit(),
        weeklyLossLimit: this.getWeeklyLossLimit(),
        capitalLevel: this.capitalLevel,
        regime: this.regimeDetector.getRegime(),
        rollingWinRate: this.getRollingWinRate(),
        totalTradesCount: this.totalTradesCount,
        isRunning: this.pauseReasons.size === 0,
        pauseReason: this.getPrimaryPauseReason(),
        pauseReasons: this.getPauseReasons(),
        lastDailyReset: this.lastDailyReset,
        lastWeeklyReset: this.lastWeeklyReset,
      },
      create: {
        id: "singleton",
        capitalUsd: this.capitalUsd,
        capitalSol: this.capitalSol,
        walletBalance: this.walletBalance,
        dailyLossLimit: this.getDailyLossLimit(),
        weeklyLossLimit: this.getWeeklyLossLimit(),
        capitalLevel: this.capitalLevel,
        regime: this.regimeDetector.getRegime(),
        rollingWinRate: this.getRollingWinRate(),
        isRunning: this.pauseReasons.size === 0,
        pauseReason: this.getPrimaryPauseReason(),
        pauseReasons: this.getPauseReasons(),
      },
    });
  }

  getDailyLossLimit(): number {
    return new Decimal(this.capitalUsd).mul(this.runtimeState.capitalConfig.dailyLossPercent).toNumber();
  }

  getWeeklyLossLimit(): number {
    return new Decimal(this.capitalUsd).mul(this.runtimeState.capitalConfig.weeklyLossPercent).toNumber();
  }

  getRollingWinRate(): number {
    if (this.recentResults.length === 0) return 0.5;
    const wins = this.recentResults.filter(Boolean).length;
    return wins / this.recentResults.length;
  }

  pause(reason = "manual pause"): void {
    this.pauseReasons.add(reason);
  }

  unpause(reason: string): boolean {
    return this.pauseReasons.delete(reason);
  }

  resume(): boolean {
    return this.unpause("manual pause");
  }

  getPauseReasons(): string[] {
    return [...this.pauseReasons];
  }

  getPrimaryPauseReason(): string | null {
    return this.getPauseReasons()[0] ?? null;
  }

  getPositionSize(strategy: Strategy): number {
    const regime = this.regimeDetector.getRegime();
    const tier = this.getScalingTier();
    const configuredBase = this.runtimeState.strategyConfigs[strategy].positionSizeSol;
    const defaultBase = strategy === "S3_MOMENTUM"
      ? config.strategies.s3.positionSizeSol
      : strategy === "S2_GRADUATION"
      ? config.strategies.s2.positionSizeSol
      : config.strategies.s1.positionSizeSol;

    let base = configuredBase;
    if (configuredBase === defaultBase) {
      base = strategy === "S3_MOMENTUM" ? tier.s3Size : tier.s1s2Size;
    }

    if (regime === "CHOPPY") base = new Decimal(base).mul("0.5").toNumber();
    if (this.capitalLevel === "WARNING") base = new Decimal(base).mul("0.75").toNumber();

    return base;
  }

  private getScalingTier(): (typeof config.scaling)[number] {
    const tiers = config.scaling;
    let tier: (typeof config.scaling)[number] = tiers[0];
    for (const t of tiers) {
      if (this.capitalUsd >= t.capital) tier = t;
    }
    return tier;
  }

  reservePosition(strategy: Strategy): void {
    this.pendingByStrategy.set(strategy, (this.pendingByStrategy.get(strategy) ?? 0) + 1);
  }

  releasePosition(strategy: Strategy): void {
    const current = this.pendingByStrategy.get(strategy) ?? 0;
    if (current <= 1) this.pendingByStrategy.delete(strategy);
    else this.pendingByStrategy.set(strategy, current - 1);
  }

  private checkStrategySafety(strategy: Strategy, requestedAmountSol?: number): { allowed: boolean; reason?: string } {
    if (!this.runtimeState.strategyConfigs[strategy].enabled) {
      return { allowed: false, reason: `${strategy} disabled` };
    }

    const pauseReason = this.getPrimaryPauseReason();
    if (pauseReason) {
      return { allowed: false, reason: pauseReason };
    }

    const regime = this.regimeDetector.getRegime();

    if (regime === "RISK_OFF") {
      return { allowed: false, reason: "market regime is RISK_OFF" };
    }

    if (this.dailyLossUsd >= this.getDailyLossLimit()) {
      return { allowed: false, reason: "daily loss limit reached" };
    }

    if (this.weeklyLossUsd >= this.getWeeklyLossLimit()) {
      return { allowed: false, reason: "weekly loss limit reached" };
    }

    const size = requestedAmountSol ?? this.getPositionSize(strategy);
    if (this.walletBalance < size + this.runtimeState.capitalConfig.gasReserve) {
      return { allowed: false, reason: "insufficient balance (gas reserve protected)" };
    }

    if (this.capitalLevel === "HALT") {
      return { allowed: false, reason: "capital below $100 — trading halted" };
    }

    if (this.capitalLevel === "CRITICAL" && strategy !== "S3_MOMENTUM") {
      return { allowed: false, reason: "capital critical — only S3 allowed" };
    }

    if (regime === "CHOPPY" && strategy === "S1_COPY") {
      return { allowed: false, reason: "choppy regime — S1 paused" };
    }

    return { allowed: true };
  }

  canIncreasePosition(strategy: Strategy, requestedAmountSol?: number): { allowed: boolean; reason?: string } {
    return this.checkStrategySafety(strategy, requestedAmountSol);
  }

  getEntryCapacity(strategy: Strategy, requestedAmountSol?: number): StrategyEntryCapacity {
    const safety = this.checkStrategySafety(strategy, requestedAmountSol);
    if (!safety.allowed) {
      return {
        allowed: false,
        reason: safety.reason,
        globalRemaining: 0,
        strategyRemaining: 0,
        remaining: 0,
      };
    }

    const pendingTotal = [...this.pendingByStrategy.values()].reduce((a, b) => a + b, 0);
    const stratConfig = this.runtimeState.strategyConfigs[strategy];
    const stratPending = this.pendingByStrategy.get(strategy) ?? 0;
    const globalRemaining = Math.max(
      0,
      this.runtimeState.capitalConfig.maxOpenPositions - (this.positionTracker.openCount(this.runtimeState.scope) + pendingTotal),
    );
    const strategyRemaining = Math.max(
      0,
      stratConfig.maxPositions - (this.positionTracker.countByStrategy(strategy, this.runtimeState.scope) + stratPending),
    );
    const remaining = Math.min(globalRemaining, strategyRemaining);

    if (remaining <= 0) {
      return {
        allowed: false,
        reason: globalRemaining <= 0
          ? `max ${this.runtimeState.capitalConfig.maxOpenPositions} open positions reached`
          : `max ${stratConfig.maxPositions} ${strategy} positions reached`,
        globalRemaining,
        strategyRemaining,
        remaining,
      };
    }

    return {
      allowed: true,
      globalRemaining,
      strategyRemaining,
      remaining,
    };
  }

  canOpenPosition(strategy: Strategy, requestedAmountSol?: number): { allowed: boolean; reason?: string } {
    const capacity = this.getEntryCapacity(strategy, requestedAmountSol);
    if (!capacity.allowed) {
      return { allowed: false, reason: capacity.reason };
    }
    return { allowed: true };
  }

  recordBuyExecution(spendSol: number, feeSol: number = 0): void {
    this.walletBalance = Math.max(0, this.walletBalance - spendSol - feeSol);
    this.capitalSol = this.walletBalance;
  }

  recordSellExecution(receivedSol: number, pnlUsd: number, isWin: boolean, feeSol: number = 0): void {
    this.walletBalance = Math.max(0, this.walletBalance + receivedSol - feeSol);
    this.capitalSol = this.walletBalance;
    this.recordTradeResult(pnlUsd, isWin);
  }

  recordTradeResult(pnlUsd: number, isWin: boolean): void {
    this.totalTradesCount++;
    this.recentResults.push(isWin);
    if (this.recentResults.length > this.runtimeState.capitalConfig.rollingWindowSize) this.recentResults.shift();

    if (!isWin) {
      this.dailyLossUsd += Math.abs(pnlUsd);
      this.weeklyLossUsd += Math.abs(pnlUsd);
    }

    this.capitalUsd += pnlUsd;
    this.updateCapitalLevel();
    this.regimeDetector.updateRollingWinRate(this.getRollingWinRate());

    if (this.dailyLossUsd >= this.getDailyLossLimit()) {
      this.pause("daily loss limit hit");
      log.warn({ dailyLoss: this.dailyLossUsd, limit: this.getDailyLossLimit() }, "daily loss limit reached");
      this.emit("daily-limit-hit");
    }

    if (this.weeklyLossUsd >= this.getWeeklyLossLimit()) {
      this.pause("weekly loss limit hit");
      log.warn({ weeklyLoss: this.weeklyLossUsd, limit: this.getWeeklyLossLimit() }, "weekly loss limit reached");
      this.emit("weekly-limit-hit");
    }
  }

  updateWalletBalance(balance: number): void {
    this.walletBalance = balance;
    this.capitalSol = balance;
  }

  updateWalletCapital(balanceSol: number, solPriceUsd: number | null): void {
    this.walletCapitalSol = balanceSol;
    if (solPriceUsd != null && Number.isFinite(solPriceUsd) && solPriceUsd > 0) {
      this.walletCapitalUsd = new Decimal(balanceSol).mul(solPriceUsd).toDecimalPlaces(2).toNumber();
    }
  }

  getScope(): ExecutionScope {
    return { ...this.runtimeState.scope };
  }

  private updateCapitalLevel(): void {
    const startingCapital = this.runtimeState.capitalConfig.startingUsd;
    const ratio = new Decimal(this.capitalUsd).div(startingCapital).toNumber();
    const prev = this.capitalLevel;

    if (ratio <= 0.5) this.capitalLevel = "HALT";
    else if (ratio <= 0.7) this.capitalLevel = "CRITICAL";
    else if (ratio <= 0.85) this.capitalLevel = "WARNING";
    else if (ratio <= 1.0) this.capitalLevel = "CAUTION";
    else this.capitalLevel = "NORMAL";

    if (this.capitalLevel !== prev) {
      log.info({ from: prev, to: this.capitalLevel, capital: this.capitalUsd }, "capital level changed");
      this.emit("capital-level-change", this.capitalLevel, prev);
    }
  }

  checkDailyReset(): void {
    const now = new Date();
    const lastResetDay = this.lastDailyReset.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    if (lastResetDay !== todayStr) {
      this.dailyLossUsd = 0;
      this.lastDailyReset = now;
      this.unpause("daily loss limit hit");
      log.info("daily loss counter reset");
    }

    const lastWeek = Math.floor(this.lastWeeklyReset.getTime() / config.main.weeklyPeriodMs);
    const thisWeek = Math.floor(now.getTime() / config.main.weeklyPeriodMs);
    if (lastWeek !== thisWeek) {
      this.weeklyLossUsd = 0;
      this.lastWeeklyReset = now;
      this.unpause("weekly loss limit hit");
      log.info("weekly loss counter reset");
    }
  }

  getSnapshot(): BotStateSnapshot {
    return {
      scope: this.getScope(),
      capitalUsd: this.capitalUsd,
      capitalSol: this.capitalSol,
      walletBalance: this.walletBalance,
      walletCapitalUsd: this.walletCapitalUsd,
      walletCapitalSol: this.walletCapitalSol,
      dailyLossUsd: this.dailyLossUsd,
      weeklyLossUsd: this.weeklyLossUsd,
      dailyLossLimit: this.getDailyLossLimit(),
      weeklyLossLimit: this.getWeeklyLossLimit(),
      capitalLevel: this.capitalLevel,
      regime: this.regimeDetector.getRegime(),
      rollingWinRate: this.getRollingWinRate(),
      isRunning: this.pauseReasons.size === 0,
      pauseReason: this.getPrimaryPauseReason(),
      pauseReasons: this.getPauseReasons(),
      openPositions: this.positionTracker.getOpen(this.runtimeState.scope),
    };
  }
}
