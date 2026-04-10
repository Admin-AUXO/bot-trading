import { Prisma, type ProviderName, type ResearchPosition, type ResearchRun } from "@prisma/client";
import { db } from "../db/client.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { buildExitPlan, getExitDecision } from "../services/strategy-exit.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import type { BotSettings, DiscoveryToken, ResearchRunComparison, ResearchRunSummary } from "../types/domain.js";
import { toJsonValue } from "../utils/json.js";
import { logger } from "../utils/logger.js";
import { GraduationEngine } from "./graduation-engine.js";

type ProviderUsage = {
  provider: ProviderName;
  calls: number;
  units: number;
};

type ActiveRunState = {
  active: boolean;
  nextDelayMs?: number;
  runId?: string;
};

type EvaluatedToken = {
  id: string;
  mint: string;
  symbol: string;
  source: string;
  liveTradable: boolean;
  entryScore: number;
  liquidityUsd: number;
  entryPriceUsd: number;
  metrics: Record<string, unknown>;
};

const FULL_EVALUATION_ESTIMATE = {
  birdeye: 95,
  helius: 2,
};

export class ResearchDryRunEngine {
  constructor(
    private readonly graduation: GraduationEngine,
    private readonly birdeye: BirdeyeClient,
    private readonly config: RuntimeConfigService,
  ) {}

  async getStatus(): Promise<{
    activeRun: ResearchRunSummary | null;
    latestCompletedRun: ResearchRunSummary | null;
    previousCompletedRun: ResearchRunSummary | null;
  }> {
    const [activeRun, completedRuns] = await Promise.all([
      db.researchRun.findFirst({
        where: { status: "RUNNING" },
        orderBy: { startedAt: "desc" },
      }),
      db.researchRun.findMany({
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 2,
      }),
    ]);

    return {
      activeRun: activeRun ? this.toRunSummary(activeRun) : null,
      latestCompletedRun: completedRuns[0] ? this.toRunSummary(completedRuns[0]) : null,
      previousCompletedRun: completedRuns[1] ? this.toRunSummary(completedRuns[1]) : null,
    };
  }

  async listRuns(limit = 10): Promise<ResearchRunSummary[]> {
    const runs = await db.researchRun.findMany({
      orderBy: { startedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 50),
    });

    return runs.map((run) => this.toRunSummary(run));
  }

  async getRun(runId: string): Promise<ResearchRunSummary | null> {
    const run = await db.researchRun.findUnique({ where: { id: runId } });
    return run ? this.toRunSummary(run) : null;
  }

