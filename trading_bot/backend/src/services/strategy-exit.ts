import type { BotSettings } from "../types/domain.js";
import { applyStrategySettings } from "./strategy-presets.js";
import { asRecord, asNumber, clamp } from "../utils/types.js";

export type ExitProfile = "scalp" | "balanced" | "runner";

export type ExitPlan = {
  profile: ExitProfile;
  stopLossPercent: number;
  tp1Multiplier: number;
  tp2Multiplier: number;
  tp1SellFraction: number;
  tp2SellFraction: number;
  postTp1RetracePercent: number;
  trailingStopPercent: number;
  timeStopMinutes: number;
  timeStopMinReturnPercent: number;
  timeLimitMinutes: number;
};

export type ExitPlanContext = {
  marketCapUsd?: number | null;
  timeSinceGraduationMin?: number | null;
  top10HolderPercent?: number | null;
  largestHolderPercent?: number | null;
  socialCount?: number | null;
  rugScoreNormalized?: number | null;
  lpLockedPercent?: number | null;
  softIssueCount?: number | null;
};

type RuntimeExitPlan = Pick<
  ExitPlan,
  | "tp1SellFraction"
  | "tp2SellFraction"
  | "postTp1RetracePercent"
  | "trailingStopPercent"
  | "timeStopMinutes"
  | "timeStopMinReturnPercent"
  | "timeLimitMinutes"
>;

export type ExitDecision = {
  reason: string;
  fraction?: number;
  peakPriceUsd: number;
};

export type ManagedExitPosition = {
  openedAt: Date;
  entryPriceUsd: number;
  peakPriceUsd: number;
  stopLossPriceUsd: number;
  takeProfit1PriceUsd: number;
  takeProfit2PriceUsd: number;
  trailingStopPercent: number;
  tp1Done: boolean;
  tp2Done: boolean;
  metadata: unknown;
};

export function buildExitPlan(
  settings: BotSettings,
  entryScore: number,
  strategyPresetId = settings.strategy.livePresetId,
  context?: ExitPlanContext,
): ExitPlan {
  const exits = applyStrategySettings(settings, strategyPresetId).exits;

  if (entryScore >= 0.82) {
    const timeStopMinutes = scaleMinutes(exits.timeStopMinutes, 1.7, exits.timeStopMinutes + 1, 60);
    const timeLimitMinutes = ensureTimeLimit(
      scaleMinutes(exits.timeLimitMinutes, 1.6, exits.timeLimitMinutes + 2, 90),
      timeStopMinutes,
    );
    return applyExitContext({
      profile: "runner",
      stopLossPercent: clamp(exits.stopLossPercent * 1.05, 12, 35),
      tp1Multiplier: Math.max(exits.tp1Multiplier + 0.15, 1.55),
      tp2Multiplier: Math.max(exits.tp2Multiplier + 0.4, 2.6),
      tp1SellFraction: clamp(exits.tp1SellFraction - 0.15, 0.2, 0.45),
      tp2SellFraction: clamp(exits.tp2SellFraction - 0.05, 0.15, 0.35),
      postTp1RetracePercent: clamp(exits.postTp1RetracePercent + 3, 10, 25),
      trailingStopPercent: clamp(exits.trailingStopPercent + 4, 12, 30),
      timeStopMinutes,
      timeStopMinReturnPercent: Math.max(exits.timeStopMinReturnPercent + 3, 8),
      timeLimitMinutes,
    }, context);
  }

  if (entryScore >= 0.62) {
    return applyExitContext({
      profile: "balanced",
      stopLossPercent: exits.stopLossPercent,
      tp1Multiplier: exits.tp1Multiplier,
      tp2Multiplier: exits.tp2Multiplier,
      tp1SellFraction: exits.tp1SellFraction,
      tp2SellFraction: exits.tp2SellFraction,
      postTp1RetracePercent: exits.postTp1RetracePercent,
      trailingStopPercent: exits.trailingStopPercent,
      timeStopMinutes: exits.timeStopMinutes,
      timeStopMinReturnPercent: exits.timeStopMinReturnPercent,
      timeLimitMinutes: exits.timeLimitMinutes,
    }, context);
  }

  const timeStopMinutes = scaleMinutes(exits.timeStopMinutes, 0.8, 1.5, exits.timeStopMinutes);
  const timeLimitMinutes = ensureTimeLimit(
    scaleMinutes(exits.timeLimitMinutes, 0.75, Math.max(exits.timeStopMinutes + 1, 3), exits.timeLimitMinutes),
    timeStopMinutes,
  );
  return applyExitContext({
    profile: "scalp",
    stopLossPercent: clamp(exits.stopLossPercent * 0.8, 10, 25),
    tp1Multiplier: Math.max(exits.tp1Multiplier - 0.1, 1.28),
    tp2Multiplier: Math.max(exits.tp2Multiplier - 0.3, exits.tp1Multiplier + 0.25),
    tp1SellFraction: clamp(exits.tp1SellFraction + 0.15, 0.45, 0.75),
    tp2SellFraction: clamp(exits.tp2SellFraction - 0.1, 0.1, 0.3),
    postTp1RetracePercent: clamp(exits.postTp1RetracePercent - 5, 8, 18),
    trailingStopPercent: clamp(exits.trailingStopPercent - 8, 10, 20),
    timeStopMinutes,
    timeStopMinReturnPercent: Math.max(exits.timeStopMinReturnPercent - 2, 2),
    timeLimitMinutes,
  }, context);
}

