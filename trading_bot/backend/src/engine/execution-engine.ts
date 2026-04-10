import type { Position, Prisma } from "@prisma/client";
import { db } from "../db/client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { LiveTradeExecutor, type LiveTradeExecution } from "../services/live-trade-executor.js";
import { buildExitPlan } from "../services/strategy-exit.js";
import { recordTokenSnapshot } from "../services/token-snapshot-recorder.js";
import type { BotSettings } from "../types/domain.js";
import { toJsonValue } from "../utils/json.js";
import { logger } from "../utils/logger.js";
import { RiskEngine } from "./risk-engine.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatTokenAmount(amount: number, decimals: number): string {
  const scale = Math.min(Math.max(decimals, 0), 9);
  return amount.toFixed(scale).replace(/\.?0+$/, "");
}

type OpenPositionInput = {
  candidateId: string;
  mint: string;
  symbol: string;
  entryPriceUsd: number;
  metrics: Record<string, unknown>;
};

type ClosePositionInput = {
  positionId: string;
  reason: string;
  priceUsd: number;
  fraction?: number;
  peakPriceUsd?: number;
};

type LivePositionContext = {
  tokenDecimals: number;
  quoteMint: string;
  quoteDecimals: number;
  wallet: string;
  senderUrl: string | null;
};

type PersistOpenInput = {
  settings: BotSettings;
  input: OpenPositionInput;
  amountUsd: number;
  amountToken: number;
  entryPriceUsd: number;
  txSignature?: string;
  liveContext?: LivePositionContext;
  fillMetadata?: Record<string, unknown>;
};

type PersistCloseInput = {
  settings: BotSettings;
  input: ClosePositionInput;
  amountUsd: number;
  amountToken: number;
  executionPriceUsd: number;
  txSignature?: string;
  fillMetadata?: Record<string, unknown>;
};

