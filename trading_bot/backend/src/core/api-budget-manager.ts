import type { ApiService, QuotaSource, QuotaStatus, Strategy, TradeMode } from "@prisma/client";
import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { calculateProtectedDailyBudget } from "../config/provider-plan.js";
import { ApiCallBuffer } from "../utils/api-call-buffer.js";
import type { RiskManager } from "./risk-manager.js";
import type { ApiRequestMeta, BudgetSnapshot } from "../utils/types.js";

const DAY_MS = 86_400_000;
const SERVICES: ApiService[] = ["HELIUS", "BIRDEYE"];

interface MutableBudgetState {
  service: ApiService;
  date: string;
  budgetTotal: number;
  totalCalls: number;
  totalCredits: number;
  pendingCredits: number;
  essentialCalls: number;
  essentialCredits: number;
  nonEssentialCredits: number;
  cachedCalls: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  dailyBudget: number;
  dailyRemaining: number;
  avgCreditsPerCall: number;
  softLimitPct: number;
  hardLimitPct: number;
  quotaStatus: QuotaStatus;
  quotaSource: QuotaSource;
  providerCycleStart: Date | null;
  providerCycleEnd: Date | null;
  providerReportedUsed: number | null;
  providerReportedRemaining: number | null;
  providerReportedOverage: number | null;
  providerReportedOverageCost: number | null;
  pauseReason: string | null;
}

interface ReservationCommit {
  endpoint: string;
  credits?: number;
  statusCode?: number;
  latencyMs?: number;
  cacheHit?: boolean;
  success?: boolean;
  batchSize?: number;
}

export interface ProviderBudgetSync {
  cycleStart?: Date | null;
  cycleEnd?: Date | null;
  used?: number | null;
  remaining?: number | null;
  overage?: number | null;
  overageCost?: number | null;
}

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    readonly service: ApiService,
    readonly requestedCredits: number,
  ) {
    super(message);
  }
}

export class ApiBudgetReservation {
  private committed = false;

  constructor(
    private manager: ApiBudgetManager,
    private service: ApiService,
    private requestedCredits: number,
    private meta: Required<Pick<ApiRequestMeta, "purpose" | "essential">> & {
      strategy?: Strategy;
      mode?: TradeMode;
      configProfile?: string;
      batchSize?: number;
    },
  ) {}

  commit(details: ReservationCommit): void {
    if (this.committed) return;
    this.committed = true;
    this.manager.completeReservation(this.service, this.requestedCredits, this.meta, details);
  }

  cancel(): void {
    if (this.committed) return;
    this.committed = true;
    this.manager.cancelReservation(this.service, this.requestedCredits);
  }
}

export class ApiBudgetManager {
  private states = new Map<ApiService, MutableBudgetState>();

  constructor(
    private apiBuffer: ApiCallBuffer,
    private riskManager?: RiskManager,
  ) {}

  async loadState(): Promise<void> {
    const today = todayKey();
    const monthStart = startOfUtcMonth(new Date(today));

    const [dailyRows, monthlyRows] = await Promise.all([
      db.apiUsageDaily.findMany({
        where: { date: new Date(today) },
      }),
      db.apiUsageDaily.groupBy({
        by: ["service"],
        where: { date: { gte: monthStart } },
        _sum: { totalCredits: true },
      }),
    ]);

    for (const service of SERVICES) {
      const daily = dailyRows.find((row) => row.service === service);
      const monthly = monthlyRows.find((row) => row.service === service);
      const state = this.createState(service, daily?.date ?? new Date(today), {
        totalCalls: daily?.totalCalls ?? 0,
        totalCredits: daily?.totalCredits ?? 0,
        essentialCalls: daily?.essentialCalls ?? 0,
        essentialCredits: daily?.essentialCredits ?? 0,
        nonEssentialCredits: daily?.nonEssentialCredits ?? 0,
        cachedCalls: daily?.cachedCalls ?? 0,
        monthlyUsed: daily?.monthlyCreditsUsed ?? Number(monthly?._sum.totalCredits ?? 0),
        quotaSource: daily?.quotaSource ?? "INTERNAL",
        providerCycleStart: daily?.providerCycleStart ?? null,
        providerCycleEnd: daily?.providerCycleEnd ?? null,
        providerReportedUsed: daily?.providerReportedUsed ?? null,
        providerReportedRemaining: daily?.providerReportedRemaining ?? null,
        providerReportedOverage: daily?.providerReportedOverage ?? null,
        providerReportedOverageCost: daily?.providerReportedOverageCost ? Number(daily.providerReportedOverageCost) : null,
      });
      this.states.set(service, state);
      this.syncPauseState(state);
    }
  }

