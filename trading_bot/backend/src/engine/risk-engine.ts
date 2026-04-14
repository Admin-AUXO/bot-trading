import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { getLiveTradingReadiness } from "../services/live-trade-executor.js";
import type { BotSettings } from "../types/domain.js";

type CapacityCheckClient = Prisma.TransactionClient | typeof db;

type PositionCapacity = {
  allowed: boolean;
  reason?: string;
  retryable?: boolean;
  cashUsd: number;
  openPositions: number;
  positionSizeUsd: number;
  dailyRealizedPnlUsd?: number;
  consecutiveLosses?: number;
};

type DailyRiskState = {
  realizedPnlUsd: number;
  consecutiveLosses: number;
};

type EntrySizingSignal = {
  entryScore?: number | null;
};

export class RiskEngine {
  constructor(private readonly config: RuntimeConfigService) {}

  async ensureState(): Promise<void> {
    const settings = await this.config.getSettings();
    await db.botState.upsert({
      where: { id: "singleton" },
      update: {},
      create: {
        id: "singleton",
        tradeMode: settings.tradeMode,
        capitalUsd: settings.capital.capitalUsd,
        cashUsd: settings.capital.capitalUsd,
        realizedPnlUsd: 0,
      },
    });
  }

  async getSnapshot() {
    return db.botState.findUniqueOrThrow({ where: { id: "singleton" } });
  }

  async canOpenPosition(settingsOverride?: BotSettings, signal?: EntrySizingSignal): Promise<PositionCapacity> {
    const settings = settingsOverride ?? await this.config.getSettings();
    return this.readCapacity(db, settings, signal);
  }

  async canOpenPositionTx(
    tx: Prisma.TransactionClient,
    settings: BotSettings,
    signal?: EntrySizingSignal,
  ): Promise<PositionCapacity> {
    return this.readCapacity(tx, settings, signal);
  }

  private async readCapacity(
    client: CapacityCheckClient,
    settings: BotSettings,
    signal?: EntrySizingSignal,
  ): Promise<PositionCapacity> {
    const [state, openPositions, dailyRisk] = await Promise.all([
      client.botState.findUniqueOrThrow({ where: { id: "singleton" } }),
      client.position.count({ where: { status: "OPEN" } }),
      this.readDailyRiskState(client),
    ]);

    return this.evaluateCapacity({
      settings,
      cashUsd: Number(state.cashUsd),
      openPositions,
      pauseReason: state.pauseReason,
      dailyRisk,
      signal,
    });
  }

  private async readDailyRiskState(client: CapacityCheckClient): Promise<DailyRiskState> {
    const tradingDayStart = new Date();
    tradingDayStart.setHours(0, 0, 0, 0);

    const [realized, recentSellFills] = await Promise.all([
      client.fill.aggregate({
        _sum: { pnlUsd: true },
        where: {
          side: "SELL",
          createdAt: { gte: tradingDayStart },
          pnlUsd: { not: null },
        },
      }),
      env.MAX_CONSECUTIVE_LOSSES > 0
        ? client.fill.findMany({
          where: {
            side: "SELL",
            createdAt: { gte: tradingDayStart },
            pnlUsd: { not: null },
          },
          orderBy: { createdAt: "desc" },
          take: env.MAX_CONSECUTIVE_LOSSES,
          select: { pnlUsd: true },
        })
        : Promise.resolve([]),
    ]);

    let consecutiveLosses = 0;
    for (const fill of recentSellFills) {
      if (Number(fill.pnlUsd ?? 0) < 0) {
        consecutiveLosses += 1;
        continue;
      }
      break;
    }

    return {
      realizedPnlUsd: Number(realized._sum.pnlUsd ?? 0),
      consecutiveLosses,
    };
  }

