import { config } from "../config/index.js";
import type { ConfigProfileManager } from "./config-profile.js";
import type { CapitalConfig, ExecutionScope, TradeMode } from "../utils/types.js";
import type { StrategyConfigMap } from "../utils/strategy-config.js";

export interface RuntimeState {
  scope: ExecutionScope;
  strategyConfigs: StrategyConfigMap;
  capitalConfig: CapitalConfig;
}

export function resolveRuntimeState(
  manager: ConfigProfileManager,
  mode: TradeMode,
  profileName?: string,
): RuntimeState {
  const activeProfile = profileName
    ? { name: profileName }
    : manager.getActiveProfile(mode);
  const configProfile = activeProfile?.name ?? "default";

  return {
    scope: {
      mode,
      configProfile,
    },
    strategyConfigs: {
      S1_COPY: manager.getStrategyConfig(configProfile, "s1"),
      S2_GRADUATION: manager.getStrategyConfig(configProfile, "s2"),
      S3_MOMENTUM: manager.getStrategyConfig(configProfile, "s3"),
    },
    capitalConfig: manager.getCapitalConfig(configProfile) ?? config.capital,
  };
}