  async reserve(service: ApiService, requestedCredits: number, meta?: ApiRequestMeta): Promise<ApiBudgetReservation> {
    const state = this.rolloverIfNeeded(service);
    const normalizedMeta = {
      strategy: meta?.strategy,
      mode: meta?.mode,
      configProfile: meta?.configProfile,
      purpose: meta?.purpose ?? "OTHER",
      essential: meta?.essential ?? false,
      batchSize: meta?.batchSize,
    } as const;

    if (requestedCredits > 0) {
      const monthlyRemaining = this.getMonthlyRemaining(state);
      if (monthlyRemaining < requestedCredits) {
        this.syncPauseState(state);
        throw new QuotaExceededError(`monthly ${service} quota exhausted`, service, requestedCredits);
      }

      const projectedDaily = state.totalCredits + state.pendingCredits + requestedCredits;
      const protectedReserve = state.dailyBudget > 0
        ? Math.max(1, Math.ceil(state.dailyBudget * config.apiBudgets.reservePct))
        : 0;
      if (!normalizedMeta.essential && state.dailyBudget > 0 && projectedDaily > Math.max(0, state.dailyBudget - protectedReserve)) {
        throw new QuotaExceededError(`daily ${service} budget reserved for essential traffic`, service, requestedCredits);
      }

      state.pendingCredits += requestedCredits;
      this.recomputeState(state);
      this.syncPauseState(state);
    }

    return new ApiBudgetReservation(this, service, requestedCredits, normalizedMeta);
  }

  cancelReservation(service: ApiService, requestedCredits: number): void {
    const state = this.rolloverIfNeeded(service);
    state.pendingCredits = Math.max(0, state.pendingCredits - requestedCredits);
    this.recomputeState(state);
    this.syncPauseState(state);
  }

  completeReservation(
    service: ApiService,
    requestedCredits: number,
    meta: Required<Pick<ApiRequestMeta, "purpose" | "essential">> & {
      strategy?: Strategy;
      mode?: TradeMode;
      configProfile?: string;
      batchSize?: number;
    },
    details: ReservationCommit,
  ): void {
    const state = this.rolloverIfNeeded(service);
    state.pendingCredits = Math.max(0, state.pendingCredits - requestedCredits);

    const actualCredits = Math.max(0, details.cacheHit ? 0 : details.credits ?? requestedCredits);
    state.totalCalls += 1;
    state.totalCredits += actualCredits;
    if (meta.essential) {
      state.essentialCalls += 1;
      state.essentialCredits += actualCredits;
    } else {
      state.nonEssentialCredits += actualCredits;
    }
    if (details.cacheHit) {
      state.cachedCalls += 1;
    }

    this.recomputeState(state);
    this.syncPauseState(state);

    this.apiBuffer.log({
      service,
      endpoint: details.endpoint,
      credits: actualCredits,
      requestedCredits,
      strategy: meta.strategy,
      mode: meta.mode,
      configProfile: meta.configProfile,
      purpose: meta.purpose,
      essential: meta.essential,
      cacheHit: details.cacheHit ?? false,
      batchSize: details.batchSize ?? meta.batchSize,
      statusCode: details.statusCode,
      latencyMs: details.latencyMs,
      success: details.success ?? (details.statusCode ? details.statusCode < 400 : true),
    });
  }

  recordCacheHit(service: ApiService, endpoint: string, meta?: ApiRequestMeta): void {
    const state = this.rolloverIfNeeded(service);
    state.totalCalls += 1;
    state.cachedCalls += 1;
    if (meta?.essential) {
      state.essentialCalls += 1;
    }
    this.recomputeState(state);
    this.apiBuffer.log({
      service,
      endpoint,
      credits: 0,
      requestedCredits: 0,
      strategy: meta?.strategy,
      mode: meta?.mode,
      configProfile: meta?.configProfile,
      purpose: meta?.purpose ?? "OTHER",
      essential: meta?.essential ?? false,
      cacheHit: true,
      batchSize: meta?.batchSize,
      success: true,
    });
  }

