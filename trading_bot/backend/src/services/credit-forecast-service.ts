import { db } from "../db/client.js";
import { env } from "../config/env.js";
import type { BotSettings, LiveStrategySettings, SessionBudgetForecast, SessionBudgetProviderForecast } from "../types/domain.js";
import type { DiscoveryLabRunDetail } from "./discovery-lab-service.js";

const FORECAST_PROVIDERS = ["BIRDEYE", "HELIUS"] as const;

type ForecastProvider = (typeof FORECAST_PROVIDERS)[number];

type CreditForecastServiceDeps = {
  prisma?: Pick<typeof db, "providerCreditLog">;
  now?: () => Date;
};

type ForecastUsageRow = {
  provider: ForecastProvider;
  _sum: {
    creditsUsed: number | null;
  };
};

type SessionForecastInput = {
  mode: "DRY_RUN" | "LIVE";
  run: DiscoveryLabRunDetail;
  settings: BotSettings;
  strategy: LiveStrategySettings;
};

const PROVIDER_SEED_COSTS: Record<ForecastProvider, {
  discoveryCreditsPerCandidate: number;
  acceptedCreditsPerHour: number;
  exitCreditsPerTick: number;
  webhookCreditsPerEvent: number;
}> = {
  BIRDEYE: {
    discoveryCreditsPerCandidate: 8,
    acceptedCreditsPerHour: 60,
    exitCreditsPerTick: 10,
    webhookCreditsPerEvent: 0,
  },
  HELIUS: {
    discoveryCreditsPerCandidate: 2,
    acceptedCreditsPerHour: 20,
    exitCreditsPerTick: 1,
    webhookCreditsPerEvent: 10,
  },
};

export class CreditForecastService {
  private readonly prisma: Pick<typeof db, "providerCreditLog">;

  private readonly now: () => Date;

  constructor(deps: CreditForecastServiceDeps = {}) {
    this.prisma = deps.prisma ?? db;
    this.now = deps.now ?? (() => new Date());
  }

  async forecastSession(input: SessionForecastInput): Promise<SessionBudgetForecast> {
    const now = this.now();
    const durationHours = env.CREDIT_FORECAST_SESSION_HOURS;
    const assumptions = deriveForecastAssumptions(input.run, input.settings, input.strategy);
    const usage = await this.loadUsage(now);
    const providers = FORECAST_PROVIDERS.map((provider) => buildProviderForecast({
      provider,
      durationHours,
      now,
      assumptions,
      usage: usage[provider],
    }));

    const criticalProviders = providers.filter((provider) => provider.exceededDailyBudget || provider.exceededMonthlyBudget);
    const overrideUsed = criticalProviders.length > 0 && env.ALLOW_START_ON_BUDGET_CRITICAL;
    const allowed = criticalProviders.length === 0 || overrideUsed;

    return {
      durationHours,
      mode: input.mode,
      packId: input.strategy.packId,
      packName: input.strategy.packName,
      allowed,
      overrideUsed,
      blockingReason: allowed ? null : formatBlockingReason(criticalProviders),
      warningLevel: deriveOverallWarningLevel(providers, overrideUsed),
      assumptions,
      providers,
    };
  }

