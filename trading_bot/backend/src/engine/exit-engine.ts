import { db } from "../db/client.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import {
  getExitDecision,
  computeAtrFromPrices,
  ATR_PERIOD,
  type LiveExitContext,
} from "../services/strategy-exit.js";
import { ExecutionEngine } from "./execution-engine.js";
import { RiskEngine } from "./risk-engine.js";
import { BOT_STATE_ID } from "./constants.js";
import { logger } from "../utils/logger.js";
import { recordOperatorEvent } from "../services/operator-events.js";
import type { TradeDataSnapshot } from "../types/domain.js";

const IN_FLIGHT_TIMEOUT_MS = 90_000;

const inFlightAddedAt = new Map<string, number>();

const priceHistory = new Map<string, number[]>();

function markInFlight(positionId: string): boolean {
  const now = Date.now();
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

    if (openPositions.length === 0) {
      await this.risk.touchActivity("lastExitCheckAt");
      return;
    }

    const [prices, tradeDataMap] = await Promise.all([
      this.birdeye.getMultiPrice(openPositions.map((p) => p.mint)),
      this.fetchTradeDataForMints(openPositions.map((p) => p.mint)),
    ]);

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

      this.priceUnavailableCount.delete(position.id);

      const history = priceHistory.get(position.mint) ?? [];
      history.push(priceUsd);
      if (history.length > ATR_PERIOD + 2) history.shift();
      priceHistory.set(position.mint, history);
      const atrUsd = computeAtrFromPrices(history);

      const tradeData = tradeDataMap.get(position.mint) ?? null;
      const volume5mAtEntry = extractVolume5mAtEntry(position.metadata);
      const liveContext: LiveExitContext = {
        volume5mUsd: tradeData?.volume5mUsd ?? null,
        buySellRatio: computeBuySellRatio(tradeData),
        atrUsd,
        volume5mAtEntry,
      };

      const exitDecision = getExitDecision(
        {
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
        },
        priceUsd,
        {
          tp1SellFraction: settings.exits.tp1SellFraction,
          tp2SellFraction: settings.exits.tp2SellFraction,
          postTp1RetracePercent: settings.exits.postTp1RetracePercent,
          trailingStopPercent: Number(position.trailingStopPercent),
          timeStopMinutes: settings.exits.timeStopMinutes,
          timeStopMinReturnPercent: settings.exits.timeStopMinReturnPercent,
          timeLimitMinutes: settings.exits.timeLimitMinutes,
          partialStopLossEnabled: true,
          partialSlThresholdPercent: 10,
          partialSlSellFraction: 0.5,
          momentumTpExtensionEnabled: true,
          recalibrateIntervalMinutes: 5,
        },
        liveContext,
      );

      try {
        if (exitDecision) {
          try {
            await this.execution.runExclusive(() =>
              this.execution.closePosition({
                positionId: position.id,
                reason: exitDecision.reason,
                priceUsd,
                fraction: exitDecision.fraction,
                peakPriceUsd: exitDecision.peakPriceUsd,
              }),
            );
          } catch (err) {
            logger.warn({ err, positionId: position.id }, "closePosition failed in exit check");
            await recordOperatorEvent({
              kind: "exit_close_failed",
              level: "warning",
              title: `Exit close failed for position ${position.id}`,
              detail: err instanceof Error ? err.message : String(err),
              entityType: "position",
              entityId: position.id,
              metadata: { mint: position.mint, reason: exitDecision.reason },
            });
          }
          clearInFlight(position.id);
          priceHistory.delete(position.mint);
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

  private async fetchTradeDataForMints(
    mints: string[],
  ): Promise<Map<string, TradeDataSnapshot>> {
    const result = new Map<string, TradeDataSnapshot>();
    const batchSize = 10;
    for (let i = 0; i < mints.length; i += batchSize) {
      const batch = mints.slice(i, i + batchSize);
      const tradeResults = await Promise.allSettled(
        batch.map(async (mint) => {
          const data = await this.birdeye.getTradeData(mint);
          return { mint, data };
        }),
      );
      for (const r of tradeResults) {
        if (r.status === "fulfilled" && r.value.data) {
          result.set(r.value.mint, r.value.data as unknown as TradeDataSnapshot);
        }
      }
    }
    return result;
  }
}

function computeBuySellRatio(td: TradeDataSnapshot | null): number | null {
  if (!td) return null;
  const buy = td.volumeBuy5mUsd ?? 0;
  const sell = td.volumeSell5mUsd ?? 0;
  if (sell <= 0) return buy > 0 ? null : 1;
  return buy / sell;
}

function extractVolume5mAtEntry(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  const metrics = record.metrics as Record<string, unknown> | undefined;
  if (!metrics) return null;
  const td = metrics.tradeData as Record<string, unknown> | undefined;
  return typeof td?.volume5mUsd === "number" ? (td.volume5mUsd as number) : null;
}