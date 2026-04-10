import { db } from "../db/client.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { getExitDecision } from "../services/strategy-exit.js";
import { ExecutionEngine } from "./execution-engine.js";
import { RiskEngine } from "./risk-engine.js";

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

      const exitDecision = getExitDecision({
        openedAt: position.openedAt,
        entryPriceUsd: Number(position.entryPriceUsd),
        peakPriceUsd: Number(position.peakPriceUsd),
        stopLossPriceUsd: Number(position.stopLossPriceUsd),
        takeProfit1PriceUsd: Number(position.takeProfit1PriceUsd),
        takeProfit2PriceUsd: Number(position.takeProfit2PriceUsd),
        trailingStopPercent: Number(position.trailingStopPercent),
        tp1Done: position.tp1Done,
        tp2Done: position.tp2Done,
        metadata: position.metadata,
      }, priceUsd, {
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
        if (exitDecision) {
          await this.execution.closePosition({
            positionId: position.id,
            reason: exitDecision.reason,
            priceUsd,
            fraction: exitDecision.fraction,
            peakPriceUsd: exitDecision.peakPriceUsd,
          });
          continue;
        }

        await db.position.update({
          where: { id: position.id },
          data: {
            currentPriceUsd: priceUsd,
            peakPriceUsd: Math.max(Number(position.peakPriceUsd), priceUsd),
          },
        });
      } finally {
        this.inFlightPositionIds.delete(position.id);
      }
    }

    await this.risk.touchActivity("lastExitCheckAt");
  }
}
