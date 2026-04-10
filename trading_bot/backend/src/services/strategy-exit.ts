import type { BotSettings } from "../types/domain.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

export function buildExitPlan(settings: BotSettings, entryScore: number): ExitPlan {
  if (entryScore >= 0.82) {
    return {
      profile: "runner",
      stopLossPercent: clamp(settings.exits.stopLossPercent * 1.05, 12, 35),
      tp1Multiplier: Math.max(settings.exits.tp1Multiplier + 0.15, 1.55),
      tp2Multiplier: Math.max(settings.exits.tp2Multiplier + 0.4, 2.6),
      tp1SellFraction: 0.25,
      tp2SellFraction: 0.25,
      postTp1RetracePercent: clamp(settings.exits.postTp1RetracePercent + 3, 10, 25),
      trailingStopPercent: clamp(settings.exits.trailingStopPercent + 4, 12, 30),
      timeStopMinutes: Math.max(settings.exits.timeStopMinutes + 10, 30),
      timeStopMinReturnPercent: Math.max(settings.exits.timeStopMinReturnPercent + 3, 8),
      timeLimitMinutes: Math.max(settings.exits.timeLimitMinutes + 15, 60),
    };
  }

  if (entryScore >= 0.62) {
    return {
      profile: "balanced",
      stopLossPercent: settings.exits.stopLossPercent,
      tp1Multiplier: settings.exits.tp1Multiplier,
      tp2Multiplier: settings.exits.tp2Multiplier,
      tp1SellFraction: settings.exits.tp1SellFraction,
      tp2SellFraction: settings.exits.tp2SellFraction,
      postTp1RetracePercent: settings.exits.postTp1RetracePercent,
      trailingStopPercent: settings.exits.trailingStopPercent,
      timeStopMinutes: settings.exits.timeStopMinutes,
      timeStopMinReturnPercent: settings.exits.timeStopMinReturnPercent,
      timeLimitMinutes: settings.exits.timeLimitMinutes,
    };
  }

  return {
    profile: "scalp",
    stopLossPercent: clamp(settings.exits.stopLossPercent * 0.8, 10, 25),
    tp1Multiplier: Math.max(settings.exits.tp1Multiplier - 0.1, 1.28),
    tp2Multiplier: Math.max(settings.exits.tp2Multiplier - 0.3, 1.8),
    tp1SellFraction: 0.6,
    tp2SellFraction: 0.2,
    postTp1RetracePercent: clamp(settings.exits.postTp1RetracePercent - 5, 8, 18),
    trailingStopPercent: clamp(settings.exits.trailingStopPercent - 8, 10, 20),
    timeStopMinutes: Math.max(settings.exits.timeStopMinutes - 8, 10),
    timeStopMinReturnPercent: Math.max(settings.exits.timeStopMinReturnPercent - 2, 2),
    timeLimitMinutes: Math.max(settings.exits.timeLimitMinutes - 15, 25),
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
