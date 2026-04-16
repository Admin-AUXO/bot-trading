import { ProviderName } from "@prisma/client";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { logger } from "../utils/logger.js";
import { recordOperatorEvent } from "./operator-events.js";

export type BirdeyeBudgetLane = "discovery" | "evaluation" | "security" | "reserve";

export type BirdeyeLaneBudget = {
  lane: BirdeyeBudgetLane;
  budgetUnits: number;
  usedUnits: number;
  remainingUnits: number;
  projectedMonthlyUnits: number;
};

export type BirdeyeBudgetSnapshot = {
  provider: ProviderName;
  monthStartedAt: Date;
  monthEndsAt: Date;
  monthProgress: number;
  monthlyBudgetUnits: number;
  totalUsedUnits: number;
  remainingUnits: number;
  projectedMonthlyUnits: number;
  lanes: Record<BirdeyeBudgetLane, BirdeyeLaneBudget>;
};

export type BirdeyeSpendDecision = {
  allowed: boolean;
  reason?: string;
  snapshot: BirdeyeBudgetSnapshot;
};

const LANE_SHARES: Record<BirdeyeBudgetLane, number> = {
  discovery: env.BIRDEYE_DISCOVERY_BUDGET_SHARE,
  evaluation: env.BIRDEYE_EVALUATION_BUDGET_SHARE,
  security: env.BIRDEYE_SECURITY_BUDGET_SHARE,
  reserve: env.BIRDEYE_RESERVE_BUDGET_SHARE,
};

const ENDPOINT_LANE: Record<string, BirdeyeBudgetLane> = {
  "/defi/v3/token/meme/list": "discovery",
  "/defi/v3/token/meme/detail/single": "evaluation",
  "/defi/token_overview": "evaluation",
  "/defi/v3/token/trade-data/single": "evaluation",
  "/defi/price": "evaluation",
  "/defi/token_security": "security",
  "/defi/multi_price": "reserve",
};

export class ProviderBudgetService {
  async getBirdeyeBudgetSnapshot(now = new Date()): Promise<BirdeyeBudgetSnapshot> {
    const monthStartedAt = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEndsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const elapsedMs = Math.max(now.getTime() - monthStartedAt.getTime(), 1);
    const monthDurationMs = Math.max(monthEndsAt.getTime() - monthStartedAt.getTime(), 1);
    const monthProgress = this.clamp(elapsedMs / monthDurationMs, 1 / 31, 1);

    const grouped = await db.apiEvent.groupBy({
      by: ["endpoint"],
      where: {
        provider: "BIRDEYE",
        calledAt: { gte: monthStartedAt, lt: monthEndsAt },
      },
      _sum: { units: true },
    });

    const usedByLane: Record<BirdeyeBudgetLane, number> = {
      discovery: 0,
      evaluation: 0,
      security: 0,
      reserve: 0,
    };

    for (const row of grouped) {
      const lane = ENDPOINT_LANE[row.endpoint] ?? "reserve";
      usedByLane[lane] += Number(row._sum.units ?? 0);
    }

    const monthlyBudgetUnits = env.BIRDEYE_MONTHLY_CU_BUDGET;
    const totalUsedUnits = Object.values(usedByLane).reduce((sum, value) => sum + value, 0);
    const projectedMonthlyUnits = Math.round(totalUsedUnits / monthProgress);
    const remainingUnits = Math.max(monthlyBudgetUnits - totalUsedUnits, 0);

    const lanes = Object.fromEntries(
      (Object.keys(LANE_SHARES) as BirdeyeBudgetLane[]).map((lane) => {
        const budgetUnits = Math.round(monthlyBudgetUnits * LANE_SHARES[lane]);
        const usedUnits = usedByLane[lane];
        return [lane, {
          lane,
          budgetUnits,
          usedUnits,
          remainingUnits: Math.max(budgetUnits - usedUnits, 0),
          projectedMonthlyUnits: Math.round(usedUnits / monthProgress),
        }];
      }),
    ) as Record<BirdeyeBudgetLane, BirdeyeLaneBudget>;

    return {
      provider: "BIRDEYE",
      monthStartedAt,
      monthEndsAt,
      monthProgress,
      monthlyBudgetUnits,
      totalUsedUnits,
      remainingUnits,
      projectedMonthlyUnits,
      lanes,
    };
  }

  async canSpend(lane: BirdeyeBudgetLane, projectedUnits: number): Promise<BirdeyeSpendDecision> {
    const snapshot = await this.getBirdeyeBudgetSnapshot();
    if (projectedUnits <= 0) {
      return { allowed: true, snapshot };
    }

    if (snapshot.totalUsedUnits + projectedUnits > snapshot.monthlyBudgetUnits) {
      const reason = `Birdeye monthly budget exhausted (${snapshot.totalUsedUnits}/${snapshot.monthlyBudgetUnits} CU used)`;
      logger.warn({ reason, lane }, "Birdeye budget exhausted");
      await this.emitBudgetWarning("exhausted", lane, reason);
      return { allowed: false, reason, snapshot };
    }

    const projectedMonthlyBurn = Math.round((snapshot.totalUsedUnits + projectedUnits) / snapshot.monthProgress);
    if (lane !== "reserve" && projectedMonthlyBurn > snapshot.monthlyBudgetUnits * 1.05) {
      const reason = `Birdeye monthly pace too hot (${projectedMonthlyBurn}/${snapshot.monthlyBudgetUnits} CU projected)`;
      logger.warn({ reason, lane }, "Birdeye budget pace warning");
      await this.emitBudgetWarning("pace_hot", lane, reason);
      return { allowed: false, reason, snapshot };
    }

    const laneSnapshot = snapshot.lanes[lane];
    const laneProjectedMonthlyBurn = Math.round((laneSnapshot.usedUnits + projectedUnits) / snapshot.monthProgress);
    const laneBudgetCap = lane === "reserve"
      ? laneSnapshot.budgetUnits * 1.5
      : laneSnapshot.budgetUnits * 1.1;

    if (laneProjectedMonthlyBurn > laneBudgetCap) {
      const reason = `Birdeye ${lane} pace above target (${laneProjectedMonthlyBurn}/${laneSnapshot.budgetUnits} CU projected)`;
      logger.warn({ reason, lane }, "Birdeye lane budget pace warning");
      await this.emitBudgetWarning("lane_pace_hot", lane, reason);
      return { allowed: false, reason, snapshot };
    }

    return { allowed: true, snapshot };
  }

  private async emitBudgetWarning(type: string, lane: BirdeyeBudgetLane, detail: string): Promise<void> {
    try {
      await recordOperatorEvent({
        kind: `birdeye_budget_${type}`,
        level: "warning",
        title: `Birdeye budget ${type}: ${lane} lane`,
        detail,
        metadata: { lane, type },
      });
    } catch {
      // Swallow: event emission failure must not block budget decisions
    }
  }

  /**
   * Returns cached/shared facts when BIRDEYE_BUDGET_EMERGENCY_BYPASS=true.
   * In bypass mode, callers should treat a { allowed: false } decision as
   * { allowed: true, snapshot } using the most recent snapshot without a fresh API call.
   */
  async getBypassSnapshot(): Promise<BirdeyeBudgetSnapshot | null> {
    if (!env.BIRDEYE_BUDGET_EMERGENCY_BYPASS) return null;
    return this.getBirdeyeBudgetSnapshot();
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
