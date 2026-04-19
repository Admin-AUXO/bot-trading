import type { BotSettings } from "../types/domain.js";
import { applyStrategySettings } from "./strategy-presets.js";
import { asRecord, asNumber, asBoolean, clamp } from "../utils/types.js";

export const ATR_PERIOD = 20;

export function computeAtrFromPrices(prices: number[]): number {
  if (prices.length < 2) return 0;
  const n = Math.min(prices.length, ATR_PERIOD + 1);
  const recent = prices.slice(-n);
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const tr = Math.abs(recent[i] - recent[i - 1]);
    trSum += tr;
  }
  return trSum / Math.max(recent.length - 1, 1);
}

export const SL_ATR_MULTIPLIER = 1.5;

export const RETRACE_ATR_MULTIPLIER = 1.5;

export const VTS_ATR_MULTIPLIER = 2.0;

export const FAIR_VALUE_ENTRY_PREMIUM_CAP = 0.05;

export const RUNNER_ENTRY_PREMIUM_CAP = 0.07;

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
  partialStopLossEnabled: boolean;
  partialSlThresholdPercent: number;
  partialSlSellFraction: number;
  momentumTpExtensionEnabled: boolean;
  recalibrateIntervalMinutes: number;
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

export type LiveExitContext = {
  volume5mUsd?: number | null;
  buySellRatio?: number | null;
  atrUsd?: number | null;
  volume5mAtEntry?: number | null;
  recalibratedContext?: ExitPlanContext;
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
  | "partialStopLossEnabled"
  | "partialSlThresholdPercent"
  | "partialSlSellFraction"
  | "momentumTpExtensionEnabled"
  | "recalibrateIntervalMinutes"
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
  exitPlan?: unknown;
};

type PersistedExitPlanRecord = Partial<ExitPlan> & {
  profile?: string | null;
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
      scaleMinutes(exits.timeLimitMinutes, 1.6, exits.timeStopMinutes + 2, 90),
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
      partialStopLossEnabled: true,
      partialSlThresholdPercent: 8,
      partialSlSellFraction: 0.5,
      momentumTpExtensionEnabled: true,
      recalibrateIntervalMinutes: 5,
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
      partialStopLossEnabled: true,
      partialSlThresholdPercent: 10,
      partialSlSellFraction: 0.5,
      momentumTpExtensionEnabled: true,
      recalibrateIntervalMinutes: 5,
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
    partialStopLossEnabled: false,
    partialSlThresholdPercent: 8,
    partialSlSellFraction: 0.5,
    momentumTpExtensionEnabled: false,
    recalibrateIntervalMinutes: 0,
  }, context);
}

export function readExitPlan(
  metadata: unknown,
  fallback: RuntimeExitPlan,
  persisted?: PersistedExitPlanRecord | null,
): RuntimeExitPlan {
  const storedPlan = readPersistedExitPlan(persisted);
  if (storedPlan) {
    return {
      tp1SellFraction: storedPlan.tp1SellFraction,
      tp2SellFraction: storedPlan.tp2SellFraction,
      postTp1RetracePercent: storedPlan.postTp1RetracePercent,
      trailingStopPercent: storedPlan.trailingStopPercent,
      timeStopMinutes: storedPlan.timeStopMinutes,
      timeStopMinReturnPercent: storedPlan.timeStopMinReturnPercent,
      timeLimitMinutes: storedPlan.timeLimitMinutes,
      partialStopLossEnabled: storedPlan.partialStopLossEnabled,
      partialSlThresholdPercent: storedPlan.partialSlThresholdPercent,
      partialSlSellFraction: storedPlan.partialSlSellFraction,
      momentumTpExtensionEnabled: storedPlan.momentumTpExtensionEnabled,
      recalibrateIntervalMinutes: storedPlan.recalibrateIntervalMinutes,
    };
  }

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
    partialStopLossEnabled: asBoolean(exitPlan?.partialStopLossEnabled) ?? fallback.partialStopLossEnabled ?? true,
    partialSlThresholdPercent: asNumber(exitPlan?.partialSlThresholdPercent) ?? fallback.partialSlThresholdPercent ?? 10,
    partialSlSellFraction: asNumber(exitPlan?.partialSlSellFraction) ?? fallback.partialSlSellFraction ?? 0.5,
    momentumTpExtensionEnabled: asBoolean(exitPlan?.momentumTpExtensionEnabled) ?? fallback.momentumTpExtensionEnabled ?? false,
    recalibrateIntervalMinutes: asNumber(exitPlan?.recalibrateIntervalMinutes) ?? fallback.recalibrateIntervalMinutes ?? 0,
  };
}

