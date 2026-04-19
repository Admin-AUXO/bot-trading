import { Prisma, ProviderName, type ProviderPurpose, type ProviderSource } from "@prisma/client";
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

export type ProviderSlotContext = {
  endpoint?: string;
  sessionId?: string;
  packId?: string;
  configVersion?: number;
  mint?: string;
  candidateId?: string;
  positionId?: string;
};

export type ProviderSlotResult = {
  endpoint?: string;
  httpStatus: number;
  latencyMs: number;
  errorCode?: string;
  creditsUsed?: number;
};

export type ProviderSlot = {
  id: string;
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

const PROVIDER_CREDIT_LOG_BATCH_SIZE = 100;
const PROVIDER_CREDIT_LOG_FLUSH_MS = 500;
const MAX_ACTIVE_SLOTS = 10000;
const MAX_PENDING_CREDIT_ROWS = 5000;

const HELIUS_CREDIT_TABLE: Record<string, number> = {
  getBalance: 1,
  getAccountInfo: 1,
  getTokenLargestAccounts: 1,
  getTokenAccounts: 10,
  getTokenBalances: 10,
  getAsset: 10,
  searchAssets: 10,
  getAssetsByOwner: 10,
  getSignaturesForAsset: 10,
  getTokenHolders: 20,
  parseTransactions: 100,
  getWalletHistory: 100,
  getWalletTransfers: 100,
  getWalletBalances: 100,
  getWalletFundedBy: 100,
  getTransactionHistory: 110,
  getPriorityFeeEstimate: 1,
};

type ActiveSlot = {
  provider: ProviderSource;
  purpose: ProviderPurpose;
  ctx?: ProviderSlotContext;
  startedAt: number;
};

export class ProviderBudgetService {
  private readonly activeSlots = new Map<string, ActiveSlot>();

  private readonly pendingCreditRows: Prisma.ProviderCreditLogCreateManyInput[] = [];

  private flushTimer: NodeJS.Timeout | null = null;

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

  async getBypassSnapshot(): Promise<BirdeyeBudgetSnapshot | null> {
    if (!env.BIRDEYE_BUDGET_EMERGENCY_BYPASS) return null;
    return this.getBirdeyeBudgetSnapshot();
  }

  requestSlot(provider: ProviderSource, purpose: ProviderPurpose, ctx?: ProviderSlotContext): ProviderSlot {
    try {
      if (this.activeSlots.size >= MAX_ACTIVE_SLOTS) {
        const oldestKey = this.findOldestActiveSlot();
        if (oldestKey) {
          this.activeSlots.delete(oldestKey);
        }
      }
      const id = crypto.randomUUID();
      this.activeSlots.set(id, {
        provider,
        purpose,
        ctx,
        startedAt: Date.now(),
      });
      return { id };
    } catch (error) {
      logger.warn(
        {
          provider,
          purpose,
          error: error instanceof Error ? error.message : String(error),
        },
        "Provider budget requestSlot failed open",
      );
      return { id: "slot-untracked" };
    }
  }

  releaseSlot(id: string, result: ProviderSlotResult): void {
    try {
      const slot = this.activeSlots.get(id);
      if (!slot) {
        return;
      }
      this.activeSlots.delete(id);

      const endpoint = result.endpoint ?? slot.ctx?.endpoint ?? "unknown";
      const creditsUsed = this.resolveCredits(slot.provider, endpoint, result.creditsUsed);
      const latencyMs = Number.isFinite(result.latencyMs) ? Math.max(Math.trunc(result.latencyMs), 0) : 0;

      if (this.pendingCreditRows.length >= MAX_PENDING_CREDIT_ROWS) {
        this.pendingCreditRows.splice(0, this.pendingCreditRows.length - MAX_PENDING_CREDIT_ROWS + PROVIDER_CREDIT_LOG_BATCH_SIZE);
      }
      this.pendingCreditRows.push({
        provider: slot.provider,
        endpoint,
        purpose: slot.purpose,
        creditsUsed,
        sessionId: slot.ctx?.sessionId ?? null,
        packId: slot.ctx?.packId ?? null,
        configVersion: slot.ctx?.configVersion ?? null,
        mint: slot.ctx?.mint ?? null,
        candidateId: slot.ctx?.candidateId ?? null,
        positionId: slot.ctx?.positionId ?? null,
        httpStatus: Math.trunc(result.httpStatus),
        latencyMs,
        errorCode: result.errorCode ?? null,
      });

      if (this.pendingCreditRows.length >= PROVIDER_CREDIT_LOG_BATCH_SIZE) {
        this.flushCreditRowsNow();
        return;
      }

      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.flushCreditRowsNow();
        }, PROVIDER_CREDIT_LOG_FLUSH_MS);
      }
    } catch (error) {
      logger.warn(
        {
          slotId: id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Provider budget releaseSlot failed open",
      );
    }
  }

  private resolveCredits(provider: ProviderSource, endpoint: string, observedCredits?: number): number {
    if (typeof observedCredits === "number" && Number.isFinite(observedCredits)) {
      return Math.max(Math.trunc(observedCredits), 0);
    }

    if (provider === "BIRDEYE") {
      return 0;
    }

    if (provider === "HELIUS") {
      return HELIUS_CREDIT_TABLE[endpoint] ?? 0;
    }

    return 0;
  }

  private flushCreditRowsNow(): void {
    if (this.pendingCreditRows.length === 0) {
      return;
    }
    const rows = this.pendingCreditRows.splice(0, this.pendingCreditRows.length);
    void db.providerCreditLog.createMany({ data: rows }).catch((error) => {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), rows: rows.length },
        "Failed to flush ProviderCreditLog rows",
      );
    });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private findOldestActiveSlot(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, slot] of this.activeSlots) {
      if (slot.startedAt < oldestTime) {
        oldestTime = slot.startedAt;
        oldestKey = key;
      }
    }
    return oldestKey;
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.activeSlots.clear();
    this.pendingCreditRows.length = 0;
  }
}
