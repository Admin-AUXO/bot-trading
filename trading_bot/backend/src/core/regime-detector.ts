import { EventEmitter } from "events";
import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import type { MarketRegime, RegimeState } from "../utils/types.js";

const log = createChildLogger("regime-detector");

export class RegimeDetector extends EventEmitter {
  private state: RegimeState = {
    regime: "NORMAL",
    solPrice: 0,
    solChange5m: 0,
    solChange1h: 0,
    trendingCount: 0,
    rollingWinRate: 0.5,
  };

  private solPriceHistory: { price: number; ts: number }[] = [];
  private intervalHandle?: ReturnType<typeof setInterval>;
  private pendingRegime: MarketRegime | null = null;
  private pendingRegimeCount = 0;

  getRegime(): MarketRegime {
    return this.state.regime;
  }

  getState(): RegimeState {
    return { ...this.state };
  }

  updateSolPrice(price: number): void {
    const now = Date.now();
    this.solPriceHistory.push({ price, ts: now });
    this.solPriceHistory = this.solPriceHistory.filter((p) => now - p.ts < config.regime.historyWindowMs);
    this.state.solPrice = price;

    const fiveMinAgo = this.solPriceHistory.find((p) => now - p.ts >= config.regime.fiveMinWindowMs - config.regime.fiveMinToleranceMs && now - p.ts <= config.regime.fiveMinWindowMs + config.regime.fiveMinToleranceMs);
    const oneHourAgo = this.solPriceHistory.find((p) => now - p.ts >= config.regime.historyWindowMs - 60_000);

    if (fiveMinAgo) {
      this.state.solChange5m = ((price - fiveMinAgo.price) / fiveMinAgo.price) * 100;
    }
    if (oneHourAgo) {
      this.state.solChange1h = ((price - oneHourAgo.price) / oneHourAgo.price) * 100;
    }
  }

  updateTrendingCount(count: number): void {
    this.state.trendingCount = count;
  }

  updateRollingWinRate(rate: number): void {
    this.state.rollingWinRate = rate;
  }

  evaluate(): MarketRegime {
    let candidate: MarketRegime = "NORMAL";

    if (this.state.solChange5m < config.regime.riskOffChange5mPct || this.state.solChange1h < config.regime.riskOffChange1hPct) {
      candidate = "RISK_OFF";
    } else if (this.state.trendingCount < config.regime.choppyMaxTrending || this.state.rollingWinRate < config.regime.choppyMaxWinRate) {
      candidate = "CHOPPY";
    } else if (this.state.trendingCount >= config.regime.hotMinTrending && this.state.solChange5m >= config.regime.hotMinChange5mPct) {
      candidate = "HOT";
    }

    if (candidate === this.state.regime) {
      this.pendingRegime = null;
      this.pendingRegimeCount = 0;
      return this.state.regime;
    }

    if (candidate === this.pendingRegime) {
      this.pendingRegimeCount += 1;
    } else {
      this.pendingRegime = candidate;
      this.pendingRegimeCount = 1;
    }

    if (this.pendingRegimeCount >= 2) {
      const prev = this.state.regime;
      this.state.regime = candidate;
      this.pendingRegime = null;
      this.pendingRegimeCount = 0;
      log.info({ from: prev, to: candidate, solPrice: this.state.solPrice }, "regime changed");
      this.emit("regime-change", candidate, prev);
    }

    return this.state.regime;
  }

  async saveSnapshot(): Promise<void> {
    await db.regimeSnapshot.create({
      data: {
        regime: this.state.regime,
        solPrice: this.state.solPrice,
        solChange5m: this.state.solChange5m,
        solChange1h: this.state.solChange1h,
        trendingCount: this.state.trendingCount,
        rollingWinRate: this.state.rollingWinRate,
      },
    });
  }

  startPeriodicEvaluation(intervalMs: number = config.regime.evalIntervalMs): void {
    this.intervalHandle = setInterval(async () => {
      try {
        this.evaluate();
        await this.saveSnapshot();
      } catch (err) {
        log.error({ err }, "regime evaluation cycle failed");
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }
}
