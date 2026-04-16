import type { BotSettings, StrategyPresetId } from "../types/domain.js";
import { clamp } from "../utils/types.js";
import { buildSignalConfidence, deriveExitProfile } from "./entry-scoring.js";
import { buildExitPlan, type ExitPlanContext } from "./strategy-exit.js";

export type TradeSetup = {
  presetId: StrategyPresetId;
  entryScore: number;
  confidenceScore: number;
  playScore: number | null;
  winnerScore: number | null;
  profile: ReturnType<typeof deriveExitProfile>;
  suggestedCapitalUsd: number;
  entryPriceUsd: number | null;
  stopLossPercent: number;
  stopLossPriceUsd: number | null;
  tp1Percent: number;
  tp1PriceUsd: number | null;
  tp1SellFractionPercent: number;
  tp2Percent: number;
  tp2PriceUsd: number | null;
  tp2SellFractionPercent: number;
  postTp1RetracePercent: number;
  trailingStopPercent: number;
  timeStopMinutes: number;
  timeStopMinReturnPercent: number;
  timeLimitMinutes: number;
};

export type TradeSetupMarketContext = ExitPlanContext;

export function calculatePlannedPositionSizeUsd(input: {
  settings: BotSettings;
  cashUsd: number;
  openPositions: number;
  entryScore: number;
  confidenceScore?: number | null;
  applyLiveStrategyModifier?: boolean;
  marketContext?: TradeSetupMarketContext;
}): number {
  const { settings, cashUsd, openPositions } = input;
  if (cashUsd <= 0) {
    return 0;
  }

  const baseSizeUsd = settings.capital.positionSizeUsd;
  const maxOpenPositions = Math.max(settings.capital.maxOpenPositions, 1);
  const remainingSlots = Math.max(maxOpenPositions - openPositions, 1);
  const entryScore = clamp(input.entryScore, 0, 1);
  const confidenceScore = clamp(input.confidenceScore ?? entryScore, 0, 1);
  const blendedScore = clamp((entryScore * 0.7) + (confidenceScore * 0.3), 0, 1);
  const minimumTicketUsd = Math.min(cashUsd, Math.max(10, Math.min(baseSizeUsd * 0.6, 15)));
  const standardCapUsd = Math.min(cashUsd, Math.min(baseSizeUsd, cashUsd / remainingSlots));
  const exposureScale = openPositions === 0
    ? 1
    : openPositions === 1
      ? 0.94
      : 0.82;

  let plannedSizeUsd = minimumTicketUsd + Math.max(standardCapUsd - minimumTicketUsd, 0) * blendedScore;
  plannedSizeUsd *= exposureScale;

  if (blendedScore >= 0.88 && openPositions <= 1) {
    const boostedCapUsd = Math.min(
      cashUsd,
      Math.max(baseSizeUsd + 5, baseSizeUsd * 1.2),
    );
    const boostProgress = clamp((blendedScore - 0.88) / 0.12, 0, 1);
    plannedSizeUsd = Math.max(
      plannedSizeUsd,
      standardCapUsd + Math.max(boostedCapUsd - standardCapUsd, 0) * boostProgress,
    );
  }

  if (input.applyLiveStrategyModifier && settings.tradeMode === "LIVE" && settings.strategy.liveStrategy.enabled) {
    plannedSizeUsd *= settings.strategy.liveStrategy.capitalModifierPercent / 100;
  }

  const context = input.marketContext;
  if (context) {
    let contextModifier = 1;
    const age = context.timeSinceGraduationMin ?? null;
    if (typeof age === "number") {
      if (age <= 5) {
        contextModifier *= 0.78;
      } else if (age <= 15) {
        contextModifier *= 0.84;
      } else if (age <= 30) {
        contextModifier *= 0.9;
      }
    }

    const marketCapUsd = context.marketCapUsd ?? null;
    if (typeof marketCapUsd === "number") {
      if (marketCapUsd < 250_000) {
        contextModifier *= 0.82;
      } else if (marketCapUsd < 600_000) {
        contextModifier *= 0.9;
      } else if (marketCapUsd > 4_000_000) {
        contextModifier *= 0.96;
      }
    }

    const socialCount = context.socialCount ?? 0;
    if (socialCount === 0) {
      contextModifier *= 0.9;
    } else if (socialCount >= 2) {
      contextModifier *= 1.06;
    }

    if ((context.top10HolderPercent ?? 0) >= 40) {
      contextModifier *= 0.9;
    }
    if ((context.largestHolderPercent ?? 0) >= 20) {
      contextModifier *= 0.94;
    }

    const rugScore = context.rugScoreNormalized ?? null;
    if (typeof rugScore === "number") {
      if (rugScore >= 70) {
        contextModifier *= 0.82;
      } else if (rugScore >= 55) {
        contextModifier *= 0.9;
      } else if (rugScore <= 30) {
        contextModifier *= 1.03;
      }
    }

    if ((context.lpLockedPercent ?? 0) >= 90) {
      contextModifier *= 1.02;
    }

    contextModifier *= 1 - Math.min(context.softIssueCount ?? 0, 3) * 0.05;
    plannedSizeUsd *= clamp(contextModifier, 0.55, 1.12);
  }

  const floorUsd = Math.min(cashUsd, openPositions >= maxOpenPositions - 1 ? 10 : minimumTicketUsd);
  return roundUsd(clamp(plannedSizeUsd, floorUsd, cashUsd));
}

