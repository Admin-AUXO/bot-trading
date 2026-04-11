import type { BotSettings } from "../types/domain.js";
import { getStrategyPreset } from "./strategy-presets.js";

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

export function buildExitPlan(
  settings: BotSettings,
  entryScore: number,
  strategyPresetId = settings.strategy.livePresetId,
): ExitPlan {
  const preset = getStrategyPreset(strategyPresetId);
  const exits = {
    ...settings.exits,
    ...preset.exitOverrides,
  };

  if (entryScore >= 0.82) {
    const timeStopMinutes = scaleMinutes(exits.timeStopMinutes, 1.7, exits.timeStopMinutes + 1, 60);
    const timeLimitMinutes = ensureTimeLimit(
      scaleMinutes(exits.timeLimitMinutes, 1.6, exits.timeLimitMinutes + 2, 90),
      timeStopMinutes,
    );
    return {
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
    };
  }

  if (entryScore >= 0.62) {
    return {
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
    };
  }

  const timeStopMinutes = scaleMinutes(exits.timeStopMinutes, 0.8, 1.5, exits.timeStopMinutes);
  const timeLimitMinutes = ensureTimeLimit(
    scaleMinutes(exits.timeLimitMinutes, 0.75, Math.max(exits.timeStopMinutes + 1, 3), exits.timeLimitMinutes),
    timeStopMinutes,
  );
  return {
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

function scaleMinutes(value: number, multiplier: number, min: number, max: number): number {
  return clamp(Math.round(value * multiplier * 10) / 10, min, max);
}

function ensureTimeLimit(value: number, timeStopMinutes: number): number {
  return Math.max(value, Math.round((timeStopMinutes + 1) * 10) / 10);
}