  async listRunTokens(runId: string) {
    return db.researchToken.findMany({
      where: { runId },
      include: {
        position: {
          include: {
            fills: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: [
        { selectedForMock: "desc" },
        { strategyPassed: "desc" },
        { cheapScore: "desc" },
        { createdAt: "asc" },
      ],
    });
  }

  async listRunPositions(runId: string) {
    return db.researchPosition.findMany({
      where: { runId },
      include: {
        token: true,
        fills: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { openedAt: "asc" },
    });
  }

  async startRun(): Promise<ResearchRunSummary> {
    const existing = await db.researchRun.findFirst({
      where: { status: "RUNNING" },
      select: { id: true },
    });
    if (existing) {
      throw new Error("research dry run already active");
    }

    const settings = await this.config.getSettings();
    if (settings.tradeMode !== "DRY_RUN") {
      throw new Error("research dry run is only available in DRY_RUN mode");
    }

    const run = await db.researchRun.create({
      data: {
        pollIntervalMs: settings.research.pollIntervalMs,
        maxRunDurationMs: settings.research.maxRunDurationMs,
        discoveryLimit: settings.research.discoveryLimit,
        fullEvaluationLimit: settings.research.fullEvaluationLimit,
        maxMockPositions: settings.research.maxMockPositions,
        fixedPositionSizeUsd: settings.research.fixedPositionSizeUsd,
        birdeyeUnitCap: settings.research.birdeyeUnitCap,
        heliusUnitCap: settings.research.heliusUnitCap,
        configSnapshot: toJsonValue(settings),
      },
    });

    try {
      await this.ensureProviderBudget(run, { birdeye: 100, helius: 0 });
      const discoveredTokens = await this.graduation.getResearchDiscoveryTokens(settings.research.discoveryLimit);
      const tokenRows = discoveredTokens.map((token) => ({
        runId: run.id,
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        source: token.source,
        creator: token.creator,
        liveTradable: this.graduation.isLiveTradableSource(token.source),
        researchTradable: false,
        cheapScore: this.graduation.scoreDiscoveryToken(token, settings),
        metrics: toJsonValue(token),
        filterState: toJsonValue(token),
      }));

      if (tokenRows.length > 0) {
        await db.researchToken.createMany({ data: tokenRows });
      }

      const storedTokens = await db.researchToken.findMany({
        where: { runId: run.id },
        orderBy: [{ cheapScore: "desc" }, { createdAt: "asc" }],
      });
      const shortlist = storedTokens.slice(0, settings.research.fullEvaluationLimit);
      const shortlistIds = shortlist.map((token) => token.id);
      if (shortlistIds.length > 0) {
        await db.researchToken.updateMany({
          where: { id: { in: shortlistIds } },
          data: { shortlisted: true },
        });
      }

      const baselineByMint = new Map(discoveredTokens.map((token) => [token.mint, token] as const));
      const evaluated: EvaluatedToken[] = [];
      let evaluatedCount = 0;
      let strategyPassedCount = 0;
      let liveTradablePassed = 0;

      for (const token of shortlist) {
        await this.ensureProviderBudget(run, FULL_EVALUATION_ESTIMATE);
        const baseline = baselineByMint.get(token.mint);
        if (!baseline) {
          continue;
        }

        const evaluation = await this.graduation.evaluateResearchToken(baseline, settings);
        const entryScore = Number(evaluation.metrics.entryScore ?? 0);
        const passed = evaluation.passed && !evaluation.deferReason;
        const researchTradable = passed;
        const liquidityUsd = Number(evaluation.filterState.liquidityUsd ?? 0);

        await db.researchToken.update({
          where: { id: token.id },
          data: {
            fullEvaluationDone: true,
            strategyPassed: passed,
            researchTradable,
            strategyRejectReason: evaluation.rejectReason ?? null,
            evaluationDeferReason: evaluation.deferReason ?? null,
            entryScore: passed ? entryScore : null,
            exitProfile: typeof evaluation.metrics.exitProfile === "string" ? evaluation.metrics.exitProfile : null,
            evaluatedAt: new Date(),
            metrics: toJsonValue(evaluation.metrics),
            filterState: toJsonValue(evaluation.filterState),
          },
        });

        evaluatedCount += 1;
        if (!passed || !evaluation.entryPriceUsd) {
          continue;
        }

        strategyPassedCount += 1;
        if (token.liveTradable) {
          liveTradablePassed += 1;
        }

        evaluated.push({
          id: token.id,
          mint: token.mint,
          symbol: token.symbol,
          source: token.source,
          liveTradable: token.liveTradable,
          entryScore,
          liquidityUsd,
          entryPriceUsd: evaluation.entryPriceUsd,
          metrics: evaluation.metrics,
        });
      }

      const selected = [...evaluated]
        .sort((left, right) => {
          if (right.entryScore !== left.entryScore) {
            return right.entryScore - left.entryScore;
          }
          if (right.liquidityUsd !== left.liquidityUsd) {
            return right.liquidityUsd - left.liquidityUsd;
          }
          return left.mint.localeCompare(right.mint);
        })
        .slice(0, settings.research.maxMockPositions);

      for (const token of selected) {
        await this.openMockPosition(run.id, settings, token);
      }

      const openPositions = await db.researchPosition.count({
        where: { runId: run.id, status: "OPEN" },
      });
      const providerUsage = await this.getProviderUsage(run);

      await db.researchRun.update({
        where: { id: run.id },
        data: {
          totalDiscovered: tokenRows.length,
          totalShortlisted: shortlist.length,
          totalEvaluated: evaluatedCount,
          totalStrategyPassed: strategyPassedCount,
          totalMockOpened: selected.length,
          totalMockClosed: selected.length - openPositions,
          liveTradablePassed,
          researchTradablePassed: strategyPassedCount,
          birdeyeCalls: providerUsage.BIRDEYE.calls,
          birdeyeUnitsUsed: providerUsage.BIRDEYE.units,
          heliusCalls: providerUsage.HELIUS.calls,
          heliusUnitsUsed: providerUsage.HELIUS.units,
        },
      });

      if (openPositions === 0) {
        await this.completeRun(run.id);
      }

      logger.info({
        runId: run.id,
        discovered: tokenRows.length,
        shortlisted: shortlist.length,
        evaluated: evaluatedCount,
        opened: selected.length,
      }, "research dry run started");

      return (await this.getRun(run.id))!;
    } catch (error) {
      logger.error({ err: error, runId: run.id }, "research dry run failed during startup");
      await this.forceCloseOpenPositions(run.id, "research_startup_failure").catch((closeError) => {
        logger.error({ err: closeError, runId: run.id }, "failed to unwind research positions after startup failure");
      });
      await db.researchRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      }).catch(() => undefined);
      throw error;
    }
  }

  async pollActiveRun(): Promise<ActiveRunState> {
    const run = await db.researchRun.findFirst({
      where: { status: "RUNNING" },
      orderBy: { startedAt: "desc" },
    });
    if (!run) {
      return { active: false };
    }

    const settings = this.readRunSettings(run);

    try {
      const deadlineMs = run.startedAt.getTime() + run.maxRunDurationMs;
      const now = Date.now();

      if (now >= deadlineMs) {
        await this.forceCloseOpenPositions(run.id, "research_timeout");
        await this.completeRun(run.id);
        return { active: false, runId: run.id };
      }

      const openPositions = await db.researchPosition.findMany({
        where: { runId: run.id, status: "OPEN" },
        orderBy: { openedAt: "asc" },
      });

      if (openPositions.length === 0) {
        await this.completeRun(run.id);
        return { active: false, runId: run.id };
      }

      await this.ensureProviderBudget(run, {
        birdeye: Math.ceil((Math.min(openPositions.length, 100) ** 0.8) * 5),
        helius: 0,
      });

      const prices = await this.birdeye.getMultiPrice(openPositions.map((position) => position.mint));
      for (const position of openPositions) {
        const priceUsd = prices[position.mint] ?? null;
        if (!priceUsd || priceUsd <= 0) {
          continue;
        }

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

        if (exitDecision) {
          await this.closeResearchPosition(position, {
            reason: exitDecision.reason,
            priceUsd,
            fraction: exitDecision.fraction,
            peakPriceUsd: exitDecision.peakPriceUsd,
          });
          continue;
        }

        await db.researchPosition.update({
          where: { id: position.id },
          data: {
            currentPriceUsd: priceUsd,
            peakPriceUsd: Math.max(Number(position.peakPriceUsd), priceUsd),
            lastSeenPriceUsd: priceUsd,
            lastSeenAt: new Date(),
          },
        });
      }

      const remainingOpenPositions = await db.researchPosition.count({
        where: { runId: run.id, status: "OPEN" },
      });
      const providerUsage = await this.getProviderUsage(run);

      await db.researchRun.update({
        where: { id: run.id },
        data: {
          lastPolledAt: new Date(),
          totalMockClosed: run.totalMockOpened - remainingOpenPositions,
          birdeyeCalls: providerUsage.BIRDEYE.calls,
          birdeyeUnitsUsed: providerUsage.BIRDEYE.units,
          heliusCalls: providerUsage.HELIUS.calls,
          heliusUnitsUsed: providerUsage.HELIUS.units,
        },
      });

      if (remainingOpenPositions === 0) {
        await this.completeRun(run.id);
        return { active: false, runId: run.id };
      }

      return {
        active: true,
        nextDelayMs: Math.max(Math.min(run.pollIntervalMs, deadlineMs - Date.now()), 1_000),
        runId: run.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const closeReason = message.includes("cap would be exceeded")
        ? "research_provider_cap"
        : "research_poll_failure";

      if (closeReason === "research_provider_cap") {
        logger.warn({ runId: run.id, message }, "research dry run stopped at provider cap");
      } else {
        logger.error({ err: error, runId: run.id }, "research dry run polling failed");
      }

      await this.forceCloseOpenPositions(run.id, closeReason).catch((closeError) => {
        logger.error({ err: closeError, runId: run.id }, "failed to unwind research positions after polling failure");
      });
      await this.completeRun(run.id, message).catch(async (completeError) => {
        logger.error({ err: completeError, runId: run.id }, "failed to finalize research dry run after polling failure");
        await db.researchRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: message,
          },
        }).catch(() => undefined);
      });

      return { active: false, runId: run.id };
    }
  }