export function readExitPlan(
  metadata: unknown,
  fallback: RuntimeExitPlan,
): RuntimeExitPlan {
  const record = asRecord(metadata);
  const exitPlan = asRecord(record?.exitPlan);

  return {
    tp1SellFraction: asNumber(exitPlan?.tp1SellFraction) ?? fallback.tp1SellFraction,
    tp2SellFraction: asNumber(exitPlan?.tp2SellFraction) ?? fallback.tp2SellFraction,
    postTp1RetracePercent: asNumber(exitPlan?.postTp1RetracePercent) ?? fallback.postTp1RetracePercent,
    trailingStopPercent: asNumber(exitPlan?.trailingStopPercent) ?? fallback.trailingStopPercent,
    timeStopMinutes: asNumber(exitPlan?.timeStopMinutes) ?? fallback.timeStopMinutes,
    timeStopMinReturnPercent: asNumber(exitPlan?.timeStopMinReturnPercent) ?? fallback.timeStopMinReturnPercent,
    timeLimitMinutes: asNumber(exitPlan?.timeLimitMinutes) ?? fallback.timeLimitMinutes,
  };
}

export function getExitDecision(
  position: ManagedExitPosition,
  priceUsd: number,
  fallback: RuntimeExitPlan,
  now = new Date(),
): ExitDecision | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return null;
  }

  const peakPriceUsd = Math.max(position.peakPriceUsd, priceUsd);
  const pnlPercent = ((priceUsd - position.entryPriceUsd) / position.entryPriceUsd) * 100;
  const ageMinutes = (now.getTime() - position.openedAt.getTime()) / 60_000;
  const exitPlan = readExitPlan(position.metadata, fallback);

  if (!position.tp1Done && priceUsd <= position.stopLossPriceUsd) {
    return { reason: "stop_loss", peakPriceUsd };
  }

  if (!position.tp1Done && priceUsd >= position.takeProfit1PriceUsd) {
    return {
      reason: "take_profit_1",
      fraction: exitPlan.tp1SellFraction,
      peakPriceUsd,
    };
  }

  if (position.tp1Done && !position.tp2Done && priceUsd >= position.takeProfit2PriceUsd) {
    return {
      reason: "take_profit_2",
      fraction: exitPlan.tp2SellFraction,
      peakPriceUsd,
    };
  }

  if (position.tp1Done && !position.tp2Done) {
    const retraceFloor = peakPriceUsd * (1 - exitPlan.postTp1RetracePercent / 100);
    if (priceUsd <= retraceFloor) {
      return { reason: "post_tp1_retrace", peakPriceUsd };
    }
  }

  if (position.tp2Done) {
    const trailingFloor = peakPriceUsd * (1 - exitPlan.trailingStopPercent / 100);
    if (priceUsd <= trailingFloor) {
      return { reason: "trailing_stop", peakPriceUsd };
    }
  }

  if (ageMinutes >= exitPlan.timeStopMinutes && pnlPercent < exitPlan.timeStopMinReturnPercent) {
    return { reason: "time_stop", peakPriceUsd };
  }

  if (ageMinutes >= exitPlan.timeLimitMinutes) {
    return { reason: "time_limit", peakPriceUsd };
  }

  return null;
}

