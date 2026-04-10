import { db } from "../db/client.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { ExecutionEngine } from "./execution-engine.js";
import { RiskEngine } from "./risk-engine.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class ExitEngine {
  private readonly inFlightPositionIds = new Set<string>();

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
        trailingStopPercent: true,
        metadata: true,
      },
    });

    const prices = await this.birdeye.getMultiPrice(openPositions.map((position) => position.mint));

    for (const position of openPositions) {
      if (this.inFlightPositionIds.has(position.id)) {
        continue;
      }

      const priceUsd = prices[position.mint] ?? null;
      if (!priceUsd || priceUsd <= 0) continue;

      const entryPrice = Number(position.entryPriceUsd);
      const peakPrice = Math.max(Number(position.peakPriceUsd), priceUsd);
      const pnlPercent = ((priceUsd - entryPrice) / entryPrice) * 100;
      const openedAt = position.openedAt.getTime();
      const ageMinutes = (Date.now() - openedAt) / 60_000;
      const exitPlan = this.readExitPlan(position.metadata, {
        tp1SellFraction: settings.exits.tp1SellFraction,
        tp2SellFraction: settings.exits.tp2SellFraction,
        postTp1RetracePercent: settings.exits.postTp1RetracePercent,
        trailingStopPercent: Number(position.trailingStopPercent),
        timeStopMinutes: settings.exits.timeStopMinutes,
        timeStopMinReturnPercent: settings.exits.timeStopMinReturnPercent,
        timeLimitMinutes: settings.exits.timeLimitMinutes,
      });

      this.inFlightPositionIds.add(position.id);
      try {
        if (!position.tp1Done && priceUsd <= Number(position.stopLossPriceUsd)) {
          await this.execution.closePosition({ positionId: position.id, reason: "stop_loss", priceUsd, peakPriceUsd: peakPrice });
          continue;
        }

        if (!position.tp1Done && priceUsd >= Number(position.takeProfit1PriceUsd)) {
          await this.execution.closePosition({
            positionId: position.id,
            reason: "take_profit_1",
            priceUsd,
            fraction: exitPlan.tp1SellFraction,
            peakPriceUsd: peakPrice,
          });
          continue;
        }

        if (position.tp1Done && !position.tp2Done && priceUsd >= Number(position.takeProfit2PriceUsd)) {
          await this.execution.closePosition({
            positionId: position.id,
            reason: "take_profit_2",
            priceUsd,
            fraction: exitPlan.tp2SellFraction,
            peakPriceUsd: peakPrice,
          });
          continue;
        }

        if (position.tp1Done && !position.tp2Done) {
          const retraceFloor = peakPrice * (1 - exitPlan.postTp1RetracePercent / 100);
          if (priceUsd <= retraceFloor) {
            await this.execution.closePosition({ positionId: position.id, reason: "post_tp1_retrace", priceUsd, peakPriceUsd: peakPrice });
            continue;
          }
        }

        if (position.tp2Done) {
          const trailingFloor = peakPrice * (1 - exitPlan.trailingStopPercent / 100);
          if (priceUsd <= trailingFloor) {
            await this.execution.closePosition({ positionId: position.id, reason: "trailing_stop", priceUsd, peakPriceUsd: peakPrice });
            continue;
          }
        }

        if (ageMinutes >= exitPlan.timeStopMinutes && pnlPercent < exitPlan.timeStopMinReturnPercent) {
          await this.execution.closePosition({ positionId: position.id, reason: "time_stop", priceUsd, peakPriceUsd: peakPrice });
          continue;
        }

        if (ageMinutes >= exitPlan.timeLimitMinutes) {
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
      } finally {
        this.inFlightPositionIds.delete(position.id);
      }
    }

    await this.risk.touchActivity("lastExitCheckAt");
  }

  private readExitPlan(
    metadata: unknown,
    fallback: {
      tp1SellFraction: number;
      tp2SellFraction: number;
      postTp1RetracePercent: number;
      trailingStopPercent: number;
      timeStopMinutes: number;
      timeStopMinReturnPercent: number;
      timeLimitMinutes: number;
    },
  ) {
    const record = asRecord(metadata);
    const exitPlan = asRecord(record?.exitPlan);

    return {
      tp1SellFraction: asNumber(exitPlan?.tp1SellFraction) ?? fallback.tp1SellFraction,
      tp2SellFraction: asNumber(exitPlan?.tp2SellFraction) ?? fallback.tp2SellFraction,
      postTp1RetracePercent: asNumber(exitPlan?.postTp1RetracePercent) ?? fallback.postTp1RetracePercent,
      trailingStopPercent: asNumber(exitPlan?.trailingStopPercent) ?? fallback.trailingStopPercent,
      timeStopMinutes: asNumber(exitPlan?.timeStopMinutes) ?? fallback.timeStopMinutes,
      timeStopMinReturnPercent: asNumber(exitPlan?.timeStopMinReturnPercent) ?? fallback.timeStopMinReturnPercent,
      timeLimitMinutes: asNumber(exitPlan?.timeLimitMinutes) ?? fallback.timeLimitMinutes,
    };
  }
}
