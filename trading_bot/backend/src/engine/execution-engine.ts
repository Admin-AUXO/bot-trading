import { db } from "../db/client.js";
import { toJsonValue } from "../utils/json.js";
import { RiskEngine } from "./risk-engine.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { recordTokenSnapshot } from "../services/token-snapshot-recorder.js";

export class ExecutionEngine {
  constructor(
    private readonly risk: RiskEngine,
    private readonly config: RuntimeConfigService,
  ) {}

  async openDryRunPosition(input: {
    candidateId: string;
    mint: string;
    symbol: string;
    entryPriceUsd: number;
    metrics: Record<string, unknown>;
  }): Promise<string> {
    const settings = await this.config.getSettings();
    const position = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "BotState" WHERE id = 'singleton' FOR UPDATE`;

      const capacity = await this.risk.canOpenPositionTx(tx, settings);
      if (!capacity.allowed) {
        throw new Error(capacity.reason ?? "risk blocked entry");
      }

      const amountUsd = capacity.positionSizeUsd;
      const amountToken = amountUsd / input.entryPriceUsd;

      const created = await tx.position.create({
        data: {
          mint: input.mint,
          symbol: input.symbol,
          entryPriceUsd: input.entryPriceUsd,
          currentPriceUsd: input.entryPriceUsd,
          peakPriceUsd: input.entryPriceUsd,
          stopLossPriceUsd: input.entryPriceUsd * (1 - settings.exits.stopLossPercent / 100),
          takeProfit1PriceUsd: input.entryPriceUsd * settings.exits.tp1Multiplier,
          takeProfit2PriceUsd: input.entryPriceUsd * settings.exits.tp2Multiplier,
          trailingStopPercent: settings.exits.trailingStopPercent,
          amountUsd,
          amountToken,
          remainingToken: amountToken,
          metadata: toJsonValue({
            mode: settings.tradeMode,
            settings,
            metrics: input.metrics,
          }),
        },
      });

      await tx.fill.create({
        data: {
          positionId: created.id,
          side: "BUY",
          priceUsd: input.entryPriceUsd,
          amountUsd,
          amountToken,
          metadata: toJsonValue({
            mode: settings.tradeMode,
            settings,
          }),
        },
      });

      await tx.candidate.update({
        where: { id: input.candidateId },
        data: {
          status: "BOUGHT",
          boughtAt: new Date(),
          acceptedAt: new Date(),
          positionId: created.id,
          rejectReason: null,
          metrics: toJsonValue(input.metrics),
        },
      });

      await tx.botState.update({
        where: { id: "singleton" },
        data: {
          cashUsd: { decrement: amountUsd },
        },
      });

      return created;
    });

    await recordTokenSnapshot({
      candidateId: input.candidateId,
      positionId: position.id,
      mint: input.mint,
      symbol: input.symbol,
      trigger: "trade_buy",
      priceUsd: input.entryPriceUsd,
      metadata: {
        metrics: input.metrics,
      },
    });
    return position.id;
  }

  async closePosition(input: {
    positionId: string;
    reason: string;
    priceUsd: number;
    fraction?: number;
    peakPriceUsd?: number;
  }): Promise<void> {
    const position = await db.position.findUniqueOrThrow({
      where: { id: input.positionId },
    });
    const settings = await this.config.getSettings();

    if (position.status !== "OPEN") return;

    const remainingToken = Number(position.remainingToken);
    const sellFraction = input.fraction ?? 1;
    const amountToken = remainingToken * sellFraction;
    const amountUsd = amountToken * input.priceUsd;
    const entryCostUsd = Number(position.entryPriceUsd) * amountToken;
    const pnlUsd = amountUsd - entryCostUsd;
    const nextRemaining = remainingToken - amountToken;
    const isFullyClosed = nextRemaining <= 0.000000001;

    await db.$transaction(async (tx) => {
      await tx.fill.create({
        data: {
          positionId: position.id,
          side: "SELL",
          priceUsd: input.priceUsd,
          amountUsd,
          amountToken,
          pnlUsd,
          metadata: toJsonValue({
            reason: input.reason,
            mode: settings.tradeMode,
            settings,
          }),
        },
      });

      await tx.position.update({
        where: { id: position.id },
        data: {
          currentPriceUsd: input.priceUsd,
          peakPriceUsd: input.peakPriceUsd ?? position.peakPriceUsd,
          remainingToken: isFullyClosed ? 0 : nextRemaining,
          status: isFullyClosed ? "CLOSED" : "OPEN",
          exitReason: isFullyClosed ? input.reason : null,
          closedAt: isFullyClosed ? new Date() : null,
          tp1Done: position.tp1Done || input.reason === "take_profit_1",
          tp2Done: position.tp2Done || input.reason === "take_profit_2",
        },
      });

      if (isFullyClosed) {
        await tx.candidate.updateMany({
          where: { positionId: position.id },
          data: {
            status: "EXITED",
            rejectReason: input.reason,
          },
        });
      }
    });

    await this.risk.recordSell(amountUsd, pnlUsd);
    await recordTokenSnapshot({
      positionId: position.id,
      mint: position.mint,
      symbol: position.symbol,
      trigger: "trade_sell",
      priceUsd: input.priceUsd,
      metadata: {
        reason: input.reason,
        sellFraction,
        pnlUsd,
        settings,
      },
    });
  }
}