function readPersistedExitPlan(
  persisted: PersistedExitPlanRecord | null | undefined,
): ExitPlan | null {
  if (!persisted) {
    return null;
  }

  const profile = persisted.profile;
  if (profile !== "scalp" && profile !== "balanced" && profile !== "runner") {
    return null;
  }

  const fields = [
    "stopLossPercent",
    "tp1Multiplier",
    "tp2Multiplier",
    "tp1SellFraction",
    "tp2SellFraction",
    "postTp1RetracePercent",
    "trailingStopPercent",
    "timeStopMinutes",
    "timeStopMinReturnPercent",
    "timeLimitMinutes",
    "partialSlThresholdPercent",
    "partialSlSellFraction",
    "recalibrateIntervalMinutes",
  ] as const;

  for (const field of fields) {
    if (typeof persisted[field] !== "number") {
      return null;
    }
  }
  if (
    typeof persisted.partialStopLossEnabled !== "boolean"
    || typeof persisted.momentumTpExtensionEnabled !== "boolean"
  ) {
    return null;
  }

  return {
    profile,
    stopLossPercent: persisted.stopLossPercent,
    tp1Multiplier: persisted.tp1Multiplier,
    tp2Multiplier: persisted.tp2Multiplier,
    tp1SellFraction: persisted.tp1SellFraction,
    tp2SellFraction: persisted.tp2SellFraction,
    postTp1RetracePercent: persisted.postTp1RetracePercent,
    trailingStopPercent: persisted.trailingStopPercent,
    timeStopMinutes: persisted.timeStopMinutes,
    timeStopMinReturnPercent: persisted.timeStopMinReturnPercent,
    timeLimitMinutes: persisted.timeLimitMinutes,
    partialStopLossEnabled: persisted.partialStopLossEnabled,
    partialSlThresholdPercent: persisted.partialSlThresholdPercent,
    partialSlSellFraction: persisted.partialSlSellFraction,
    momentumTpExtensionEnabled: persisted.momentumTpExtensionEnabled,
    recalibrateIntervalMinutes: persisted.recalibrateIntervalMinutes,
  };
}

function getDynamicTpMultiplier(
  currentTp: number,
  priceUsd: number,
  entryPriceUsd: number,
  volume5mNow: number,
  volume5mAtEntry: number,
  buySellRatioNow: number,
  profile: ExitProfile,
): number {
  const distanceToTp = ((currentTp * entryPriceUsd) - priceUsd) / priceUsd;

  if (distanceToTp > 0.05) return currentTp;

  const volumeAccelerating = volume5mNow > volume5mAtEntry * 1.2;
  const strongBuyPressure = buySellRatioNow > 1.5;
  if (!volumeAccelerating || !strongBuyPressure) return currentTp;

  const extension = profile === "runner" ? 0.18
    : profile === "balanced" ? 0.12
    : 0.04;

  return currentTp + extension;
}