  async getNextPollDelayMs(): Promise<number | null> {
    const run = await db.researchRun.findFirst({
      where: { status: "RUNNING" },
      orderBy: { startedAt: "desc" },
    });
    if (!run) {
      return null;
    }

    const lastCheckpoint = run.lastPolledAt?.getTime() ?? run.startedAt.getTime();
    const nextPollAt = lastCheckpoint + run.pollIntervalMs;
    const deadlineAt = run.startedAt.getTime() + run.maxRunDurationMs;

    if (Date.now() >= deadlineAt) {
      return 1_000;
    }

    return Math.max(Math.min(nextPollAt, deadlineAt) - Date.now(), 1_000);
  }

  private async openMockPosition(runId: string, settings: BotSettings, token: EvaluatedToken): Promise<void> {
    const entryScore = Number(token.metrics.entryScore ?? 0.65);
    const exitPlan = buildExitPlan(settings, entryScore);
    const amountUsd = settings.research.fixedPositionSizeUsd;
    const amountToken = amountUsd / token.entryPriceUsd;

    const position = await db.researchPosition.create({
      data: {
        runId,
        tokenId: token.id,
        mint: token.mint,
        symbol: token.symbol,
        entryPriceUsd: token.entryPriceUsd,
        currentPriceUsd: token.entryPriceUsd,
        peakPriceUsd: token.entryPriceUsd,
        stopLossPriceUsd: token.entryPriceUsd * (1 - exitPlan.stopLossPercent / 100),
        takeProfit1PriceUsd: token.entryPriceUsd * exitPlan.tp1Multiplier,
        takeProfit2PriceUsd: token.entryPriceUsd * exitPlan.tp2Multiplier,
        trailingStopPercent: exitPlan.trailingStopPercent,
        amountUsd,
        amountToken,
        remainingToken: amountToken,
        lastSeenPriceUsd: token.entryPriceUsd,
        lastSeenAt: new Date(),
        metadata: toJsonValue({
          entryScore,
          exitPlan,
          liveTradable: token.liveTradable,
          researchTradable: true,
          metrics: token.metrics,
        }),
      },
    });

    await db.researchFill.create({
      data: {
        positionId: position.id,
        side: "BUY",
        priceUsd: token.entryPriceUsd,
        amountUsd,
        amountToken,
        metadata: toJsonValue({
          mode: "DRY_RUN",
          source: token.source,
        }),
      },
    });

    await db.researchToken.update({
      where: { id: token.id },
      data: {
        selectedForMock: true,
        mockOpenedAt: new Date(),
      },
    });
  }