  private async loadUsage(now: Date): Promise<Record<ForecastProvider, { todayCreditsUsed: number; monthCreditsUsed: number }>> {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [monthRows, dayRows] = await Promise.all([
      this.prisma.providerCreditLog.groupBy({
        by: ["provider"],
        where: {
          provider: { in: [...FORECAST_PROVIDERS] },
          recordedAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { creditsUsed: true },
      }) as Promise<ForecastUsageRow[]>,
      this.prisma.providerCreditLog.groupBy({
        by: ["provider"],
        where: {
          provider: { in: [...FORECAST_PROVIDERS] },
          recordedAt: { gte: dayStart, lt: now },
        },
        _sum: { creditsUsed: true },
      }) as Promise<ForecastUsageRow[]>,
    ]);

    return {
      BIRDEYE: {
        todayCreditsUsed: readCredits(dayRows, "BIRDEYE"),
        monthCreditsUsed: readCredits(monthRows, "BIRDEYE"),
      },
      HELIUS: {
        todayCreditsUsed: readCredits(dayRows, "HELIUS"),
        monthCreditsUsed: readCredits(monthRows, "HELIUS"),
      },
    };
  }
}

function deriveForecastAssumptions(
  run: DiscoveryLabRunDetail,
  settings: BotSettings,
  strategy: LiveStrategySettings,
): SessionBudgetForecast["assumptions"] {
  const durationHours = Math.max(readRunDurationHours(run), 0.5);
  const evaluationCount = Math.max(run.evaluationCount ?? 0, 0);
  const winnerCount = Math.max(strategy.calibrationSummary?.winnerCount ?? run.winnerCount ?? 0, 0);
  const discoveryCandidatesPerHour = clamp(Math.max(evaluationCount / durationHours, 12), 6, 160);
  const acceptedCandidatesPerHour = clamp(Math.max(winnerCount / durationHours, 0.5), 0.25, 12);
  const openPositionsAverage = clamp(
    Math.max(1, Math.ceil(Math.min(settings.capital.maxOpenPositions, acceptedCandidatesPerHour * 1.5))),
    1,
    settings.capital.maxOpenPositions,
  );
  const exitTicksPerHour = Math.max(1, Math.round(3_600_000 / settings.cadence.exitIntervalMs));
  const packMultiplier = resolvePackMultiplier(strategy.packId, strategy.packName);
  const webhookEventsPerHour = packMultiplier >= 1.7 ? 6 : packMultiplier >= 1.4 ? 2 : 0;

  return {
    discoveryCandidatesPerHour: round(discoveryCandidatesPerHour),
    acceptedCandidatesPerHour: round(acceptedCandidatesPerHour),
    openPositionsAverage,
    exitTicksPerHour,
    webhookEventsPerHour,
    packMultiplier,
  };
}

function buildProviderForecast(input: {
  provider: ForecastProvider;
  durationHours: number;
  now: Date;
  assumptions: SessionBudgetForecast["assumptions"];
  usage: { todayCreditsUsed: number; monthCreditsUsed: number };
}): SessionBudgetProviderForecast {
  const monthlyBudgetCredits = input.provider === "BIRDEYE"
    ? env.BIRDEYE_MONTHLY_CU_BUDGET
    : env.HELIUS_MONTHLY_CREDIT_BUDGET;
  const daysInMonth = new Date(input.now.getFullYear(), input.now.getMonth() + 1, 0).getDate();
  const dailyBudgetCredits = Math.round(monthlyBudgetCredits / daysInMonth);
  const seed = PROVIDER_SEED_COSTS[input.provider];
  const estimatedCredits = Math.round(input.durationHours * input.assumptions.packMultiplier * (
    (input.assumptions.discoveryCandidatesPerHour * seed.discoveryCreditsPerCandidate)
    + (input.assumptions.acceptedCandidatesPerHour * seed.acceptedCreditsPerHour)
    + (input.assumptions.openPositionsAverage * input.assumptions.exitTicksPerHour * seed.exitCreditsPerTick)
    + (input.assumptions.webhookEventsPerHour * seed.webhookCreditsPerEvent)
  ));
  const remainingDailyCredits = Math.max(dailyBudgetCredits - input.usage.todayCreditsUsed, 0);
  const remainingMonthlyCredits = Math.max(monthlyBudgetCredits - input.usage.monthCreditsUsed, 0);
  const exceededDailyBudget = estimatedCredits > remainingDailyCredits;
  const exceededMonthlyBudget = estimatedCredits > remainingMonthlyCredits;
  const dailyPressure = remainingDailyCredits <= 0 ? Number.POSITIVE_INFINITY : estimatedCredits / remainingDailyCredits;
  const warningLevel = exceededDailyBudget || exceededMonthlyBudget
    ? "critical"
    : dailyPressure >= 0.7
      ? "warning"
      : dailyPressure >= 0.4
        ? "info"
        : "none";

  return {
    provider: input.provider,
    estimatedCredits,
    todayCreditsUsed: input.usage.todayCreditsUsed,
    monthCreditsUsed: input.usage.monthCreditsUsed,
    dailyBudgetCredits,
    monthlyBudgetCredits,
    remainingDailyCredits,
    remainingMonthlyCredits,
    warningLevel,
    exceededDailyBudget,
    exceededMonthlyBudget,
  };
}

function readCredits(rows: ForecastUsageRow[], provider: ForecastProvider): number {
  const row = rows.find((candidate) => candidate.provider === provider);
  return Number(row?._sum.creditsUsed ?? 0);
}

function readRunDurationHours(run: DiscoveryLabRunDetail): number {
  const startedAt = run.startedAt ? Date.parse(run.startedAt) : Number.NaN;
  const completedAt = run.completedAt ? Date.parse(run.completedAt) : Number.NaN;
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt <= startedAt) {
    return 1;
  }
  return (completedAt - startedAt) / 3_600_000;
}

function resolvePackMultiplier(packId?: string | null, packName?: string | null): number {
  const target = `${packId ?? ""} ${packName ?? ""}`.toLowerCase();
  if (target.includes("smart_money")) {
    return 1.7;
  }
  if (target.includes("early_graduation")) {
    return 1.4;
  }
  if (target.includes("pump_fun_ape")) {
    return 1.2;
  }
  return 1;
}

function deriveOverallWarningLevel(
  providers: SessionBudgetProviderForecast[],
  overrideUsed: boolean,
): SessionBudgetForecast["warningLevel"] {
  if (overrideUsed || providers.some((provider) => provider.warningLevel === "critical")) {
    return "critical";
  }
  if (providers.some((provider) => provider.warningLevel === "warning")) {
    return "warning";
  }
  if (providers.some((provider) => provider.warningLevel === "info")) {
    return "info";
  }
  return "none";
}

function formatBlockingReason(providers: SessionBudgetProviderForecast[]): string {
  return `session start blocked by credit forecast: ${providers.map((provider) => {
    if (provider.exceededDailyBudget) {
      return `${provider.provider} forecast ${provider.estimatedCredits} exceeds remaining daily budget ${provider.remainingDailyCredits}`;
    }
    return `${provider.provider} forecast ${provider.estimatedCredits} exceeds remaining monthly budget ${provider.remainingMonthlyCredits}`;
  }).join("; ")}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
