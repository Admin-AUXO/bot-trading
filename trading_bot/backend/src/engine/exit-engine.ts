import { db } from "../db/client.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { getExitDecision } from "../services/strategy-exit.js";
import { ExecutionEngine } from "./execution-engine.js";
import { RiskEngine } from "./risk-engine.js";
import { BOT_STATE_ID } from "./constants.js";
import { logger } from "../utils/logger.js";
import { recordOperatorEvent } from "../services/operator-events.js";

const IN_FLIGHT_TIMEOUT_MS = 90_000; // 90-second hard timeout for hung close attempts

/** Tracks when a given position was added to the in-flight set. */
const inFlightAddedAt = new Map<string, number>();

/** Guards against the same position being closed concurrently from multiple exit passes. */
function markInFlight(positionId: string): boolean {
  const now = Date.now();
  // Evict stale entries (hung trades)
  for (const [id, addedAt] of inFlightAddedAt) {
    if (now - addedAt > IN_FLIGHT_TIMEOUT_MS) {
      inFlightAddedAt.delete(id);
    }
  }
  if (inFlightAddedAt.has(positionId)) return false;
  inFlightAddedAt.set(positionId, now);
  return true;
}

function clearInFlight(positionId: string): void {
  inFlightAddedAt.delete(positionId);
}

export class ExitEngine {
  private readonly priceUnavailableCount = new Map<string, number>();
  private readonly PRICE_SKIP_THRESHOLD = 3;

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
      if (!markInFlight(position.id)) {
        continue;
      }

      const priceUsd = prices[position.mint] ?? null;
      if (!priceUsd || priceUsd <= 0) {
        const skipCount = (this.priceUnavailableCount.get(position.id) ?? 0) + 1;
        this.priceUnavailableCount.set(position.id, skipCount);
        logger.warn({ positionId: position.id, mint: position.mint, priceUsd }, "price unavailable, skipping exit check");
        if (skipCount >= this.PRICE_SKIP_THRESHOLD) {
          this.priceUnavailableCount.delete(position.id);
          await recordOperatorEvent({
            kind: "exit_price_unavailable",
            level: "warning",
            title: `Exit check stalled: price unavailable for ${position.mint}`,
            detail: `Position ${position.id} has been skipped ${skipCount} consecutive times due to missing price data.`,
            entityType: "position",
            entityId: position.id,
            metadata: { mint: position.mint, skipCount },
          });
        }
        clearInFlight(position.id);
        continue;
      }

      // Reset skip counter on successful price fetch
      this.priceUnavailableCount.delete(position.id);

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

      try {
        if (exitDecision) {
          // Serialise closePosition calls through the execution engine's exclusive queue
          // to prevent concurrent close attempts on the same position from multiple loops.
          await this.execution.runExclusive(() =>
            this.execution.closePosition({
              positionId: position.id,
              reason: exitDecision.reason,
              priceUsd,
              fraction: exitDecision.fraction,
              peakPriceUsd: exitDecision.peakPriceUsd,
            }),
          );
          clearInFlight(position.id);
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
        clearInFlight(position.id);
      }
    }

    await this.risk.touchActivity("lastExitCheckAt");
  }
}