export class ExecutionEngine {
  private readonly live = new LiveTradeExecutor();
  private executionQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly risk: RiskEngine,
    private readonly config: RuntimeConfigService,
  ) {}

  async openPosition(input: OpenPositionInput): Promise<string> {
    return this.runExclusive(async () => {
      const settings = await this.config.getSettings();
      if (settings.tradeMode === "LIVE") {
        return this.openLivePosition(settings, input);
      }

      return this.openDryRunPosition(settings, input);
    });
  }

  async closePosition(input: ClosePositionInput): Promise<void> {
    await this.runExclusive(async () => {
      const settings = await this.config.getSettings();
      const position = await db.position.findUniqueOrThrow({
        where: { id: input.positionId },
      });

      if (position.status !== "OPEN") {
        return;
      }

      if (settings.tradeMode === "LIVE") {
        await this.closeLivePosition(settings, position, input);
        return;
      }

      await this.closeDryRunPosition(settings, position, input);
    });
  }

  private async openDryRunPosition(settings: BotSettings, input: OpenPositionInput): Promise<string> {
    const position = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "BotState" WHERE id = 'singleton' FOR UPDATE`;

      const entryScore = this.readEntryScore(input.metrics);
      const capacity = await this.risk.canOpenPositionTx(tx, settings, { entryScore });
      if (!capacity.allowed) {
        throw new Error(capacity.reason ?? "risk blocked entry");
      }

      const amountUsd = capacity.positionSizeUsd;
      const amountToken = amountUsd / input.entryPriceUsd;

      return this.persistOpenedPosition(tx, {
        settings,
        input,
        amountUsd,
        amountToken,
        entryPriceUsd: input.entryPriceUsd,
      });
    });

    await this.recordBuySnapshot(position.id, input, input.entryPriceUsd);
    return position.id;
  }

  private async openLivePosition(settings: BotSettings, input: OpenPositionInput): Promise<string> {
    const entryScore = this.readEntryScore(input.metrics);
    const capacity = await this.risk.canOpenPosition(settings, { entryScore });
    if (!capacity.allowed) {
      throw new Error(capacity.reason ?? "risk blocked entry");
    }

    const executed = await this.live.executeBuy({
      mint: input.mint,
      budgetUsd: capacity.positionSizeUsd,
      tokenDecimalsHint: this.extractTokenDecimals(input.metrics),
    });

    const amountUsd = Number(executed.amountUsd);
    const amountToken = Number(executed.amountToken);
    const position = await this.persistLiveBuy(settings, input, executed, amountUsd, amountToken);

    await this.recordBuySnapshot(position.id, input, executed.entryPriceUsd, {
      txSignature: executed.signature,
      live: executed.metadata,
    });
    return position.id;
  }

  private async closeDryRunPosition(settings: BotSettings, position: Position, input: ClosePositionInput): Promise<void> {
    const remainingToken = Number(position.remainingToken);
    const sellFraction = input.fraction ?? 1;
    const amountToken = remainingToken * sellFraction;
    const amountUsd = amountToken * input.priceUsd;

    if (amountToken <= 0 || amountUsd <= 0) {
      return;
    }

    const closedPosition = await this.persistClose({
      settings,
      input,
      amountUsd,
      amountToken,
      executionPriceUsd: input.priceUsd,
    });

    if (!closedPosition) {
      return;
    }

    await this.recordSellSnapshot(closedPosition, settings, input, amountUsd);
  }

  private async closeLivePosition(settings: BotSettings, position: Position, input: ClosePositionInput): Promise<void> {
    const liveContext = this.readLivePositionContext(position);
    const remainingToken = Number(position.remainingToken);
    const requestedFraction = input.fraction ?? 1;
    const requestedAmountToken = remainingToken * requestedFraction;

    if (requestedAmountToken <= 0) {
      return;
    }

    const executed = await this.live.executeSell({
      mint: position.mint,
      tokenAmount: formatTokenAmount(requestedAmountToken, liveContext.tokenDecimals),
      tokenDecimals: liveContext.tokenDecimals,
    });

    const amountToken = Math.min(Number(executed.amountToken), remainingToken);
    const amountUsd = Number(executed.amountUsd);
    const closedPosition = await this.persistLiveSell(settings, input, executed, amountUsd, amountToken);

    if (!closedPosition) {
      return;
    }

    await this.recordSellSnapshot(closedPosition, settings, {
      ...input,
      priceUsd: executed.entryPriceUsd,
    }, amountUsd, {
      txSignature: executed.signature,
      live: executed.metadata,
    });
  }

  private async persistLiveBuy(
    settings: BotSettings,
    input: OpenPositionInput,
    executed: LiveTradeExecution,
    amountUsd: number,
    amountToken: number,
  ): Promise<{ id: string }> {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "BotState" WHERE id = 'singleton' FOR UPDATE`;

        return this.persistOpenedPosition(tx, {
          settings,
          input,
          amountUsd,
          amountToken,
          entryPriceUsd: executed.entryPriceUsd,
          txSignature: executed.signature,
          liveContext: {
            tokenDecimals: executed.tokenDecimals,
            quoteMint: executed.quoteMint,
            quoteDecimals: executed.quoteDecimals,
            wallet: toTrimmedString(executed.metadata.wallet) ?? this.live.getWalletAddress() ?? "unknown",
            senderUrl: toTrimmedString(executed.metadata.senderUrl),
          },
          fillMetadata: {
            live: executed.metadata,
          },
        });
      });
    } catch (error) {
      await this.pauseForPersistenceFailure("buy", input.mint, executed.signature, error);
      throw error;
    }
  }

  private async persistLiveSell(
    settings: BotSettings,
    input: ClosePositionInput,
    executed: LiveTradeExecution,
    amountUsd: number,
    amountToken: number,
  ): Promise<Position | null> {
    try {
      return await this.persistClose({
        settings,
        input,
        amountUsd,
        amountToken,
        executionPriceUsd: executed.entryPriceUsd,
        txSignature: executed.signature,
        fillMetadata: {
          live: executed.metadata,
        },
      });
    } catch (error) {
      await this.pauseForPersistenceFailure("sell", input.positionId, executed.signature, error);
      throw error;
    }
  }

  private async persistClose(input: PersistCloseInput): Promise<Position | null> {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Position" WHERE id = ${input.input.positionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT 1 FROM "BotState" WHERE id = 'singleton' FOR UPDATE`;

      const position = await tx.position.findUniqueOrThrow({
        where: { id: input.input.positionId },
      });

      if (position.status !== "OPEN") {
        return null;
      }

      const remainingToken = Number(position.remainingToken);
      const amountToken = Math.min(input.amountToken, remainingToken);
      if (amountToken <= 0) {
        return null;
      }

      const amountUsd = input.amountUsd;
      const pnlUsd = amountUsd - Number(position.entryPriceUsd) * amountToken;
      const nextRemaining = remainingToken - amountToken;
      const isFullyClosed = nextRemaining <= 0.000000001;

      await tx.fill.create({
        data: {
          positionId: position.id,
          side: "SELL",
          priceUsd: input.executionPriceUsd,
          amountUsd,
          amountToken,
          pnlUsd,
          txSignature: input.txSignature,
          metadata: toJsonValue({
            reason: input.input.reason,
            mode: input.settings.tradeMode,
            settings: input.settings,
            ...(input.fillMetadata ?? {}),
          }),
        },
      });

      const nextPosition = await tx.position.update({
        where: { id: position.id },
        data: {
          currentPriceUsd: input.executionPriceUsd,
          peakPriceUsd: input.input.peakPriceUsd ?? position.peakPriceUsd,
          remainingToken: isFullyClosed ? 0 : nextRemaining,
          status: isFullyClosed ? "CLOSED" : "OPEN",
          exitReason: isFullyClosed ? input.input.reason : null,
          closedAt: isFullyClosed ? new Date() : null,
          tp1Done: position.tp1Done || input.input.reason === "take_profit_1",
          tp2Done: position.tp2Done || input.input.reason === "take_profit_2",
        },
      });

      if (isFullyClosed) {
        await tx.candidate.updateMany({
          where: { positionId: position.id },
          data: {
            status: "EXITED",
            rejectReason: input.input.reason,
          },
        });
      }

      await tx.botState.update({
        where: { id: "singleton" },
        data: {
          cashUsd: { increment: amountUsd },
          realizedPnlUsd: { increment: pnlUsd },
        },
      });

      return nextPosition;
    });
  }

  private async persistOpenedPosition(
    tx: Prisma.TransactionClient,
    input: PersistOpenInput,
  ): Promise<{ id: string }> {
    const entryScore = this.readEntryScore(input.input.metrics);
    const exitPlan = buildExitPlan(input.settings, entryScore);
    const created = await tx.position.create({
      data: {
        mint: input.input.mint,
        symbol: input.input.symbol,
        entryPriceUsd: input.entryPriceUsd,
        currentPriceUsd: input.entryPriceUsd,
        peakPriceUsd: input.entryPriceUsd,
        stopLossPriceUsd: input.entryPriceUsd * (1 - exitPlan.stopLossPercent / 100),
        takeProfit1PriceUsd: input.entryPriceUsd * exitPlan.tp1Multiplier,
        takeProfit2PriceUsd: input.entryPriceUsd * exitPlan.tp2Multiplier,
        trailingStopPercent: exitPlan.trailingStopPercent,
        amountUsd: input.amountUsd,
        amountToken: input.amountToken,
        remainingToken: input.amountToken,
        metadata: toJsonValue({
          mode: input.settings.tradeMode,
          settings: input.settings,
          entryScore,
          exitPlan,
          metrics: input.input.metrics,
          live: input.liveContext ?? undefined,
        }),
      },
    });

    await tx.fill.create({
      data: {
        positionId: created.id,
        side: "BUY",
        priceUsd: input.entryPriceUsd,
        amountUsd: input.amountUsd,
        amountToken: input.amountToken,
        txSignature: input.txSignature,
        metadata: toJsonValue({
          mode: input.settings.tradeMode,
          settings: input.settings,
          entryScore,
          exitPlan,
          ...(input.fillMetadata ?? {}),
        }),
      },
    });

    await tx.candidate.update({
      where: { id: input.input.candidateId },
      data: {
        status: "BOUGHT",
        boughtAt: new Date(),
        acceptedAt: new Date(),
        positionId: created.id,
        rejectReason: null,
        metrics: toJsonValue(input.input.metrics),
      },
    });

    await tx.botState.update({
      where: { id: "singleton" },
      data: {
        cashUsd: { decrement: input.amountUsd },
      },
    });

    return created;
  }

  private readLivePositionContext(position: Position): LivePositionContext {
    const metadata = asRecord(position.metadata);
    const live = asRecord(metadata?.live);
    const tokenDecimals = toNumber(live?.tokenDecimals);
    const quoteDecimals = toNumber(live?.quoteDecimals);
    const quoteMint = toTrimmedString(live?.quoteMint);
    const wallet = toTrimmedString(live?.wallet);

    if (tokenDecimals === null || quoteDecimals === null || !quoteMint || !wallet) {
      throw new Error(`live position ${position.id} is missing execution metadata`);
    }

    return {
      tokenDecimals,
      quoteMint,
      quoteDecimals,
      wallet,
      senderUrl: toTrimmedString(live?.senderUrl),
    };
  }

  private extractTokenDecimals(metrics: Record<string, unknown>): number | null {
    const direct = toNumber(metrics.decimals);
    if (direct !== null) {
      return direct;
    }

    const detail = asRecord(metrics.detail);
    return toNumber(detail?.decimals);
  }

  private async recordBuySnapshot(
    positionId: string,
    input: OpenPositionInput,
    priceUsd: number,
    extraMetadata?: Record<string, unknown>,
  ): Promise<void> {
    await recordTokenSnapshot({
      candidateId: input.candidateId,
      positionId,
      mint: input.mint,
      symbol: input.symbol,
      trigger: "trade_buy",
      priceUsd,
      metadata: {
        metrics: input.metrics,
        ...(extraMetadata ?? {}),
      },
    });
  }

  private async recordSellSnapshot(
    position: Position,
    settings: BotSettings,
    input: ClosePositionInput,
    amountUsd: number,
    extraMetadata?: Record<string, unknown>,
  ): Promise<void> {
    await recordTokenSnapshot({
      positionId: position.id,
      mint: position.mint,
      symbol: position.symbol,
      trigger: "trade_sell",
      priceUsd: input.priceUsd,
      metadata: {
        reason: input.reason,
        sellFraction: input.fraction ?? 1,
        amountUsd,
        settings,
        ...(extraMetadata ?? {}),
      },
    });
  }

  private async pauseForPersistenceFailure(
    side: "buy" | "sell",
    entity: string,
    txSignature: string,
    error: unknown,
  ): Promise<void> {
    const message = `manual intervention required: live ${side} landed but local persistence failed for ${entity} (${txSignature})`;

    logger.error(
      {
        err: error,
        side,
        entity,
        txSignature,
      },
      "live trade persistence failed; bot paused to avoid state drift",
    );

    try {
      await db.botState.update({
        where: { id: "singleton" },
        data: {
          pauseReason: message,
        },
      });
    } catch (pauseError) {
      logger.error({ err: pauseError, message }, "failed to persist emergency pause after live trade drift");
    }
  }

  private async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.executionQueue.then(task, task);
    this.executionQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private readEntryScore(metrics: Record<string, unknown>): number {
    const direct = toNumber(metrics.entryScore);
    return direct !== null ? this.clamp(direct, 0, 1) : 0.65;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
