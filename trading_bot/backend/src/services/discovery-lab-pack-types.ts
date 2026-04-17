import { z } from "zod";

type Scalar = string | number | boolean;
type QueryValue = Scalar | null;

export type RecipeMode = "graduated" | "pregrad";
export type DiscoveryLabProfile = "runtime" | "high-value" | "scalp";
export type DiscoveryLabPackKind = "created" | "custom";

export type DiscoveryLabRecipe = {
  name: string;
  mode: RecipeMode;
  description?: string;
  deepEvalLimit?: number;
  targetPnlBand?: {
    label: string;
    minPercent?: number;
    maxPercent?: number;
  };
  params: Record<string, QueryValue>;
};

export type DiscoveryLabThresholdOverrides = Partial<{
  minLiquidityUsd: number;
  maxMarketCapUsd: number;
  minHolders: number;
  minVolume5mUsd: number;
  minUniqueBuyers5m: number;
  minBuySellRatio: number;
  maxTop10HolderPercent: number;
  maxSingleHolderPercent: number;
  maxGraduationAgeSeconds: number;
  maxNegativePriceChange5mPercent: number;
}>;

export type DiscoveryLabPack = {
  id: string;
  kind: DiscoveryLabPackKind;
  name: string;
  description: string;
  thesis?: string;
  targetPnlBand?: {
    label: string;
    minPercent?: number;
    maxPercent?: number;
  };
  defaultSources: string[];
  defaultProfile: DiscoveryLabProfile;
  thresholdOverrides: DiscoveryLabThresholdOverrides;
  recipes: DiscoveryLabRecipe[];
  updatedAt: string;
  sourcePath: string;
};

export type DiscoveryLabValidationIssue = {
  path: string;
  message: string;
  level: "error" | "warning";
};

export type DiscoveryLabPackDraft = {
  id?: string;
  name: string;
  description?: string;
  thesis?: string;
  targetPnlBand?: {
    label: string;
    minPercent?: number;
    maxPercent?: number;
  };
  defaultSources?: string[];
  defaultProfile?: DiscoveryLabProfile;
  thresholdOverrides?: DiscoveryLabThresholdOverrides;
  recipes: DiscoveryLabRecipe[];
};

export const DEFAULT_PROFILE: DiscoveryLabProfile = "high-value";
export const DEFAULT_SOURCES = ["pump_dot_fun"];
export const KNOWN_SOURCES = [
  "pump_dot_fun",
  "moonshot",
  "raydium_launchlab",
  "meteora_dynamic_bonding_curve",
];

export const FILTER_KEYS = new Set([
  "creator",
  "platform_id",
  "min_progress_percent",
  "max_progress_percent",
  "min_creation_time",
  "max_creation_time",
  "min_recent_listing_time",
  "max_recent_listing_time",
  "min_last_trade_unix_time",
  "max_last_trade_unix_time",
  "min_liquidity",
  "max_liquidity",
  "min_market_cap",
  "max_market_cap",
  "min_fdv",
  "max_fdv",
  "min_holder",
  "min_volume_1m_usd",
  "min_volume_5m_usd",
  "min_volume_30m_usd",
  "min_volume_1h_usd",
  "min_volume_2h_usd",
  "min_volume_4h_usd",
  "min_volume_8h_usd",
  "min_volume_24h_usd",
  "min_volume_7d_usd",
  "min_volume_30d_usd",
  "min_volume_1m_change_percent",
  "min_volume_5m_change_percent",
  "min_volume_30m_change_percent",
  "min_volume_1h_change_percent",
  "min_volume_2h_change_percent",
  "min_volume_4h_change_percent",
  "min_volume_8h_change_percent",
  "min_volume_24h_change_percent",
  "min_volume_7d_change_percent",
  "min_volume_30d_change_percent",
  "min_price_change_1m_percent",
  "min_price_change_5m_percent",
  "min_price_change_30m_percent",
  "min_price_change_1h_percent",
  "min_price_change_2h_percent",
  "min_price_change_4h_percent",
  "min_price_change_8h_percent",
  "min_price_change_24h_percent",
  "min_price_change_7d_percent",
  "min_price_change_30d_percent",
  "min_trade_1m_count",
  "min_trade_5m_count",
  "min_trade_30m_count",
  "min_trade_1h_count",
  "min_trade_2h_count",
  "min_trade_4h_count",
  "min_trade_8h_count",
  "min_trade_24h_count",
  "min_trade_7d_count",
  "min_trade_30d_count",
]);

const queryValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const recipeSchema = z.object({
  name: z.string().trim().min(1),
  mode: z.enum(["graduated", "pregrad"]),
  description: z.string().optional(),
  deepEvalLimit: z.number().int().positive().max(25).optional(),
  targetPnlBand: z.object({
    label: z.string().trim().min(1),
    minPercent: z.number().optional(),
    maxPercent: z.number().optional(),
  }).optional(),
  params: z.record(z.string(), queryValueSchema),
});
export const thresholdOverridesSchema = z.object({
  minLiquidityUsd: z.number().nonnegative().optional(),
  maxMarketCapUsd: z.number().nonnegative().optional(),
  minHolders: z.number().nonnegative().optional(),
  minVolume5mUsd: z.number().nonnegative().optional(),
  minUniqueBuyers5m: z.number().nonnegative().optional(),
  minBuySellRatio: z.number().nonnegative().optional(),
  maxTop10HolderPercent: z.number().nonnegative().optional(),
  maxSingleHolderPercent: z.number().nonnegative().optional(),
  maxGraduationAgeSeconds: z.number().int().positive().optional(),
  maxNegativePriceChange5mPercent: z.number().nonnegative().optional(),
});
export const customPackFileSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  thesis: z.string().optional(),
  targetPnlBand: z.object({
    label: z.string().trim().min(1),
    minPercent: z.number().optional(),
    maxPercent: z.number().optional(),
  }).optional(),
  defaultSources: z.array(z.string().trim().min(1)).optional(),
  defaultProfile: z.enum(["runtime", "high-value", "scalp"]).optional(),
  thresholdOverrides: thresholdOverridesSchema.optional(),
  recipes: z.array(recipeSchema).min(1),
  updatedAt: z.string().optional(),
});
export const draftSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  thesis: z.string().optional(),
  targetPnlBand: z.object({
    label: z.string().trim().min(1),
    minPercent: z.number().optional(),
    maxPercent: z.number().optional(),
  }).optional(),
  defaultSources: z.array(z.string().trim().min(1)).optional(),
  defaultProfile: z.enum(["runtime", "high-value", "scalp"]).optional(),
  thresholdOverrides: thresholdOverridesSchema.optional(),
  recipes: z.array(recipeSchema).min(1),
});