export function buildTradeSetup(input: {
  settings: BotSettings;
  cashUsd: number;
  openPositions: number;
  entryPriceUsd: number | null;
  entryScore: number;
  presetId: StrategyPresetId;
  playScore?: number | null;
  winnerScore?: number | null;
  marketContext?: TradeSetupMarketContext;
}): TradeSetup {
  const confidenceScore = buildSignalConfidence({
    entryScore: input.entryScore,
    playScore: input.playScore,
    winnerScore: input.winnerScore,
  });
  const exitPlan = buildExitPlan(input.settings, confidenceScore, input.presetId, input.marketContext);
  const suggestedCapitalUsd = calculatePlannedPositionSizeUsd({
    settings: input.settings,
    cashUsd: input.cashUsd,
    openPositions: input.openPositions,
    entryScore: input.entryScore,
    confidenceScore,
    applyLiveStrategyModifier: false,
    marketContext: input.marketContext,
  });

  return {
    presetId: input.presetId,
    entryScore: roundUsd(input.entryScore),
    confidenceScore,
    playScore: input.playScore ?? null,
    winnerScore: input.winnerScore ?? null,
    profile: deriveExitProfile(confidenceScore),
    suggestedCapitalUsd,
    entryPriceUsd: input.entryPriceUsd,
    stopLossPercent: exitPlan.stopLossPercent,
    stopLossPriceUsd: input.entryPriceUsd != null ? input.entryPriceUsd * (1 - exitPlan.stopLossPercent / 100) : null,
    tp1Percent: (exitPlan.tp1Multiplier - 1) * 100,
    tp1PriceUsd: input.entryPriceUsd != null ? input.entryPriceUsd * exitPlan.tp1Multiplier : null,
    tp1SellFractionPercent: exitPlan.tp1SellFraction * 100,
    tp2Percent: (exitPlan.tp2Multiplier - 1) * 100,
    tp2PriceUsd: input.entryPriceUsd != null ? input.entryPriceUsd * exitPlan.tp2Multiplier : null,
    tp2SellFractionPercent: exitPlan.tp2SellFraction * 100,
    postTp1RetracePercent: exitPlan.postTp1RetracePercent,
    trailingStopPercent: exitPlan.trailingStopPercent,
    timeStopMinutes: exitPlan.timeStopMinutes,
    timeStopMinReturnPercent: exitPlan.timeStopMinReturnPercent,
    timeLimitMinutes: exitPlan.timeLimitMinutes,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