  recordProviderSnapshot(service: ApiService, snapshot: ProviderBudgetSync): void {
    const state = this.rolloverIfNeeded(service);
    state.providerCycleStart = snapshot.cycleStart ?? state.providerCycleStart;
    state.providerCycleEnd = snapshot.cycleEnd ?? state.providerCycleEnd;
    state.providerReportedUsed = snapshot.used ?? state.providerReportedUsed;
    state.providerReportedRemaining = snapshot.remaining ?? state.providerReportedRemaining;
    state.providerReportedOverage = snapshot.overage ?? state.providerReportedOverage;
    state.providerReportedOverageCost = snapshot.overageCost ?? state.providerReportedOverageCost;
    state.quotaSource = "MIXED";
    this.recomputeState(state);
    this.syncPauseState(state);
  }

  shouldRunNonEssential(service: ApiService): boolean {
    const state = this.rolloverIfNeeded(service);
    return state.quotaStatus === "HEALTHY";
  }

  getSnapshot(service: ApiService): BudgetSnapshot {
    const state = this.rolloverIfNeeded(service);
    return this.toSnapshot(state);
  }

  getSnapshots(): BudgetSnapshot[] {
    return SERVICES.map((service) => this.getSnapshot(service));
  }

  async persistCurrentState(): Promise<void> {
    await Promise.all(SERVICES.map(async (service) => {
      const state = this.rolloverIfNeeded(service);
      await db.apiUsageDaily.upsert({
        where: { date_service: { date: new Date(state.date), service } },
        update: this.toPersistencePayload(state),
        create: {
          date: new Date(state.date),
          service,
          ...this.toPersistencePayload(state),
        },
      });
    }));
  }

  private rolloverIfNeeded(service: ApiService): MutableBudgetState {
    const current = this.states.get(service);
    const today = todayKey();
    if (!current || current.date !== today) {
      const nextState = this.createState(service, new Date(today));
      this.states.set(service, nextState);
      for (const reason of this.getQuotaPauseReasons(service)) {
        this.riskManager?.unpause(reason);
      }
      return nextState;
    }
    return current;
  }

  private createState(
    service: ApiService,
    date: Date,
    initial?: Partial<MutableBudgetState>,
  ): MutableBudgetState {
    const cycleStart = initial?.providerCycleStart ?? startOfUtcMonth(date);
    const cycleEnd = initial?.providerCycleEnd ?? endOfUtcMonth(date);
    const state: MutableBudgetState = {
      service,
      date: todayKey(date),
      budgetTotal: service === "HELIUS" ? config.apiBudgets.helius.monthly : config.apiBudgets.birdeye.monthly,
      totalCalls: initial?.totalCalls ?? 0,
      totalCredits: initial?.totalCredits ?? 0,
      pendingCredits: 0,
      essentialCalls: initial?.essentialCalls ?? 0,
      essentialCredits: initial?.essentialCredits ?? 0,
      nonEssentialCredits: initial?.nonEssentialCredits ?? 0,
      cachedCalls: initial?.cachedCalls ?? 0,
      monthlyUsed: initial?.monthlyUsed ?? 0,
      monthlyRemaining: 0,
      dailyBudget: 0,
      dailyRemaining: 0,
      avgCreditsPerCall: 0,
      softLimitPct: config.apiBudgets.softLimitPct,
      hardLimitPct: config.apiBudgets.hardLimitPct,
      quotaStatus: "HEALTHY",
      quotaSource: initial?.quotaSource ?? "INTERNAL",
      providerCycleStart: cycleStart,
      providerCycleEnd: cycleEnd,
      providerReportedUsed: initial?.providerReportedUsed ?? null,
      providerReportedRemaining: initial?.providerReportedRemaining ?? null,
      providerReportedOverage: initial?.providerReportedOverage ?? null,
      providerReportedOverageCost: initial?.providerReportedOverageCost ?? null,
      pauseReason: null,
    };
    this.recomputeState(state);
    return state;
  }