function scaleMinutes(value: number, multiplier: number, min: number, max: number): number {
  return clamp(Math.round(value * multiplier * 10) / 10, min, max);
}

function ensureTimeLimit(value: number, timeStopMinutes: number): number {
  return Math.max(value, Math.round((timeStopMinutes + 1) * 10) / 10);
}

function applyExitContext(plan: ExitPlan, context?: ExitPlanContext): ExitPlan {
  if (!context) {
    return plan;
  }

  let fragility = 0;
  const age = context.timeSinceGraduationMin;
  if (typeof age === "number") {
    if (age <= 5) {
      fragility += 0.18;
    } else if (age <= 15) {
      fragility += 0.12;
    } else if (age <= 30) {
      fragility += 0.08;
    }
  }

  const marketCapUsd = context.marketCapUsd ?? null;
  if (typeof marketCapUsd === "number") {
    if (marketCapUsd < 250_000) {
      fragility += 0.18;
    } else if (marketCapUsd < 600_000) {
      fragility += 0.1;
    } else if (marketCapUsd > 4_000_000) {
      fragility -= 0.04;
    }
  }

  const socialCount = context.socialCount ?? 0;
  if (socialCount === 0) {
    fragility += 0.08;
  } else if (socialCount >= 2) {
    fragility -= 0.05;
  }

  if ((context.top10HolderPercent ?? 0) >= 42) {
    fragility += 0.08;
  } else if ((context.top10HolderPercent ?? 0) <= 26) {
    fragility -= 0.03;
  }

  if ((context.largestHolderPercent ?? 0) >= 21) {
    fragility += 0.06;
  } else if ((context.largestHolderPercent ?? 0) <= 11) {
    fragility -= 0.03;
  }

  const rugScore = context.rugScoreNormalized ?? null;
  if (typeof rugScore === "number") {
    if (rugScore >= 70) {
      fragility += 0.14;
    } else if (rugScore >= 55) {
      fragility += 0.08;
    } else if (rugScore <= 30) {
      fragility -= 0.04;
    }
  }

  if ((context.lpLockedPercent ?? 0) >= 90) {
    fragility -= 0.03;
  }

  fragility += Math.min(context.softIssueCount ?? 0, 3) * 0.04;
  fragility = clamp(fragility, -0.12, 0.42);

  const tp1Multiplier = clamp(plan.tp1Multiplier - (fragility * 0.16), 1.2, 2.1);
  const tp2Multiplier = clamp(
    Math.max(plan.tp2Multiplier - (fragility * 0.3), tp1Multiplier + 0.18),
    tp1Multiplier + 0.18,
    3.2,
  );
  const timeStopMinutes = clamp(Math.round(plan.timeStopMinutes * (1 - fragility * 0.55) * 10) / 10, 1.5, 18);
  const timeLimitMinutes = ensureTimeLimit(
    clamp(Math.round(plan.timeLimitMinutes * (1 - fragility * 0.62) * 10) / 10, 3, 32),
    timeStopMinutes,
  );

  return {
    ...plan,
    stopLossPercent: clamp(plan.stopLossPercent - (fragility * 2.8), 8, 24),
    tp1Multiplier,
    tp2Multiplier,
    tp1SellFraction: clamp(plan.tp1SellFraction + (fragility * 0.22), 0.22, 0.82),
    tp2SellFraction: clamp(plan.tp2SellFraction - (fragility * 0.12), 0.08, 0.35),
    postTp1RetracePercent: clamp(plan.postTp1RetracePercent - (fragility * 6), 5, 18),
    trailingStopPercent: clamp(plan.trailingStopPercent - (fragility * 7), 7, 22),
    timeStopMinutes,
    timeStopMinReturnPercent: clamp(plan.timeStopMinReturnPercent + (fragility * 4), 1, 14),
    timeLimitMinutes,
  };
}
