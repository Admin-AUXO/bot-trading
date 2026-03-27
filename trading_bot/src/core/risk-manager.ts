import Decimal from "decimal.js";
import { EventEmitter } from "events";
import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import type { PositionTracker } from "./position-tracker.js";
import type { RegimeDetector } from "./regime-detector.js";
import type { Strategy, MarketRegime, CapitalLevel, BotStateSnapshot } from "../utils/types.js";

const log = createChildLogger("risk-manager");

export class RiskManager extends EventEmitter {
  private capitalUsd: number;
  private capitalSol: number;
  private walletBalance: number;
  private dailyLossUsd = 0;
  private weeklyLossUsd = 0;
  private totalTradesCount = 0;
  private capitalLevel: CapitalLevel = "NORMAL";
  private pauseReason: string | null = null;
  private lastDailyReset: Date;
  private lastWeeklyReset: Date;
  private recentResults: boolean[] = [];
  private pendingByStrategy: Map<Strategy, number> = new Map();

  constructor(
    private positionTracker: PositionTracker,
    private regimeDetector: RegimeDetector,
  ) {
    super();
    this.capitalUsd = config.capital.startingUsd;
    this.capitalSol = config.capital.startingSol;
    this.walletBalance = config.capital.startingSol;
    this.lastDailyReset = new Date();
    this.lastWeeklyReset = new Date();
  }

  async loadState(): Promise<void> {
    const state = await db.botState.findUnique({ where: { id: "singleton" } });
    if (!state) return;

    this.capitalUsd = Number(state.capitalUsd);
    this.capitalSol = Number(state.capitalSol);
    this.walletBalance = Number(state.walletBalance);
    this.dailyLossUsd = Number(state.dailyLossUsd);
    this.weeklyLossUsd = Number(state.weeklyLossUsd);
    this.capitalLevel = state.capitalLevel;
    this.totalTradesCount = state.totalTradesCount;
    this.pauseReason = state.isRunning ? state.pauseReason : (state.pauseReason ?? "manual pause");
    this.lastDailyReset = state.lastDailyReset;
    this.lastWeeklyReset = state.lastWeeklyReset;
  }

  async saveState(): Promise<void> {
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
        isRunning: !this.pauseReason,
        pauseReason: this.pauseReason,
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
        isRunning: !this.pauseReason,
        pauseReason: this.pauseReason,
      },
    });
  }

  getDailyLossLimit(): number {
    return new Decimal(this.capitalUsd).mul(config.capital.dailyLossPercent).toNumber();
  }

  getWeeklyLossLimit(): number {
    return new Decimal(this.capitalUsd).mul(config.capital.weeklyLossPercent).toNumber();
  }

  getRollingWinRate(): number {
    if (this.recentResults.length === 0) return 0.5;
    const wins = this.recentResults.filter(Boolean).length;
    return wins / this.recentResults.length;
  }

  pause(reason = "manual pause"): void {
    if (this.pauseReason && this.pauseReason !== "manual pause") return;
    this.pauseReason = reason;
  }

  resume(): boolean {
    if (this.pauseReason !== "manual pause") return false;
    this.pauseReason = null;
    return true;
  }

  getPositionSize(strategy: Strategy): number {
    const regime = this.regimeDetector.getRegime();
    const tier = this.getScalingTier();

    let base: number;
    if (strategy === "S3_MOMENTUM") {
      base = tier.s3Size;
    } else {
      base = tier.s1s2Size;
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

  canOpenPosition(strategy: Strategy, requestedAmountSol?: number): { allowed: boolean; reason?: string } {
    if (this.pauseReason) {
      return { allowed: false, reason: this.pauseReason };
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

    const pendingTotal = [...this.pendingByStrategy.values()].reduce((a, b) => a + b, 0);
    if (this.positionTracker.openCount() + pendingTotal >= config.capital.maxOpenPositions) {
      return { allowed: false, reason: "max 5 open positions reached" };
    }

    const stratConfig = this.getStrategyConfig(strategy);
    const stratPending = this.pendingByStrategy.get(strategy) ?? 0;
    if (this.positionTracker.countByStrategy(strategy) + stratPending >= stratConfig.maxPositions) {
      return { allowed: false, reason: `max ${stratConfig.maxPositions} ${strategy} positions reached` };
    }

    const size = requestedAmountSol ?? this.getPositionSize(strategy);
    if (this.walletBalance < size + config.capital.gasReserve) {
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

  private getStrategyConfig(strategy: Strategy) {
    switch (strategy) {
      case "S1_COPY": return config.strategies.s1;
      case "S2_GRADUATION": return config.strategies.s2;
      case "S3_MOMENTUM": return config.strategies.s3;
    }
  }

  recordTradeResult(pnlUsd: number, isWin: boolean): void {
    this.totalTradesCount++;
    this.recentResults.push(isWin);
    if (this.recentResults.length > config.capital.rollingWindowSize) this.recentResults.shift();

    if (!isWin) {
      this.dailyLossUsd += Math.abs(pnlUsd);
      this.weeklyLossUsd += Math.abs(pnlUsd);
    }

    this.capitalUsd += pnlUsd;
    this.updateCapitalLevel();
    this.regimeDetector.updateRollingWinRate(this.getRollingWinRate());

    if (this.dailyLossUsd >= this.getDailyLossLimit()) {
      this.pauseReason = "daily loss limit hit";
      log.warn({ dailyLoss: this.dailyLossUsd, limit: this.getDailyLossLimit() }, "daily loss limit reached");
      this.emit("daily-limit-hit");
    }

    if (this.weeklyLossUsd >= this.getWeeklyLossLimit()) {
      this.pauseReason = "weekly loss limit hit";
      log.warn({ weeklyLoss: this.weeklyLossUsd, limit: this.getWeeklyLossLimit() }, "weekly loss limit reached");
      this.emit("weekly-limit-hit");
    }
  }

  updateWalletBalance(balance: number): void {
    this.walletBalance = balance;
    this.capitalSol = balance;
  }

  private updateCapitalLevel(): void {
    const startingCapital = config.capital.startingUsd;
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
      if (this.pauseReason === "daily loss limit hit") this.pauseReason = null;
      log.info("daily loss counter reset");
    }

    const lastWeek = Math.floor(this.lastWeeklyReset.getTime() / config.main.weeklyPeriodMs);
    const thisWeek = Math.floor(now.getTime() / config.main.weeklyPeriodMs);
    if (lastWeek !== thisWeek) {
      this.weeklyLossUsd = 0;
      this.lastWeeklyReset = now;
      if (this.pauseReason === "weekly loss limit hit") this.pauseReason = null;
      log.info("weekly loss counter reset");
    }
  }

  getSnapshot(): BotStateSnapshot {
    return {
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
      isRunning: !this.pauseReason,
      pauseReason: this.pauseReason,
      openPositions: this.positionTracker.getOpen(),
    };
  }
}