  private recomputeState(state: MutableBudgetState): void {
    const providerRemaining = state.providerReportedRemaining;
    const providerUsed = state.providerReportedUsed;
    state.monthlyUsed = providerUsed ?? state.monthlyUsed;
    state.monthlyRemaining = providerRemaining ?? Math.max(0, state.budgetTotal - state.monthlyUsed);
    state.monthlyUsed = state.budgetTotal - state.monthlyRemaining;

    const budgetWindow = calculateProtectedDailyBudget({
      budgetTotal: state.budgetTotal,
      monthlyRemaining: state.monthlyRemaining,
      reservePct: config.apiBudgets.reservePct,
      cycleEnd: state.providerCycleEnd ?? endOfUtcMonth(new Date(state.date)),
    });
    state.dailyBudget = budgetWindow.dailyBudget;
    state.dailyRemaining = Math.max(0, state.dailyBudget - state.totalCredits - state.pendingCredits);
    state.avgCreditsPerCall = state.totalCalls > 0 ? state.totalCredits / state.totalCalls : 0;

    const hardUsed = state.dailyBudget > 0 && state.totalCredits + state.pendingCredits >= state.dailyBudget;
    const softUsed = state.dailyBudget > 0
      && state.totalCredits + state.pendingCredits >= Math.floor(state.dailyBudget * (state.softLimitPct / 100));

    if (state.monthlyRemaining <= 0) {
      state.quotaStatus = "PAUSED";
      state.pauseReason = `api quota exhausted: ${state.service}`;
    } else if (hardUsed) {
      state.quotaStatus = "HARD_LIMIT";
      state.pauseReason = `api daily quota hit: ${state.service}`;
    } else if (softUsed) {
      state.quotaStatus = "SOFT_LIMIT";
      state.pauseReason = null;
    } else {
      state.quotaStatus = "HEALTHY";
      state.pauseReason = null;
    }
  }

  private syncPauseState(state: MutableBudgetState): void {
    const reasons = this.getQuotaPauseReasons(state.service);
    if (state.pauseReason) {
      for (const reason of reasons) {
        if (reason !== state.pauseReason) this.riskManager?.unpause(reason);
      }
      this.riskManager?.pause(state.pauseReason);
      return;
    }

    for (const reason of reasons) {
      this.riskManager?.unpause(reason);
    }
  }

  private getMonthlyRemaining(state: MutableBudgetState): number {
    return Math.max(0, state.monthlyRemaining - state.pendingCredits);
  }

  private getQuotaPauseReasons(service: ApiService): string[] {
    return [`api daily quota hit: ${service}`, `api quota exhausted: ${service}`];
  }

  private toSnapshot(state: MutableBudgetState): BudgetSnapshot {
    return {
      service: state.service,
      date: state.date,
      budgetTotal: state.budgetTotal,
      monthlyUsed: state.monthlyUsed,
      monthlyRemaining: state.monthlyRemaining,
      dailyBudget: state.dailyBudget,
      dailyUsed: state.totalCredits,
      dailyRemaining: state.dailyRemaining,
      essentialCredits: state.essentialCredits,
      nonEssentialCredits: state.nonEssentialCredits,
      cachedCalls: state.cachedCalls,
      totalCalls: state.totalCalls,
      avgCreditsPerCall: state.avgCreditsPerCall,
      softLimitPct: state.softLimitPct,
      hardLimitPct: state.hardLimitPct,
      quotaStatus: state.quotaStatus,
      quotaSource: state.quotaSource,
      providerCycleStart: state.providerCycleStart,
      providerCycleEnd: state.providerCycleEnd,
      providerReportedUsed: state.providerReportedUsed,
      providerReportedRemaining: state.providerReportedRemaining,
      providerReportedOverage: state.providerReportedOverage,
      providerReportedOverageCost: state.providerReportedOverageCost,
      pauseReason: state.pauseReason,
    };
  }

  private toPersistencePayload(state: MutableBudgetState) {
    return {
      totalCalls: state.totalCalls,
      totalCredits: state.totalCredits,
      budgetTotal: state.budgetTotal,
      budgetUsedPercent: state.budgetTotal > 0 ? (state.monthlyUsed / state.budgetTotal) * 100 : 0,
      monthlyCreditsUsed: state.monthlyUsed,
      monthlyCreditsRemaining: state.monthlyRemaining,
      dailyBudget: state.dailyBudget,
      dailyCreditsRemaining: state.dailyRemaining,
      essentialCalls: state.essentialCalls,
      essentialCredits: state.essentialCredits,
      nonEssentialCredits: state.nonEssentialCredits,
      cachedCalls: state.cachedCalls,
      avgCreditsPerCall: state.avgCreditsPerCall,
      peakRps: 0,
      avgLatencyMs: 0,
      errorCount: 0,
      softLimitPct: state.softLimitPct,
      hardLimitPct: state.hardLimitPct,
      quotaStatus: state.quotaStatus,
      quotaSource: state.quotaSource,
      providerCycleStart: state.providerCycleStart,
      providerCycleEnd: state.providerCycleEnd,
      providerReportedUsed: state.providerReportedUsed,
      providerReportedRemaining: state.providerReportedRemaining,
      providerReportedOverage: state.providerReportedOverage,
      providerReportedOverageCost: state.providerReportedOverageCost,
      pauseTriggeredAt: state.pauseReason ? new Date() : null,
      pauseReason: state.pauseReason,
    };
  }
}

function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}