export function getExitDecision(
  position: ManagedExitPosition,
  priceUsd: number,
  fallback: RuntimeExitPlan,
  liveContext?: LiveExitContext,
  now = new Date(),
): ExitDecision | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const exitPlan = readExitPlan(position.metadata, fallback, position.exitPlan);
  const peakPriceUsd = Math.max(position.peakPriceUsd, priceUsd);
  const pnlPercent = ((priceUsd - position.entryPriceUsd) / position.entryPriceUsd) * 100;
  const ageMinutes = (now.getTime() - position.openedAt.getTime()) / 60_000;
  const atr = liveContext?.atrUsd ?? 0;

  const profile = (readPersistedExitPlan(position.exitPlan)?.profile)
    ?? (asRecord(position.metadata)?.exitProfile as ExitProfile)
    ?? "balanced";

  let effectiveTp1Multiplier = peakPriceUsd > 0
    ? (position.takeProfit1PriceUsd / position.entryPriceUsd)
    : 1.5;
  let effectiveTp2Multiplier = peakPriceUsd > 0
    ? (position.takeProfit2PriceUsd / position.entryPriceUsd)
    : 2.2;
  let effectiveStopLossPercent = exitPlan.timeStopMinutes > 0
    ? (1 - (position.stopLossPriceUsd / position.entryPriceUsd)) * 100
    : 20;

  if (
    exitPlan.recalibrateIntervalMinutes > 0
    && liveContext?.recalibratedContext
  ) {
    const recalibrated = applyExitContext(
      {
        profile,
        stopLossPercent: effectiveStopLossPercent,
        tp1Multiplier: effectiveTp1Multiplier,
        tp2Multiplier: effectiveTp2Multiplier,
        tp1SellFraction: exitPlan.tp1SellFraction,
        tp2SellFraction: exitPlan.tp2SellFraction,
        postTp1RetracePercent: 15,
        trailingStopPercent: 20,
        timeStopMinutes: 20,
        timeStopMinReturnPercent: 5,
        timeLimitMinutes: 45,
        partialStopLossEnabled: exitPlan.partialStopLossEnabled,
        partialSlThresholdPercent: exitPlan.partialSlThresholdPercent,
        partialSlSellFraction: exitPlan.partialSlSellFraction,
        momentumTpExtensionEnabled: exitPlan.momentumTpExtensionEnabled,
        recalibrateIntervalMinutes: exitPlan.recalibrateIntervalMinutes,
      },
      liveContext.recalibratedContext,
    );
    effectiveTp1Multiplier = recalibrated.tp1Multiplier;
    effectiveTp2Multiplier = recalibrated.tp2Multiplier;
    effectiveStopLossPercent = recalibrated.stopLossPercent;
  }

  const effectiveTp1Price = position.entryPriceUsd * effectiveTp1Multiplier;
  const effectiveTp2Price = position.entryPriceUsd * effectiveTp2Multiplier;
  const effectiveSlPrice = position.entryPriceUsd * (1 - effectiveStopLossPercent / 100);

  const atrAdjustedSl = atr > 0
    ? position.entryPriceUsd - (atr * SL_ATR_MULTIPLIER)
    : 0;
  const staticStopDistance = position.entryPriceUsd - effectiveSlPrice;
  const maxAtrAdjustment = staticStopDistance * 3;
  const cappedAtrAdjustedSl = atr > 0
    ? Math.max(position.entryPriceUsd - maxAtrAdjustment, atrAdjustedSl)
    : 0;
  const effectiveStop = Math.max(cappedAtrAdjustedSl, effectiveSlPrice);

  if (!position.tp1Done && priceUsd <= effectiveStop) {
    if (
      exitPlan.partialStopLossEnabled
      && pnlPercent > -(exitPlan.partialSlThresholdPercent)
    ) {
      return {
        reason: "partial_stop_loss",
        fraction: exitPlan.partialSlSellFraction,
        peakPriceUsd,
      };
    }
    return { reason: "stop_loss", peakPriceUsd };
  }

  let finalTp1Price = effectiveTp1Price;
  if (
    exitPlan.momentumTpExtensionEnabled
    && !position.tp1Done
  ) {
    const volumeNow = liveContext?.volume5mUsd ?? 0;
    const volumeEntry = liveContext?.volume5mAtEntry ?? volumeNow;
    const bsr = liveContext?.buySellRatio ?? 1;

    const dynamicTp1 = getDynamicTpMultiplier(
      effectiveTp1Multiplier,
      priceUsd,
      position.entryPriceUsd,
      volumeNow,
      volumeEntry,
      bsr,
      profile,
    );
    finalTp1Price = position.entryPriceUsd * dynamicTp1;
  }

  if (!position.tp1Done && priceUsd >= finalTp1Price) {
    const entryRatePerMin = pnlPercent / Math.max(ageMinutes, 0.5);
    const volumeNow = liveContext?.volume5mUsd ?? 0;
    const volumeEntry = liveContext?.volume5mAtEntry ?? volumeNow;
    const bsr = liveContext?.buySellRatio ?? 1;
    const volumeRising = volumeNow > volumeEntry * 1.2;
    const strongBuyPressure = bsr > 1.5;

    const fastApproach = entryRatePerMin > 3;
    const slowWeak = entryRatePerMin < 1 && !strongBuyPressure;

    let tp1Fraction = exitPlan.tp1SellFraction;
    if (fastApproach && strongBuyPressure) {
      tp1Fraction = clamp(tp1Fraction * 0.6, 0.15, 0.45);
    } else if (slowWeak) {
      tp1Fraction = clamp(tp1Fraction * 1.4, 0.45, 0.75);
    } else if (volumeRising && strongBuyPressure) {
      tp1Fraction = clamp(tp1Fraction * 0.75, 0.2, 0.5);
    }

    return { reason: "take_profit_1", fraction: tp1Fraction, peakPriceUsd };
  }

  let finalTp2Price = effectiveTp2Price;
  if (
    exitPlan.momentumTpExtensionEnabled
    && position.tp1Done
    && !position.tp2Done
  ) {
    const volumeNow = liveContext?.volume5mUsd ?? 0;
    const volumeEntry = liveContext?.volume5mAtEntry ?? volumeNow;
    const bsr = liveContext?.buySellRatio ?? 1;

    const extension = profile === "runner" ? 0.12 : profile === "balanced" ? 0.08 : 0.03;
    const dynamicTp2 = getDynamicTpMultiplier(
      effectiveTp2Multiplier,
      priceUsd,
      position.entryPriceUsd,
      volumeNow,
      volumeEntry,
      bsr,
      profile,
    );
    finalTp2Price = position.entryPriceUsd * dynamicTp2;
  }

  if (position.tp1Done && !position.tp2Done && priceUsd >= finalTp2Price) {
    const bsr = liveContext?.buySellRatio ?? 1;
    const strongBuyPressure = bsr > 1.5;

    const tp2Fraction = strongBuyPressure
      ? clamp(exitPlan.tp2SellFraction * 0.7, 0.1, 0.3)
      : exitPlan.tp2SellFraction;

    return { reason: "take_profit_2", fraction: tp2Fraction, peakPriceUsd };
  }

  if (position.tp1Done && !position.tp2Done) {
    const staticRetraceFloor = peakPriceUsd * (1 - exitPlan.postTp1RetracePercent / 100);
    const atrRetraceFloor = atr > 0
      ? peakPriceUsd - (atr * RETRACE_ATR_MULTIPLIER)
      : 0;
    const effectiveRetraceFloor = Math.max(atrRetraceFloor, staticRetraceFloor);

    if (priceUsd <= effectiveRetraceFloor) {
      return { reason: "post_tp1_retrace", peakPriceUsd };
    }
  }

  if (position.tp2Done) {
    const staticVtsFloor = peakPriceUsd * (1 - exitPlan.trailingStopPercent / 100);
    const atrVtsFloor = atr > 0
      ? peakPriceUsd - (atr * VTS_ATR_MULTIPLIER)
      : 0;
    const effectiveVtsFloor = Math.max(atrVtsFloor, staticVtsFloor);

    if (priceUsd <= effectiveVtsFloor) {
      return { reason: "trailing_stop", peakPriceUsd };
    }
  }

  if (ageMinutes >= exitPlan.timeStopMinutes && pnlPercent < exitPlan.timeStopMinReturnPercent) {
    const volumeNow = liveContext?.volume5mUsd ?? 0;
    const volumeEntry = liveContext?.volume5mAtEntry ?? volumeNow;
    const bsr = liveContext?.buySellRatio ?? 1;
    const strongMomentum = pnlPercent > 10 && bsr > 1.5 && volumeNow > volumeEntry;

    if (strongMomentum && ageMinutes < exitPlan.timeStopMinutes + 3) {
      return null;
    }
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
  if (!context) return plan;

  let fragility = 0;
  const age = context.timeSinceGraduationMin;
  if (typeof age === "number") {
    if (age <= 5)      fragility += 0.18;
    else if (age <= 15) fragility += 0.12;
    else if (age <= 30) fragility += 0.08;
  }

  const marketCapUsd = context.marketCapUsd ?? null;
  if (typeof marketCapUsd === "number") {
    if (marketCapUsd < 250_000)      fragility += 0.18;
    else if (marketCapUsd < 600_000) fragility += 0.1;
    else if (marketCapUsd > 4_000_000) fragility -= 0.04;
  }

  const socialCount = context.socialCount ?? 0;
  if (socialCount === 0)           fragility += 0.08;
  else if (socialCount >= 2)      fragility -= 0.05;

  if ((context.top10HolderPercent ?? 0) >= 42)      fragility += 0.08;
  else if ((context.top10HolderPercent ?? 0) <= 26) fragility -= 0.03;

  if ((context.largestHolderPercent ?? 0) >= 21)     fragility += 0.06;
  else if ((context.largestHolderPercent ?? 0) <= 11) fragility -= 0.03;

  const rugScore = context.rugScoreNormalized ?? null;
  if (typeof rugScore === "number") {
    if (rugScore >= 70)      fragility += 0.14;
    else if (rugScore >= 55) fragility += 0.08;
    else if (rugScore <= 30) fragility -= 0.04;
  }

  if ((context.lpLockedPercent ?? 0) >= 90) fragility -= 0.03;

  fragility += Math.min(context.softIssueCount ?? 0, 3) * 0.04;
  fragility = clamp(fragility, -0.12, 0.42);

  const tp1Multiplier = clamp(plan.tp1Multiplier - (fragility * 0.16), 1.2, 2.1);
  const tp2Multiplier = clamp(
    Math.max(plan.tp2Multiplier - (fragility * 0.3), tp1Multiplier + 0.18),
    tp1Multiplier + 0.18,
    3.2,
  );
  const timeStopMinutes = clamp(
    Math.round(plan.timeStopMinutes * (1 - fragility * 0.55) * 10) / 10,
    1.5, 18,
  );
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