  private async closeResearchPosition(
    position: ResearchPosition,
    input: {
      reason: string;
      priceUsd: number;
      fraction?: number;
      peakPriceUsd: number;
    },
  ): Promise<void> {
    const remainingToken = Number(position.remainingToken);
    const amountToken = remainingToken * (input.fraction ?? 1);
    if (amountToken <= 0) {
      return;
    }

    const amountUsd = amountToken * input.priceUsd;
    const pnlUsd = amountUsd - Number(position.entryPriceUsd) * amountToken;
    const nextRemaining = remainingToken - amountToken;
    const isFullyClosed = nextRemaining <= 0.000000001;

    await db.$transaction(async (tx) => {
      await tx.researchFill.create({
        data: {
          positionId: position.id,
          side: "SELL",
          priceUsd: input.priceUsd,
          amountUsd,
          amountToken,
          pnlUsd,
          metadata: toJsonValue({
            reason: input.reason,
            sellFraction: input.fraction ?? 1,
          }),
        },
      });

      await tx.researchPosition.update({
        where: { id: position.id },
        data: {
          currentPriceUsd: input.priceUsd,
          peakPriceUsd: input.peakPriceUsd,
          lastSeenPriceUsd: input.priceUsd,
          lastSeenAt: new Date(),
          remainingToken: isFullyClosed ? 0 : nextRemaining,
          status: isFullyClosed ? "CLOSED" : "OPEN",
          exitReason: isFullyClosed ? input.reason : null,
          closedAt: isFullyClosed ? new Date() : null,
          tp1Done: position.tp1Done || input.reason === "take_profit_1",
          tp2Done: position.tp2Done || input.reason === "take_profit_2",
        },
      });
    });
  }

