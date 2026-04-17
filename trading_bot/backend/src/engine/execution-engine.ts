import type { Position, Prisma } from "@prisma/client";
import { db } from "../db/client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { BOT_STATE_ID } from "./constants.js";
import { LiveTradeExecutor, type LiveTradeExecution } from "../services/live-trade-executor.js";
import { recordOperatorEvent } from "../services/operator-events.js";
import { buildExitPlan, type ExitPlan } from "../services/strategy-exit.js";
import { recordTokenSnapshot } from "../services/token-snapshot-recorder.js";
import type { BotSettings } from "../types/domain.js";
import { toJsonValue } from "../utils/json.js";
import { logger } from "../utils/logger.js";
import { asNumber, asRecord, asString } from "../utils/types.js";
import { RiskEngine } from "./risk-engine.js";

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNumber(value: unknown): number | null {
  return asNumber(value);
}

function readBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = asNumber(value);
  if (parsed === null) {
    return fallback;
  }
  if (parsed < min || parsed > max) {
    throw new Error(`manual trade value must stay between ${min} and ${max}`);
  }
  return parsed;
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
  positionSizeUsd?: number;
  exitPlanOverride?: Partial<ExitPlan>;
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
  exitPlan: ExitPlan;
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
      await tx.$queryRaw`SELECT 1 FROM "BotState" WHERE id = ${BOT_STATE_ID} FOR UPDATE`;

      const entryScore = this.readEntryScore(input.metrics);
      const confidenceScore = this.readConfidenceScore(input.metrics);
      const capacity = await this.risk.canOpenPositionTx(tx, settings, { entryScore, confidenceScore });
      if (!capacity.allowed) {
        throw new Error(capacity.reason ?? "risk blocked entry");
      }

      const amountUsd = this.resolvePositionSizeUsd(settings, capacity.positionSizeUsd, input.positionSizeUsd);
      const amountToken = amountUsd / input.entryPriceUsd;
      const strategyPresetId = this.readStrategyPresetId(input.metrics, settings);
      const exitPlan = this.resolveExitPlan(settings, entryScore, strategyPresetId, input.exitPlanOverride);

      return this.persistOpenedPosition(tx, {
        settings,
        input,
        amountUsd,
        amountToken,
        entryPriceUsd: input.entryPriceUsd,
        exitPlan,
      });
    });

    await this.recordBuySnapshot(position.id, input, input.entryPriceUsd);
    return position.id;
  }

  private async openLivePosition(settings: BotSettings, input: OpenPositionInput): Promise<string> {
    const entryScore = this.readEntryScore(input.metrics);
    const confidenceScore = this.readConfidenceScore(input.metrics);
    const capacity = await this.risk.canOpenPosition(settings, { entryScore, confidenceScore });
    if (!capacity.allowed) {
      throw new Error(capacity.reason ?? "risk blocked entry");
    }

    let executed: LiveTradeExecution;
    try {
      executed = await this.live.executeBuy({
        mint: input.mint,
        budgetUsd: this.resolvePositionSizeUsd(settings, capacity.positionSizeUsd, input.positionSizeUsd),
        tokenDecimalsHint: this.extractTokenDecimals(input.metrics),
      });
    } catch (error) {
      await this.recordLiveAttemptFailure("BUY", {
        mint: input.mint,
        candidateId: input.candidateId,
        entryOrigin: toTrimmedString(input.metrics.entryOrigin),
      }, error);
      throw error;
    }

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

    let executed: LiveTradeExecution;
    try {
      executed = await this.live.executeSell({
        mint: position.mint,
        tokenAmount: formatTokenAmount(requestedAmountToken, liveContext.tokenDecimals),
        tokenDecimals: liveContext.tokenDecimals,
      });
    } catch (error) {
      await this.recordLiveAttemptFailure("SELL", {
        mint: position.mint,
        positionId: position.id,
        reason: input.reason,
      }, error);
      throw error;
    }

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
    const existing = await db.fill.findFirst({ where: { txSignature: executed.signature } });
    if (existing) {
      logger.warn({ txSignature: executed.signature, fillId: existing.id }, "fill already exists, skipping duplicate persist");
      return { id: existing.positionId };
    }

    const entryScore = this.readEntryScore(input.metrics);
    const strategyPresetId = this.readStrategyPresetId(input.metrics, settings);
    const exitPlan = this.resolveExitPlan(settings, entryScore, strategyPresetId, input.exitPlanOverride);
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "BotState" WHERE id = ${BOT_STATE_ID} FOR UPDATE`;

        return this.persistOpenedPosition(tx, {
          settings,
          input,
          amountUsd,
          amountToken,
          entryPriceUsd: executed.entryPriceUsd,
          exitPlan,
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
      await tx.$queryRaw`SELECT 1 FROM "BotState" WHERE id = ${BOT_STATE_ID} FOR UPDATE`;

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
          executionReason: input.input.reason,
          executionMode: input.settings.tradeMode,
          entryOrigin: position.entryOrigin,
          totalLatencyMs: this.readLiveTimingValue(input.fillMetadata, "totalMs"),
          quoteLatencyMs: this.readLiveTimingValue(input.fillMetadata, "quoteMs"),
          swapBuildLatencyMs: this.readLiveTimingValue(input.fillMetadata, "swapBuildMs"),
          senderBuildLatencyMs: this.readLiveTimingValue(input.fillMetadata, "senderBuildMs"),
          broadcastConfirmLatencyMs: this.readLiveTimingValue(input.fillMetadata, "broadcastAndConfirmMs"),
          settlementReadLatencyMs: this.readLiveTimingValue(input.fillMetadata, "settlementReadMs"),
          executionSlippageBps: this.readLiveNumber(input.fillMetadata, "executionSlippageBps"),
          quotedOutAmountUsd: this.readLiveNumber(input.fillMetadata, "quotedOutAmountUsd"),
          actualOutAmountUsd: this.readLiveNumber(input.fillMetadata, "actualOutAmountUsd"),
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
        where: { id: BOT_STATE_ID },
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
    const strategyPresetId = this.readStrategyPresetId(input.input.metrics, input.settings);
    const exitPlan = input.exitPlan;
    const source = toTrimmedString(input.input.metrics.source);
    const discoveryRecipeName = toTrimmedString(input.input.metrics.discoveryRecipeName);
    const entryOrigin = toTrimmedString(input.input.metrics.entryOrigin);
    const exitProfile = toTrimmedString(input.input.metrics.exitProfile) ?? exitPlan.profile;
    const confidenceScore = this.readConfidenceScore(input.input.metrics);
    const manualEntry = input.input.metrics.manualEntry === true;
    const discoveryLabReportAgeMsAtEntry = toNumber(input.input.metrics.discoveryLabReportAgeMsAtEntry);
    const discoveryLabRunAgeMsAtEntry = toNumber(input.input.metrics.discoveryLabRunAgeMsAtEntry);
    const discoveryLabCompletionLagMsAtEntry = toNumber(input.input.metrics.discoveryLabCompletionLagMsAtEntry);
    const requestedSizeUsd = toNumber(input.input.positionSizeUsd);
    const liveStrategyCapitalModifierPercent = input.settings.tradeMode === "LIVE" && input.settings.strategy.liveStrategy.enabled
      ? input.settings.strategy.liveStrategy.capitalModifierPercent
      : 100;
    const liveFill = asRecord(input.fillMetadata?.live);
    const liveTiming = asRecord(liveFill?.timing);
    const created = await tx.position.create({
      data: {
        mint: input.input.mint,
        symbol: input.input.symbol,
        strategyPresetId,
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
        entryOrigin,
        metadata: toJsonValue({
          mode: input.settings.tradeMode,
          settings: input.settings,
          strategyPresetId,
          entryScore,
          confidenceScore,
          exitProfile,
          source,
          discoveryRecipeName,
          entryOrigin,
          manualEntry,
          discoveryLabReportAgeMsAtEntry,
          discoveryLabRunAgeMsAtEntry,
          discoveryLabCompletionLagMsAtEntry,
          liveTiming,
          exitPlan,
          metrics: input.input.metrics,
          live: input.liveContext ?? undefined,
        }),
        exitProfile,
        requestedSizeUsd,
        confidenceScore,
        plannedSizeUsd: input.amountUsd,
        capitalModifierPercent: liveStrategyCapitalModifierPercent,
        discoveryLabRunId: toTrimmedString(input.input.metrics.discoveryLabRunId),
        discoveryLabPackId: toTrimmedString(input.input.metrics.discoveryLabPackId),
        liveStrategyRunId: toTrimmedString(input.input.metrics.liveStrategyRunId),
        liveStrategyPackId: toTrimmedString(input.input.metrics.liveStrategyPackId),
        reportAgeMsAtEntry: discoveryLabReportAgeMsAtEntry,
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
        executionReason: "entry",
        executionMode: input.settings.tradeMode,
        entryOrigin,
        totalLatencyMs: this.readLiveTimingValue(input.fillMetadata, "totalMs"),
        quoteLatencyMs: this.readLiveTimingValue(input.fillMetadata, "quoteMs"),
        swapBuildLatencyMs: this.readLiveTimingValue(input.fillMetadata, "swapBuildMs"),
        senderBuildLatencyMs: this.readLiveTimingValue(input.fillMetadata, "senderBuildMs"),
        broadcastConfirmLatencyMs: this.readLiveTimingValue(input.fillMetadata, "broadcastAndConfirmMs"),
        settlementReadLatencyMs: this.readLiveTimingValue(input.fillMetadata, "settlementReadMs"),
        metadata: toJsonValue({
          mode: input.settings.tradeMode,
          settings: input.settings,
          strategyPresetId,
          entryScore,
          confidenceScore,
          exitProfile,
          source,
          discoveryRecipeName,
          entryOrigin,
          manualEntry,
          discoveryLabReportAgeMsAtEntry,
          discoveryLabRunAgeMsAtEntry,
          discoveryLabCompletionLagMsAtEntry,
          exitPlan,
          ...(input.fillMetadata ?? {}),
        }),
        executionSlippageBps: this.readLiveNumber(input.fillMetadata, "executionSlippageBps"),
        quotedOutAmountUsd: this.readLiveNumber(input.fillMetadata, "quotedOutAmountUsd"),
        actualOutAmountUsd: this.readLiveNumber(input.fillMetadata, "actualOutAmountUsd"),
        quotedOutAmountToken: this.readLiveNumber(input.fillMetadata, "quotedOutAmountToken"),
        actualOutAmountToken: this.readLiveNumber(input.fillMetadata, "actualOutAmountToken"),
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
        entryOrigin,
        strategyPresetId,
        entryScore,
        exitProfile,
        confidenceScore,
        discoveryLabRunId: toTrimmedString(input.input.metrics.discoveryLabRunId),
        discoveryLabPackId: toTrimmedString(input.input.metrics.discoveryLabPackId),
        liveStrategyRunId: toTrimmedString(input.input.metrics.liveStrategyRunId),
        liveStrategyPackId: toTrimmedString(input.input.metrics.liveStrategyPackId),
        metrics: toJsonValue(input.input.metrics),
      },
    });

    await tx.botState.update({
      where: { id: BOT_STATE_ID },
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

  private resolvePositionSizeUsd(
    settings: BotSettings,
    allowedPositionSizeUsd: number,
    requestedPositionSizeUsd: number | undefined,
  ): number {
    if (requestedPositionSizeUsd === undefined) {
      return allowedPositionSizeUsd;
    }
    const requested = toNumber(requestedPositionSizeUsd);
    if (requested === null || requested <= 0) {
      throw new Error("manual trade size must be a positive USD value");
    }
    if (requested > allowedPositionSizeUsd) {
      throw new Error(`manual trade size exceeds available capacity (${allowedPositionSizeUsd.toFixed(2)} USD max)`);
    }
    if (requested < 5 && requested < settings.capital.positionSizeUsd) {
      throw new Error("manual trade size must be at least 5 USD");
    }
    return requested;
  }

  private resolveExitPlan(
    settings: BotSettings,
    entryScore: number,
    strategyPresetId: BotSettings["strategy"]["livePresetId"],
    override?: Partial<ExitPlan>,
  ): ExitPlan {
    const basePlan = buildExitPlan(settings, entryScore, strategyPresetId);
    if (!override) {
      return basePlan;
    }

    const next: ExitPlan = {
      profile: basePlan.profile,
      stopLossPercent: readBoundedNumber(override.stopLossPercent, basePlan.stopLossPercent, 5, 40),
      tp1Multiplier: readBoundedNumber(override.tp1Multiplier, basePlan.tp1Multiplier, 1.05, 4),
      tp2Multiplier: readBoundedNumber(override.tp2Multiplier, basePlan.tp2Multiplier, 1.1, 6),
      tp1SellFraction: readBoundedNumber(override.tp1SellFraction, basePlan.tp1SellFraction, 0.05, 0.9),
      tp2SellFraction: readBoundedNumber(override.tp2SellFraction, basePlan.tp2SellFraction, 0.05, 0.9),
      postTp1RetracePercent: readBoundedNumber(override.postTp1RetracePercent, basePlan.postTp1RetracePercent, 5, 30),
      trailingStopPercent: readBoundedNumber(override.trailingStopPercent, basePlan.trailingStopPercent, 5, 35),
      timeStopMinutes: readBoundedNumber(override.timeStopMinutes, basePlan.timeStopMinutes, 1, 120),
      timeStopMinReturnPercent: readBoundedNumber(override.timeStopMinReturnPercent, basePlan.timeStopMinReturnPercent, 0, 80),
      timeLimitMinutes: readBoundedNumber(override.timeLimitMinutes, basePlan.timeLimitMinutes, 2, 240),
      partialStopLossEnabled: override.partialStopLossEnabled ?? basePlan.partialStopLossEnabled,
      partialSlThresholdPercent: override.partialSlThresholdPercent ?? basePlan.partialSlThresholdPercent,
      partialSlSellFraction: override.partialSlSellFraction ?? basePlan.partialSlSellFraction,
      momentumTpExtensionEnabled: override.momentumTpExtensionEnabled ?? basePlan.momentumTpExtensionEnabled,
      recalibrateIntervalMinutes: override.recalibrateIntervalMinutes ?? basePlan.recalibrateIntervalMinutes,
    };

    if (next.tp2Multiplier <= next.tp1Multiplier) {
      throw new Error("manual TP2 must stay above TP1");
    }
    if (next.tp1SellFraction + next.tp2SellFraction > 0.95) {
      throw new Error("manual TP sell fractions cannot exceed 95% combined");
    }
    if (next.timeLimitMinutes < next.timeStopMinutes) {
      throw new Error("manual max hold must stay above the time stop");
    }

    if (
      next.stopLossPercent === basePlan.stopLossPercent
      && next.tp1Multiplier === basePlan.tp1Multiplier
      && next.tp2Multiplier === basePlan.tp2Multiplier
      && next.tp1SellFraction === basePlan.tp1SellFraction
      && next.tp2SellFraction === basePlan.tp2SellFraction
      && next.postTp1RetracePercent === basePlan.postTp1RetracePercent
      && next.trailingStopPercent === basePlan.trailingStopPercent
      && next.timeStopMinutes === basePlan.timeStopMinutes
      && next.timeStopMinReturnPercent === basePlan.timeStopMinReturnPercent
      && next.timeLimitMinutes === basePlan.timeLimitMinutes
    ) {
      return basePlan;
    }

    return next;
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

  /**
   * Find a fill by its on-chain transaction signature.
   * Used for idempotent recovery when a live trade lands but persistence fails mid-transaction.
   */
  async findBySignature(txSignature: string) {
    return db.fill.findFirst({ where: { txSignature } });
  }

  /**
   * Reconcile phantom fills on startup — fills that exist without a parent position.
   * Logs and emits an operator event; does not auto-resolve to avoid data corruption.
   */
  async reconcilePhantomFills(): Promise<number> {
    const phantomFills = await db.$queryRawUnsafe<Array<{ id: string; position_id: string; tx_signature: string; mint: string }>>(`
      SELECT f.id, f."positionId" as position_id, f."txSignature" as tx_signature, p.mint
      FROM "Fill" f
      LEFT JOIN "Position" p ON p.id = f."positionId"
      WHERE p.id IS NULL
    `);

    if (phantomFills.length === 0) return 0;

    logger.warn({ count: phantomFills.length }, "phantom fills detected on startup, operator intervention required");
    await recordOperatorEvent({
      kind: "phantom_fill_reconciliation",
      level: "danger",
      title: `${phantomFills.length} phantom fill(s) need manual reconciliation`,
      detail: `Found fills without parent positions. Manually inspect and resolve: ${phantomFills.map((f) => f.tx_signature).join(", ")}`,
    });
    return phantomFills.length;
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
        where: { id: BOT_STATE_ID },
        data: {
          pauseReason: message,
        },
      });
    } catch (pauseError) {
      logger.error({ err: pauseError, message }, "failed to persist emergency pause after live trade drift");
    }
  }

  private async recordLiveAttemptFailure(
    side: "BUY" | "SELL",
    context: {
      mint: string;
      candidateId?: string;
      positionId?: string;
      reason?: string;
      entryOrigin?: string | null;
    },
    error: unknown,
  ): Promise<void> {
    const detail = error instanceof Error ? error.message : String(error);
    const entityType = context.positionId ? "position" : context.candidateId ? "candidate" : "mint";
    const entityId = context.positionId ?? context.candidateId ?? context.mint;
    try {
      await recordOperatorEvent({
        kind: "live_trade_attempt_failed",
        level: "danger",
        title: `${side} attempt failed`,
        detail,
        entityType,
        entityId,
        metadata: {
          side,
          mint: context.mint,
          positionId: context.positionId ?? null,
          candidateId: context.candidateId ?? null,
          reason: context.reason ?? null,
          entryOrigin: context.entryOrigin ?? null,
        },
      });
    } catch (eventError) {
      logger.error({ err: eventError, side, mint: context.mint }, "failed to record live trade attempt failure");
    }
  }

  /**
   * Exposed for ExitEngine so that concurrent close attempts on the same position
   * are serialised through the same queue used by openPosition / closePosition.
   */
  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.executionQueue.then(task, task);
    this.executionQueue = next.then(
      () => undefined,
      (err: unknown) => {
        logger.warn({ err }, "runExclusive task rejected");
        return undefined;
      },
    );
    return next;
  }

  private readEntryScore(metrics: Record<string, unknown>): number {
    const direct = toNumber(metrics.entryScore);
    return direct !== null ? this.clamp(direct, 0, 1) : 0.65;
  }

  private readConfidenceScore(metrics: Record<string, unknown>): number | null {
    const direct = toNumber(metrics.confidenceScore);
    return direct !== null ? this.clamp(direct, 0, 1) : null;
  }

  private readStrategyPresetId(
    metrics: Record<string, unknown>,
    settings: BotSettings,
  ): BotSettings["strategy"]["livePresetId"] {
    const direct = toTrimmedString(metrics.strategyPresetId);
    if (direct === "FIRST_MINUTE_POSTGRAD_CONTINUATION" || direct === "LATE_CURVE_MIGRATION_SNIPE") {
      return direct;
    }
    return settings.strategy.livePresetId;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private readLiveNumber(fillMetadata: Record<string, unknown> | undefined, key: string): number | null {
    const live = asRecord(fillMetadata?.live);
    return toNumber(live?.[key]);
  }

  private readLiveTimingValue(fillMetadata: Record<string, unknown> | undefined, key: string): number | null {
    const live = asRecord(fillMetadata?.live);
    const timing = asRecord(live?.timing);
    return toNumber(timing?.[key]);
  }
}
