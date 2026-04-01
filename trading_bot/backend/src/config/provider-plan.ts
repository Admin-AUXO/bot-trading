const DAY_MS = 86_400_000;

export const BIRDEYE_PLAN_PROFILES = {
  LITE: {
    name: "LITE",
    monthlyCu: 1_500_000,
    rateLimitRps: 15,
    websocketAccess: false,
    s2CatchupIntervalMs: 30 * 60_000,
    priceSlowPathRefreshMs: 3 * 60_000,
    tradeDataSlowPathRefreshMs: 3 * 60_000,
  },
  STARTER: {
    name: "STARTER",
    monthlyCu: 5_000_000,
    rateLimitRps: 15,
    websocketAccess: false,
    s2CatchupIntervalMs: 10 * 60_000,
    priceSlowPathRefreshMs: 60_000,
    tradeDataSlowPathRefreshMs: 60_000,
  },
} as const;

export type BirdeyePlanName = keyof typeof BIRDEYE_PLAN_PROFILES;
export type BirdeyePlanProfile = (typeof BIRDEYE_PLAN_PROFILES)[BirdeyePlanName];

export interface ProtectedDailyBudget {
  reserveCredits: number;
  remainingDays: number;
  distributableRemaining: number;
  dailyBudget: number;
}

export function getBirdeyePlanProfile(plan: BirdeyePlanName): BirdeyePlanProfile {
  return BIRDEYE_PLAN_PROFILES[plan];
}

export function estimateBirdeyeBatchCost(batchSize: number, baseCost: number = 5): number {
  return Math.ceil(Math.pow(Math.max(batchSize, 1), 0.8) * Math.max(baseCost, 0));
}

export function calculateProtectedDailyBudget(params: {
  budgetTotal: number;
  monthlyRemaining: number;
  reservePct: number;
  cycleEnd: Date;
  now?: Date;
}): ProtectedDailyBudget {
  const now = params.now ?? new Date();
  const remainingDays = Math.max(1, Math.ceil((params.cycleEnd.getTime() - now.getTime()) / DAY_MS));
  const reserveCredits = Math.floor(params.budgetTotal * params.reservePct);
  const distributableRemaining = Math.max(0, params.monthlyRemaining - reserveCredits);
  const dailyBudget = remainingDays > 0
    ? Math.floor(distributableRemaining / remainingDays)
    : distributableRemaining;

  return {
    reserveCredits,
    remainingDays,
    distributableRemaining,
    dailyBudget,
  };
}
