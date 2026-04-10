import type { Prisma } from "@prisma/client";
import { db } from "../db/client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import type { BotSettings } from "../types/domain.js";

type CapacityCheckClient = Prisma.TransactionClient | typeof db;

type PositionCapacity = {
  allowed: boolean;
  reason?: string;
  cashUsd: number;
  openPositions: number;
  positionSizeUsd: number;
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

  async canOpenPosition(settingsOverride?: BotSettings): Promise<PositionCapacity> {
    const settings = settingsOverride ?? await this.config.getSettings();
    return this.readCapacity(db, settings);
  }

  async canOpenPositionTx(tx: Prisma.TransactionClient, settings: BotSettings): Promise<PositionCapacity> {
    return this.readCapacity(tx, settings);
  }

  private async readCapacity(client: CapacityCheckClient, settings: BotSettings): Promise<PositionCapacity> {
    const [state, openPositions] = await Promise.all([
      client.botState.findUniqueOrThrow({ where: { id: "singleton" } }),
      client.position.count({ where: { status: "OPEN" } }),
    ]);

    return this.evaluateCapacity({
      settings,
      cashUsd: Number(state.cashUsd),
      openPositions,
      pauseReason: state.pauseReason,
    });
  }

  private evaluateCapacity(input: {
    settings: BotSettings;
    cashUsd: number;
    openPositions: number;
    pauseReason: string | null;
  }): PositionCapacity {
    const { settings, cashUsd, openPositions, pauseReason } = input;
    const positionSizeUsd = Math.min(settings.capital.positionSizeUsd, cashUsd);

    if (settings.tradeMode === "LIVE") {
      return {
        allowed: false,
        reason: "LIVE mode is intentionally blocked until a swap-routing adapter is wired",
        cashUsd,
        openPositions,
        positionSizeUsd,
      };
    }

    if (pauseReason) {
      return { allowed: false, reason: pauseReason, cashUsd, openPositions, positionSizeUsd };
    }

    if (openPositions >= settings.capital.maxOpenPositions) {
      return {
        allowed: false,
        reason: `max ${settings.capital.maxOpenPositions} open positions reached`,
        cashUsd,
        openPositions,
        positionSizeUsd,
      };
    }

    if (positionSizeUsd <= 0) {
      return { allowed: false, reason: "no dry-run capital left", cashUsd, openPositions, positionSizeUsd };
    }

    return { allowed: true, cashUsd, openPositions, positionSizeUsd };
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
}