  private evaluateCapacity(input: {
    settings: BotSettings;
    cashUsd: number;
    openPositions: number;
    pauseReason: string | null;
    dailyRisk: DailyRiskState;
    signal?: EntrySizingSignal;
  }): PositionCapacity {
    const { settings, cashUsd, openPositions, pauseReason, dailyRisk, signal } = input;
    const positionSizeUsd = this.calculatePositionSizeUsd(settings, cashUsd, openPositions, signal);
    const dailyLossUsd = Math.max(dailyRisk.realizedPnlUsd * -1, 0);
    const dailyRiskSnapshot = {
      dailyRealizedPnlUsd: dailyRisk.realizedPnlUsd,
      consecutiveLosses: dailyRisk.consecutiveLosses,
    };

    if (settings.tradeMode === "LIVE") {
      const readiness = getLiveTradingReadiness();
      if (!readiness.ready) {
        return {
          allowed: false,
          reason: readiness.reason ?? "live trading is not configured",
          retryable: false,
          cashUsd,
          openPositions,
          positionSizeUsd,
          ...dailyRiskSnapshot,
        };
      }
    }

    if (pauseReason) {
      return {
        allowed: false,
        reason: pauseReason,
        retryable: true,
        cashUsd,
        openPositions,
        positionSizeUsd,
        ...dailyRiskSnapshot,
      };
    }

    if (env.DAILY_LOSS_LIMIT_USD > 0 && dailyLossUsd >= env.DAILY_LOSS_LIMIT_USD) {
      return {
        allowed: false,
        reason: `daily loss limit reached (${dailyLossUsd.toFixed(2)} / ${env.DAILY_LOSS_LIMIT_USD.toFixed(2)} USD)`,
        retryable: true,
        cashUsd,
        openPositions,
        positionSizeUsd,
        ...dailyRiskSnapshot,
      };
    }

    if (env.MAX_CONSECUTIVE_LOSSES > 0 && dailyRisk.consecutiveLosses >= env.MAX_CONSECUTIVE_LOSSES) {
      return {
        allowed: false,
        reason: `consecutive loss limit reached (${dailyRisk.consecutiveLosses} / ${env.MAX_CONSECUTIVE_LOSSES})`,
        retryable: true,
        cashUsd,
        openPositions,
        positionSizeUsd,
        ...dailyRiskSnapshot,
      };
    }

    if (openPositions >= settings.capital.maxOpenPositions) {
      return {
        allowed: false,
        reason: `max ${settings.capital.maxOpenPositions} open positions reached`,
        retryable: true,
        cashUsd,
        openPositions,
        positionSizeUsd,
        ...dailyRiskSnapshot,
      };
    }

    if (positionSizeUsd <= 0) {
      return {
        allowed: false,
        reason: settings.tradeMode === "LIVE" ? "no quote capital left" : "no dry-run capital left",
        retryable: true,
        cashUsd,
        openPositions,
        positionSizeUsd,
        ...dailyRiskSnapshot,
      };
    }

    return { allowed: true, cashUsd, openPositions, positionSizeUsd, ...dailyRiskSnapshot };
  }

  async recordSell(proceedsUsd: number, pnlUsd: number): Promise<void> {
    await db.botState.update({
      where: { id: "singleton" },
      data: {
        cashUsd: { increment: proceedsUsd },
        realizedPnlUsd: { increment: pnlUsd },
      },
    });
  }

  async touchActivity(kind: "lastDiscoveryAt" | "lastEvaluationAt" | "lastExitCheckAt"): Promise<void> {
    await db.botState.update({
      where: { id: "singleton" },
      data: {
        [kind]: new Date(),
      },
    });
  }

  private calculatePositionSizeUsd(
    settings: BotSettings,
    cashUsd: number,
    openPositions: number,
    signal?: EntrySizingSignal,
  ): number {
    if (cashUsd <= 0) {
      return 0;
    }

    const baseSizeUsd = settings.capital.positionSizeUsd;
    const maxOpenPositions = Math.max(settings.capital.maxOpenPositions, 1);
    const remainingSlots = Math.max(maxOpenPositions - openPositions, 1);
    const entryScore = this.clamp(signal?.entryScore ?? 0.65, 0, 1);
    const minimumTicketUsd = Math.min(cashUsd, Math.max(10, Math.min(baseSizeUsd * 0.6, 15)));
    const standardCapUsd = Math.min(cashUsd, Math.min(baseSizeUsd, cashUsd / remainingSlots));
    const exposureScale = openPositions === 0
      ? 1
      : openPositions === 1
        ? 0.94
        : 0.82;

    let plannedSizeUsd = minimumTicketUsd + Math.max(standardCapUsd - minimumTicketUsd, 0) * entryScore;
    plannedSizeUsd *= exposureScale;

    if (entryScore >= 0.88 && openPositions <= 1) {
      const boostedCapUsd = Math.min(
        cashUsd,
        Math.max(baseSizeUsd + 5, baseSizeUsd * 1.2),
      );
      const boostProgress = this.clamp((entryScore - 0.88) / 0.12, 0, 1);
      plannedSizeUsd = Math.max(
        plannedSizeUsd,
        standardCapUsd + Math.max(boostedCapUsd - standardCapUsd, 0) * boostProgress,
      );
    }

    if (settings.tradeMode === "LIVE" && settings.strategy.liveStrategy.enabled) {
      plannedSizeUsd *= settings.strategy.liveStrategy.capitalModifierPercent / 100;
    }

    const floorUsd = Math.min(cashUsd, openPositions >= maxOpenPositions - 1 ? 10 : minimumTicketUsd);
    return this.roundUsd(this.clamp(plannedSizeUsd, floorUsd, cashUsd));
  }

  private roundUsd(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
