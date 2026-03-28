import { config } from "../config/index.js";
import type { Strategy } from "./types.js";

type WidenLiteral<T> =
  T extends string ? string :
  T extends number ? number :
  T extends boolean ? boolean :
  T extends readonly (infer U)[] ? WidenLiteral<U>[] :
  T extends object ? { -readonly [K in keyof T]: WidenLiteral<T[K]> } :
  T;

export type StrategyConfigMap = {
  S1_COPY: WidenLiteral<typeof config.strategies.s1>;
  S2_GRADUATION: WidenLiteral<typeof config.strategies.s2>;
  S3_MOMENTUM: WidenLiteral<typeof config.strategies.s3>;
};

export interface StrategyExitPlan {
  tp1ThresholdPct: number;
  tp2ThresholdPct: number;
  tp1SizePct: number;
  tp2SizePct: number;
  runnerSizePct: number;
  trailingStopPercent: number;
}

export const defaultStrategyConfigs: StrategyConfigMap = {
  S1_COPY: config.strategies.s1,
  S2_GRADUATION: config.strategies.s2,
  S3_MOMENTUM: config.strategies.s3,
};

export function getStrategyConfig(
  strategy: Strategy,
  strategyConfigs: StrategyConfigMap = defaultStrategyConfigs,
): StrategyConfigMap[Strategy] {
  return strategyConfigs[strategy];
}

export function getConfiguredPositionSize(
  strategy: Strategy,
  strategyConfigs: StrategyConfigMap = defaultStrategyConfigs,
): number {
  return getStrategyConfig(strategy, strategyConfigs).positionSizeSol;
}

export function getStopLossPercent(
  strategy: Strategy,
  strategyConfigs: StrategyConfigMap = defaultStrategyConfigs,
): number {
  return getStrategyConfig(strategy, strategyConfigs).stopLossPercent;
}

export function getMaxSlippageBps(
  strategy: Strategy,
  strategyConfigs: StrategyConfigMap = defaultStrategyConfigs,
): number {
  return getStrategyConfig(strategy, strategyConfigs).maxSlippageBps;
}

export function getTimeLimitMinutes(
  strategy: Strategy,
  strategyConfigs: StrategyConfigMap = defaultStrategyConfigs,
): number {
  const cfg = getStrategyConfig(strategy, strategyConfigs);
  return "timeLimitMinutes" in cfg ? cfg.timeLimitMinutes : cfg.timeStopMinutes;
}

export function getTimeStopMinutes(
  strategy: Strategy,
  strategyConfigs: StrategyConfigMap = defaultStrategyConfigs,
): number {
  return getStrategyConfig(strategy, strategyConfigs).timeStopMinutes;
}

export function getTakeProfitThresholds(
  strategy: Strategy,
  strategyConfigs: StrategyConfigMap = defaultStrategyConfigs,
): { tp1ThresholdPct: number; tp2ThresholdPct: number } {
  if (strategy === "S2_GRADUATION") {
    const cfg = strategyConfigs.S2_GRADUATION;
    return {
      tp1ThresholdPct: (cfg.tp1Multiplier - 1) * 100,
      tp2ThresholdPct: (cfg.tp2Multiplier - 1) * 100,
    };
  }

  const cfg = strategy === "S1_COPY" ? strategyConfigs.S1_COPY : strategyConfigs.S3_MOMENTUM;
  return {
    tp1ThresholdPct: cfg.tp1Percent,
    tp2ThresholdPct: cfg.tp2Percent,
  };
}

export function getTrailingStopPercent(
  strategy: Strategy,
  strategyConfigs: StrategyConfigMap = defaultStrategyConfigs,
): number {
  return getStrategyConfig(strategy, strategyConfigs).trailingStopPercent;
}

export function getExitPlan(
  strategy: Strategy,
  strategyConfigs: StrategyConfigMap = defaultStrategyConfigs,
): StrategyExitPlan {
  const { tp1ThresholdPct, tp2ThresholdPct } = getTakeProfitThresholds(strategy, strategyConfigs);
  const trailingStopPercent = getTrailingStopPercent(strategy, strategyConfigs);
  const fractions =
    strategy === "S1_COPY"
      ? config.exitMonitor.exitFractions.s1
      : strategy === "S2_GRADUATION"
      ? config.exitMonitor.exitFractions.s2
      : config.exitMonitor.exitFractions.s3;

  const tp1SizePct = fractions.tp1 * 100;
  const tp2SizePct = (1 - fractions.tp1) * fractions.tp2 * 100;
  const runnerSizePct = Math.max(0, 100 - tp1SizePct - tp2SizePct);

  return {
    tp1ThresholdPct,
    tp2ThresholdPct,
    tp1SizePct,
    tp2SizePct,
    runnerSizePct,
    trailingStopPercent,
  };
}
