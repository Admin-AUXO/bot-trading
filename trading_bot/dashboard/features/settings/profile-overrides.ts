import type { ConfigProfile, DashboardProfileSettings, StrategyConfigResponse } from "@/lib/api";
import { formatNumber, formatUsd } from "@/lib/utils";

type StrategyConfigCard = StrategyConfigResponse["strategies"][string];
export type TriStateBoolean = "inherit" | "true" | "false";

export type ProfileOverrideDraft = {
  capitalUsd: string;
  dailyLossPercent: string;
  weeklyLossPercent: string;
  s1: {
    positionSizeSol: string;
    maxSlippageBps: string;
    maxSourceTxAgeSeconds: string;
    requireTradeDataInLive: TriStateBoolean;
  };
  s2: {
    positionSizeSol: string;
    maxSlippageBps: string;
    minUniqueHolders: string;
    maxGraduationAgeAtEntrySeconds: string;
    requireTradeDataInLive: TriStateBoolean;
  };
  s3: {
    positionSizeSol: string;
    maxSlippageBps: string;
  };
};

export function getLiveGuardrailRows(strategy: string, cfg: StrategyConfigCard): Array<{ label: string; value: string; tone?: "neutral" | "safe" | "warn" }> {
  const rows: Array<{ label: string; value: string; tone?: "neutral" | "safe" | "warn" }> = [];

  if (strategy === "S1_COPY" && cfg.maxSourceTxAgeSeconds !== undefined) {
    rows.push({ label: "Source Freshness", value: `<= ${cfg.maxSourceTxAgeSeconds}s`, tone: "warn" });
  }

  if (strategy === "S2_GRADUATION" && cfg.minUniqueHolders !== undefined) {
    rows.push({ label: "Min Holders", value: formatNumber(cfg.minUniqueHolders), tone: "warn" });
  }

  if (strategy === "S2_GRADUATION" && cfg.maxGraduationAgeAtEntrySeconds !== undefined) {
    rows.push({ label: "Grad Age", value: `<= ${cfg.maxGraduationAgeAtEntrySeconds}s`, tone: "warn" });
  }

  if (cfg.requireTradeDataInLive !== undefined) {
    rows.push({
      label: "LIVE Trade Data",
      value: cfg.requireTradeDataInLive ? "Required" : "Optional",
      tone: cfg.requireTradeDataInLive ? "safe" : "warn",
    });
  }

  return rows;
}

export function getProfileOverrideTokens(profile: ConfigProfile): Array<{ label: string; tone: "neutral" | "safe" | "warn" }> {
  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const strategyEntries: Array<[string, string]> = [
    ["s1", "S1"],
    ["s2", "S2"],
    ["s3", "S3"],
  ];
  const tokens: Array<{ label: string; tone: "neutral" | "safe" | "warn" }> = [];

  const pushToken = (label: string, tone: "neutral" | "safe" | "warn" = "neutral") => {
    if (!tokens.some((token) => token.label === label)) {
      tokens.push({ label, tone });
    }
  };

  for (const [strategyKey, prefix] of strategyEntries) {
    const overrides = settings[strategyKey];
    if (!overrides || typeof overrides !== "object") continue;
    const config = overrides as Record<string, unknown>;

    if ("maxSourceTxAgeSeconds" in config && Number.isFinite(Number(config.maxSourceTxAgeSeconds))) {
      pushToken(`${prefix} tx age ${Number(config.maxSourceTxAgeSeconds)}s`);
    }
    if ("maxGraduationAgeAtEntrySeconds" in config && Number.isFinite(Number(config.maxGraduationAgeAtEntrySeconds))) {
      pushToken(`${prefix} grad age ${Number(config.maxGraduationAgeAtEntrySeconds)}s`);
    }
    if ("minUniqueHolders" in config && Number.isFinite(Number(config.minUniqueHolders))) {
      pushToken(`${prefix} holders ${formatNumber(Number(config.minUniqueHolders))}`);
    }
    if ("requireTradeDataInLive" in config && typeof config.requireTradeDataInLive === "boolean") {
      pushToken(
        `${prefix} LIVE trade data ${config.requireTradeDataInLive ? "required" : "soft"}`,
        config.requireTradeDataInLive ? "safe" : "warn",
      );
    }
    if ("maxSlippageBps" in config && Number.isFinite(Number(config.maxSlippageBps))) {
      pushToken(`${prefix} slip ${Number(config.maxSlippageBps)}bps`);
    }
    if ("positionSizeSol" in config && Number.isFinite(Number(config.positionSizeSol))) {
      pushToken(`${prefix} size ${Number(config.positionSizeSol)} SOL`);
    }
  }

  if ("capitalUsd" in settings && Number.isFinite(Number(settings.capitalUsd))) {
    pushToken(`Capital ${formatUsd(Number(settings.capitalUsd))}`);
  }

  return tokens;
}