  private async forceCloseOpenPositions(runId: string, reason: string): Promise<void> {
    const openPositions = await db.researchPosition.findMany({
      where: { runId, status: "OPEN" },
      orderBy: { openedAt: "asc" },
    });

    for (const position of openPositions) {
      const closePriceUsd = Number(position.lastSeenPriceUsd ?? position.currentPriceUsd ?? position.entryPriceUsd);
      if (!Number.isFinite(closePriceUsd) || closePriceUsd <= 0) {
        continue;
      }

      await this.closeResearchPosition(position, {
        reason,
        priceUsd: closePriceUsd,
        peakPriceUsd: Number(position.peakPriceUsd),
      });
    }
  }

  private async completeRun(runId: string, completionNote: string | null = null): Promise<void> {
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: runId } });
    const positions = await db.researchPosition.findMany({
      where: { runId },
      include: {
        fills: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const providerUsage = await this.getProviderUsage(run);

    const realizedPnlUsd = positions.reduce((sum, position) => sum + position.fills
      .filter((fill) => fill.side === "SELL")
      .reduce((fillSum, fill) => fillSum + Number(fill.pnlUsd ?? 0), 0), 0);
    const closedPositions = positions.filter((position) => position.status === "CLOSED");
    const winningPositions = closedPositions.filter((position) => position.fills
      .filter((fill) => fill.side === "SELL")
      .reduce((sum, fill) => sum + Number(fill.pnlUsd ?? 0), 0) > 0);
    const averageHoldMinutes = closedPositions.length > 0
      ? closedPositions.reduce((sum, position) => sum + ((position.closedAt?.getTime() ?? Date.now()) - position.openedAt.getTime()) / 60_000, 0) / closedPositions.length
      : null;
    const winRatePercent = closedPositions.length > 0
      ? (winningPositions.length / closedPositions.length) * 100
      : null;

    const previousRun = await db.researchRun.findFirst({
      where: {
        status: "COMPLETED",
        id: { not: runId },
      },
      orderBy: { completedAt: "desc" },
    });
    const comparison = previousRun
      ? this.buildComparison(run, {
        realizedPnlUsd,
        winRatePercent,
        averageHoldMinutes,
        openedCount: positions.length,
      }, previousRun)
      : null;

    await db.researchRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        totalMockClosed: closedPositions.length,
        birdeyeCalls: providerUsage.BIRDEYE.calls,
        birdeyeUnitsUsed: providerUsage.BIRDEYE.units,
        heliusCalls: providerUsage.HELIUS.calls,
        heliusUnitsUsed: providerUsage.HELIUS.units,
        realizedPnlUsd,
        winRatePercent,
        averageHoldMinutes,
        comparison: comparison ? toJsonValue(comparison) : Prisma.JsonNull,
        errorMessage: completionNote,
      },
    });

    logger.info({
      runId,
      realizedPnlUsd,
      winRatePercent,
      averageHoldMinutes,
      note: completionNote,
    }, "research dry run completed");
  }

  private buildComparison(
    run: ResearchRun,
    current: {
      realizedPnlUsd: number;
      winRatePercent: number | null;
      averageHoldMinutes: number | null;
      openedCount: number;
    },
    previousRun: ResearchRun,
  ): ResearchRunComparison {
    const currentPassRate = run.totalEvaluated > 0
      ? (run.totalStrategyPassed / run.totalEvaluated) * 100
      : 0;
    const previousPassRate = previousRun.totalEvaluated > 0
      ? (previousRun.totalStrategyPassed / previousRun.totalEvaluated) * 100
      : 0;

    return {
      previousRunId: previousRun.id,
      realizedPnlUsdDelta: current.realizedPnlUsd - Number(previousRun.realizedPnlUsd),
      strategyPassRateDeltaPercent: currentPassRate - (previousPassRate || 0),
      mockWinRateDeltaPercent: (current.winRatePercent ?? 0) - Number(previousRun.winRatePercent ?? 0),
      averageHoldMinutesDelta: (current.averageHoldMinutes ?? 0) - Number(previousRun.averageHoldMinutes ?? 0),
      openedCountDelta: current.openedCount - previousRun.totalMockOpened,
    };
  }

  private async ensureProviderBudget(
    run: ResearchRun,
    estimatedNextSpend: { birdeye: number; helius: number },
  ): Promise<void> {
    const usage = await this.getProviderUsage(run);
    if (usage.BIRDEYE.units + estimatedNextSpend.birdeye > run.birdeyeUnitCap) {
      throw new Error(`research Birdeye cap would be exceeded (${usage.BIRDEYE.units}/${run.birdeyeUnitCap})`);
    }

    if (usage.HELIUS.units + estimatedNextSpend.helius > run.heliusUnitCap) {
      throw new Error(`research Helius cap would be exceeded (${usage.HELIUS.units}/${run.heliusUnitCap})`);
    }
  }

  private async getProviderUsage(run: Pick<ResearchRun, "startedAt" | "completedAt">): Promise<Record<ProviderName, ProviderUsage>> {
    const grouped = await db.apiEvent.groupBy({
      by: ["provider"],
      where: {
        provider: { in: ["BIRDEYE", "HELIUS"] },
        calledAt: {
          gte: run.startedAt,
          lte: run.completedAt ?? new Date(),
        },
      },
      _sum: { units: true },
      _count: { _all: true },
    });

    const usage: Record<ProviderName, ProviderUsage> = {
      BIRDEYE: { provider: "BIRDEYE", calls: 0, units: 0 },
      HELIUS: { provider: "HELIUS", calls: 0, units: 0 },
    };

    for (const row of grouped) {
      usage[row.provider] = {
        provider: row.provider,
        calls: row._count._all,
        units: Number(row._sum.units ?? 0),
      };
    }

    return usage;
  }

  private readRunSettings(run: ResearchRun): BotSettings {
    return run.configSnapshot as unknown as BotSettings;
  }

  private toRunSummary(run: ResearchRun): ResearchRunSummary {
    return {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      lastPolledAt: run.lastPolledAt,
      pollIntervalMs: run.pollIntervalMs,
      maxDurationMs: run.maxRunDurationMs,
      discoveryLimit: run.discoveryLimit,
      fullEvaluationLimit: run.fullEvaluationLimit,
      maxMockPositions: run.maxMockPositions,
      fixedPositionSizeUsd: Number(run.fixedPositionSizeUsd),
      birdeyeUnitCap: run.birdeyeUnitCap,
      heliusUnitCap: run.heliusUnitCap,
      totalDiscovered: run.totalDiscovered,
      totalShortlisted: run.totalShortlisted,
      totalEvaluated: run.totalEvaluated,
      totalStrategyPassed: run.totalStrategyPassed,
      totalMockOpened: run.totalMockOpened,
      totalMockClosed: run.totalMockClosed,
      liveTradablePassed: run.liveTradablePassed,
      researchTradablePassed: run.researchTradablePassed,
      birdeyeCalls: run.birdeyeCalls,
      birdeyeUnitsUsed: run.birdeyeUnitsUsed,
      heliusCalls: run.heliusCalls,
      heliusUnitsUsed: run.heliusUnitsUsed,
      realizedPnlUsd: Number(run.realizedPnlUsd),
      winRatePercent: run.winRatePercent === null ? null : Number(run.winRatePercent),
      averageHoldMinutes: run.averageHoldMinutes === null ? null : Number(run.averageHoldMinutes),
      errorMessage: run.errorMessage,
      comparison: (run.comparison as unknown as ResearchRunComparison | null) ?? null,
      configSnapshot: run.configSnapshot as unknown as BotSettings,
    };
  }
}