export function countRecipeFilters(params: Record<string, QueryValue>): number {
  return Object.entries(params)
    .filter(([key]) => FILTER_KEYS.has(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .length;
}

export function withAutoPackName(input: DiscoveryLabPackDraft): DiscoveryLabPackDraft {
  const normalized = withAutoRecipeIdentity(input);
  const nextName = shouldAutoGeneratePackName(normalized.name)
    ? derivePackNameFromFilters(normalized)
    : normalized.name.trim();
  return {
    ...normalized,
    name: nextName,
  };
}

function withAutoRecipeIdentity(input: DiscoveryLabPackDraft): DiscoveryLabPackDraft {
  return {
    ...input,
    recipes: ensureUniqueRecipeNames(
      input.recipes.map((recipe, index) => {
        const params = cleanQueryParams(recipe.params);
        const mode = deriveRecipeModeFromParams(params, recipe.mode);
        return {
          ...recipe,
          name: deriveRecipeNameFromParams(params, mode, index),
          mode,
          description: recipe.description?.trim(),
          params,
        };
      }),
    ),
  };
}

function shouldAutoGeneratePackName(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.length === 0
    || normalized === "new custom package"
    || normalized === "new package"
    || normalized === "custom package";
}

function derivePackNameFromFilters(input: DiscoveryLabPackDraft): string {
  const profile = (input.defaultProfile ?? DEFAULT_PROFILE).toUpperCase();
  const modes = new Set(input.recipes.map((recipe) => recipe.mode));
  const modeTag = modes.size === 0
    ? "PACK"
    : modes.size > 1
      ? "MIX"
      : modes.has("pregrad")
        ? "PRE"
        : "GRAD";
  const sourceTag = summarizeSources(input.defaultSources);
  const thresholds = cleanThresholdOverrides(input.thresholdOverrides);
  const chips: string[] = [];

  if (thresholds.minLiquidityUsd !== undefined) {
    chips.push(`L${formatUsdCompact(thresholds.minLiquidityUsd)}`);
  }
  if (thresholds.minVolume5mUsd !== undefined) {
    chips.push(`V5${formatUsdCompact(thresholds.minVolume5mUsd)}`);
  }
  if (thresholds.maxMarketCapUsd !== undefined) {
    chips.push(`MC${formatUsdCompact(thresholds.maxMarketCapUsd)}`);
  }
  if (thresholds.minBuySellRatio !== undefined) {
    chips.push(`R${roundCompact(thresholds.minBuySellRatio)}`);
  }
  if (thresholds.minUniqueBuyers5m !== undefined) {
    chips.push(`UB${Math.round(thresholds.minUniqueBuyers5m)}`);
  }

  const providerFilterCount = input.recipes.reduce((total, recipe) => total + countRecipeFilters(recipe.params), 0);
  if (providerFilterCount > 0) {
    chips.push(`F${providerFilterCount}`);
  }

  const suffix = chips.length > 0 ? ` ${chips.join(" ")}` : "";
  return `${modeTag} ${profile} ${sourceTag}${suffix}`.trim().slice(0, 96);
}

function cleanQueryParams(params: Record<string, QueryValue>): Record<string, QueryValue> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as Record<string, QueryValue>;
}

function deriveRecipeModeFromParams(
  params: Record<string, QueryValue>,
  fallback: RecipeMode = "graduated",
): RecipeMode {
  if (params.graduated === true || params.min_graduated_time !== undefined || params.max_graduated_time !== undefined) {
    return "graduated";
  }
  if (params.graduated === false || params.min_progress_percent !== undefined || params.max_progress_percent !== undefined) {
    return "pregrad";
  }
  if (params.sort_by === "graduated_time") {
    return "graduated";
  }
  if (params.sort_by === "progress_percent") {
    return "pregrad";
  }
  return fallback;
}

function deriveRecipeNameFromParams(
  params: Record<string, QueryValue>,
  mode: RecipeMode,
  index: number,
): string {
  const sortLabel = typeof params.sort_by === "string"
    ? humanizeRecipeSort(params.sort_by)
    : "Last trade";
  const sourceLabel = typeof params.source === "string" && params.source.trim().length > 0
    ? humanizeRecipeSource(params.source)
    : "Pack sources";
  const filterLabels = Object.entries(params)
    .filter(([key, value]) => FILTER_KEYS.has(key) && value !== undefined && value !== null && value !== "" && key !== "graduated" && key !== "source")
    .map(([key]) => humanizeRecipeFilter(key))
    .slice(0, 2);
  return [formatModeLabel(mode), sortLabel, sourceLabel, ...filterLabels].join(" · ").slice(0, 96) || `Strategy ${index + 1}`;
}

function ensureUniqueRecipeNames(recipes: DiscoveryLabRecipe[]): DiscoveryLabRecipe[] {
  const seen = new Map<string, number>();
  return recipes.map((recipe) => {
    const baseName = recipe.name.trim() || "Strategy";
    const nextCount = (seen.get(baseName) ?? 0) + 1;
    seen.set(baseName, nextCount);
    return nextCount === 1
      ? { ...recipe, name: baseName }
      : { ...recipe, name: `${baseName} #${nextCount}`.slice(0, 96) };
  });
}

function formatModeLabel(mode: RecipeMode): string {
  return mode === "pregrad" ? "Pre-grad" : "Post-grad";
}

function humanizeRecipeSort(value: string): string {
  return value
    .replace(/_percent/g, " %")
    .replace(/_usd/g, " USD")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function humanizeRecipeSource(value: string): string {
  return value
    .replace(/_dot_/g, ".")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function humanizeRecipeFilter(value: string): string {
  return value
    .replace(/^min_/, "Min ")
    .replace(/^max_/, "Max ")
    .replace(/_percent/g, " %")
    .replace(/_usd/g, " USD")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function summarizeSources(input?: string[]): string {
  const sources = normalizeSources(input)
    .slice(0, 2)
    .map((source) => source.replace(/_dot_/g, ".").replace(/_/g, ""));
  if (sources.length === 0) {
    return "pump";
  }
  return sources.join("+");
}

function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (value >= 1_000_000) {
    return `${roundCompact(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${roundCompact(value / 1_000)}K`;
  }
  return `${Math.round(value)}`;
}

function roundCompact(value: number): string {
  if (value >= 100) {
    return `${Math.round(value)}`;
  }
  if (value >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function normalizeSources(input?: string[]): string[] {
  const values = (input ?? DEFAULT_SOURCES)
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : DEFAULT_SOURCES;
}

export function cleanThresholdOverrides(input?: DiscoveryLabThresholdOverrides): DiscoveryLabThresholdOverrides {
  const parsed = thresholdOverridesSchema.parse(input ?? {});
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  ) as DiscoveryLabThresholdOverrides;
}

export function packToDraft(pack: DiscoveryLabPack): DiscoveryLabPackDraft {
  return {
    id: pack.kind === "custom" ? pack.id : undefined,
    name: pack.name,
    description: pack.description,
    thesis: pack.thesis,
    targetPnlBand: pack.targetPnlBand,
    defaultSources: pack.defaultSources,
    defaultProfile: pack.defaultProfile,
    thresholdOverrides: pack.thresholdOverrides,
    recipes: pack.recipes,
  };
}

export function normalizePackDraft(
  draft: DiscoveryLabPackDraft,
  kind: DiscoveryLabPackKind,
  sourcePath: string,
  fallbackId: string,
): DiscoveryLabPack {
  return {
    id: draft.id ?? fallbackId,
    kind,
    name: draft.name,
    description: draft.description ?? "",
    thesis: draft.thesis?.trim() || undefined,
    targetPnlBand: draft.targetPnlBand,
    defaultSources: normalizeSources(draft.defaultSources),
    defaultProfile: draft.defaultProfile ?? DEFAULT_PROFILE,
    thresholdOverrides: cleanThresholdOverrides(draft.thresholdOverrides),
    recipes: draft.recipes,
    updatedAt: new Date().toISOString(),
    sourcePath,
  };
}
