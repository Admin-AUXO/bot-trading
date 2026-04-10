import { db } from "../db/client.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { ExecutionEngine } from "./execution-engine.js";
import { RiskEngine } from "./risk-engine.js";

export class ExitEngine {
  constructor(
    private readonly birdeye: BirdeyeClient,
    private readonly execution: ExecutionEngine,
    private readonly config: RuntimeConfigService,
    private readonly risk: RiskEngine,
  ) {}

  async run(): Promise<void> {
    const settings = await this.config.getSettings();
    const openPositions = await db.position.findMany({
      where: { status: "OPEN" },
      orderBy: { openedAt: "asc" },
      select: {
        id: true,
        mint: true,
        openedAt: true,
        entryPriceUsd: true,
        peakPriceUsd: true,
        stopLossPriceUsd: true,
        takeProfit1PriceUsd: true,
        takeProfit2PriceUsd: true,
        tp1Done: true,
        tp2Done: true,
      },
    });

    const pricedPositions = await Promise.allSettled(openPositions.map(async (position) => ({
      position,
      priceUsd: await this.birdeye.getPrice(position.mint),
    })));

    for (const pricedPosition of pricedPositions) {
      if (pricedPosition.status !== "fulfilled") continue;

      const { position, priceUsd } = pricedPosition.value;
      if (!priceUsd || priceUsd <= 0) continue;

      const entryPrice = Number(position.entryPriceUsd);
      const peakPrice = Math.max(Number(position.peakPriceUsd), priceUsd);
      const pnlPercent = ((priceUsd - entryPrice) / entryPrice) * 100;
      const openedAt = position.openedAt.getTime();
      const ageMinutes = (Date.now() - openedAt) / 60_000;

      if (!position.tp1Done && priceUsd <= Number(position.stopLossPriceUsd)) {
        await this.execution.closePosition({ positionId: position.id, reason: "stop_loss", priceUsd, peakPriceUsd: peakPrice });
        continue;
      }

      if (!position.tp1Done && priceUsd >= Number(position.takeProfit1PriceUsd)) {
        await this.execution.closePosition({
          positionId: position.id,
          reason: "take_profit_1",
          priceUsd,
          fraction: settings.exits.tp1SellFraction,
          peakPriceUsd: peakPrice,
        });
        continue;
      }

      if (position.tp1Done && !position.tp2Done && priceUsd >= Number(position.takeProfit2PriceUsd)) {
        await this.execution.closePosition({
          positionId: position.id,
          reason: "take_profit_2",
          priceUsd,
          fraction: settings.exits.tp2SellFraction,
          peakPriceUsd: peakPrice,
        });
        continue;
      }

      if (position.tp1Done && !position.tp2Done) {
        const retraceFloor = peakPrice * (1 - settings.exits.postTp1RetracePercent / 100);
        if (priceUsd <= retraceFloor) {
          await this.execution.closePosition({ positionId: position.id, reason: "post_tp1_retrace", priceUsd, peakPriceUsd: peakPrice });
          continue;
        }
      }

      if (position.tp2Done) {
        const trailingFloor = peakPrice * (1 - settings.exits.trailingStopPercent / 100);
        if (priceUsd <= trailingFloor) {
          await this.execution.closePosition({ positionId: position.id, reason: "trailing_stop", priceUsd, peakPriceUsd: peakPrice });
          continue;
        }
      }

      if (ageMinutes >= settings.exits.timeStopMinutes && pnlPercent < settings.exits.timeStopMinReturnPercent) {
        await this.execution.closePosition({ positionId: position.id, reason: "time_stop", priceUsd, peakPriceUsd: peakPrice });
        continue;
      }

      if (ageMinutes >= settings.exits.timeLimitMinutes) {
        await this.execution.closePosition({ positionId: position.id, reason: "time_limit", priceUsd, peakPriceUsd: peakPrice });
        continue;
      }

      await db.position.update({
        where: { id: position.id },
        data: {
          currentPriceUsd: priceUsd,
          peakPriceUsd: peakPrice,
        },
      });
    }

    await this.risk.touchActivity("lastExitCheckAt");
  }
}
