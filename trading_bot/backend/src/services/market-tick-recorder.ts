import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import type { ApiBudgetManager } from "../core/api-budget-manager.js";
import type { JupiterService } from "./jupiter.js";
import type { MarketRouter } from "./market-router.js";
import type { RegimeDetector } from "../core/regime-detector.js";

const log = createChildLogger("market-tick");

const TICK_INTERVAL_MS = config.marketTick.intervalMs;

export class MarketTickRecorder {
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(
    private jupiter: JupiterService,
    private marketRouter: Pick<MarketRouter, "getMarketBreadthSample">,
    private regimeDetector: RegimeDetector,
    private budgetManager?: ApiBudgetManager,
  ) {}

  start(): void {
    this.intervalHandle = setInterval(() => this.recordTick(), TICK_INTERVAL_MS);
    this.recordTick();
    log.info("market tick recorder started");
  }

  stop(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private async recordTick(): Promise<void> {
    try {
      const [solPrice, breadth] = await Promise.all([
        this.jupiter.getSolPriceUsd(),
        this.marketRouter.getMarketBreadthSample({ interval: "1h", limit: 10 }),
      ]);

      if (!solPrice) return;

      const state = this.regimeDetector.getState();

      await db.marketTick.create({
        data: {
          solPriceUsd: solPrice,
          solChange5m: state.solChange5m,
          solChange1h: state.solChange1h,
          trendingCount: breadth.length,
          regime: state.regime,
        },
      });
    } catch (err) {
      log.error({ err }, "failed to record market tick");
    }
  }
}