function readNumberOverride(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function readPercentOverride(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? String(value * 100) : "";
}

function readBooleanOverride(settings: Record<string, unknown>, key: string): TriStateBoolean {
  const value = settings[key];
  return typeof value === "boolean" ? String(value) as TriStateBoolean : "inherit";
}

export function createEmptyProfileOverrideDraft(): ProfileOverrideDraft {
  return {
    capitalUsd: "",
    dailyLossPercent: "",
    weeklyLossPercent: "",
    s1: {
      positionSizeSol: "",
      maxSlippageBps: "",
      maxSourceTxAgeSeconds: "",
      requireTradeDataInLive: "inherit",
    },
    s2: {
      positionSizeSol: "",
      maxSlippageBps: "",
      minUniqueHolders: "",
      maxGraduationAgeAtEntrySeconds: "",
      requireTradeDataInLive: "inherit",
    },
    s3: {
      positionSizeSol: "",
      maxSlippageBps: "",
    },
  };
}

export function createProfileOverrideDraft(profile: ConfigProfile): ProfileOverrideDraft {
  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const s1 = (settings.s1 as Record<string, unknown> | undefined) ?? {};
  const s2 = (settings.s2 as Record<string, unknown> | undefined) ?? {};
  const s3 = (settings.s3 as Record<string, unknown> | undefined) ?? {};

  return {
    capitalUsd: readNumberOverride(settings, "capitalUsd"),
    dailyLossPercent: readPercentOverride(settings, "dailyLossPercent"),
    weeklyLossPercent: readPercentOverride(settings, "weeklyLossPercent"),
    s1: {
      positionSizeSol: readNumberOverride(s1, "positionSizeSol"),
      maxSlippageBps: readNumberOverride(s1, "maxSlippageBps"),
      maxSourceTxAgeSeconds: readNumberOverride(s1, "maxSourceTxAgeSeconds"),
      requireTradeDataInLive: readBooleanOverride(s1, "requireTradeDataInLive"),
    },
    s2: {
      positionSizeSol: readNumberOverride(s2, "positionSizeSol"),
      maxSlippageBps: readNumberOverride(s2, "maxSlippageBps"),
      minUniqueHolders: readNumberOverride(s2, "minUniqueHolders"),
      maxGraduationAgeAtEntrySeconds: readNumberOverride(s2, "maxGraduationAgeAtEntrySeconds"),
      requireTradeDataInLive: readBooleanOverride(s2, "requireTradeDataInLive"),
    },
    s3: {
      positionSizeSol: readNumberOverride(s3, "positionSizeSol"),
      maxSlippageBps: readNumberOverride(s3, "maxSlippageBps"),
    },
  };
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function percentToFractionOrUndefined(value: string): number | undefined {
  const parsed = numberOrUndefined(value);
  return parsed === undefined ? undefined : parsed / 100;
}

function triStateBooleanToValue(value: TriStateBoolean): boolean | undefined {
  if (value === "inherit") return undefined;
  return value === "true";
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return Object.fromEntries(entries) as Partial<T>;
}

export function buildProfileSettingsPayload(draft: ProfileOverrideDraft): DashboardProfileSettings {
  const s1 = compactObject({
    positionSizeSol: numberOrUndefined(draft.s1.positionSizeSol),
    maxSlippageBps: numberOrUndefined(draft.s1.maxSlippageBps),
    maxSourceTxAgeSeconds: numberOrUndefined(draft.s1.maxSourceTxAgeSeconds),
    requireTradeDataInLive: triStateBooleanToValue(draft.s1.requireTradeDataInLive),
  });
  const s2 = compactObject({
    positionSizeSol: numberOrUndefined(draft.s2.positionSizeSol),
    maxSlippageBps: numberOrUndefined(draft.s2.maxSlippageBps),
    minUniqueHolders: numberOrUndefined(draft.s2.minUniqueHolders),
    maxGraduationAgeAtEntrySeconds: numberOrUndefined(draft.s2.maxGraduationAgeAtEntrySeconds),
    requireTradeDataInLive: triStateBooleanToValue(draft.s2.requireTradeDataInLive),
  });
  const s3 = compactObject({
    positionSizeSol: numberOrUndefined(draft.s3.positionSizeSol),
    maxSlippageBps: numberOrUndefined(draft.s3.maxSlippageBps),
  });

  return compactObject({
    capitalUsd: numberOrUndefined(draft.capitalUsd),
    dailyLossPercent: percentToFractionOrUndefined(draft.dailyLossPercent),
    weeklyLossPercent: percentToFractionOrUndefined(draft.weeklyLossPercent),
    s1: Object.keys(s1).length > 0 ? s1 : undefined,
    s2: Object.keys(s2).length > 0 ? s2 : undefined,
    s3: Object.keys(s3).length > 0 ? s3 : undefined,
  });
}

function validatePositiveField(value: string, label: string, errors: string[]) {
  if (value.trim().length === 0) return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors.push(`${label} must be greater than 0`);
  }
}

function validatePercentField(value: string, label: string, errors: string[]) {
  if (value.trim().length === 0) return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 100) {
    errors.push(`${label} must be between 0 and 100`);
  }
}

export function validateProfileOverrideDraft(draft: ProfileOverrideDraft): string[] {
  const errors: string[] = [];

  validatePositiveField(draft.capitalUsd, "Capital USD", errors);
  validatePercentField(draft.dailyLossPercent, "Daily Loss %", errors);
  validatePercentField(draft.weeklyLossPercent, "Weekly Loss %", errors);

  validatePositiveField(draft.s1.positionSizeSol, "S1 position size", errors);
  validatePositiveField(draft.s1.maxSlippageBps, "S1 max slippage", errors);
  validatePositiveField(draft.s1.maxSourceTxAgeSeconds, "S1 source tx age", errors);

  validatePositiveField(draft.s2.positionSizeSol, "S2 position size", errors);
  validatePositiveField(draft.s2.maxSlippageBps, "S2 max slippage", errors);
  validatePositiveField(draft.s2.minUniqueHolders, "S2 min unique holders", errors);
  validatePositiveField(draft.s2.maxGraduationAgeAtEntrySeconds, "S2 graduation age", errors);

  validatePositiveField(draft.s3.positionSizeSol, "S3 position size", errors);
  validatePositiveField(draft.s3.maxSlippageBps, "S3 max slippage", errors);

  return errors;
}
