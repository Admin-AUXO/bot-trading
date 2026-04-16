import type { BotSettings } from "../types/domain.js";
import type {
  DiscoveryLabDataSource,
  DiscoveryLabMarketStatsPayload,
  DiscoveryLabSnapshotMeta,
} from "./discovery-lab-market-stats-service.js";
import {
  DEFAULT_PROFILE,
  type DiscoveryLabPackDraft,
  type DiscoveryLabThresholdOverrides,
  withAutoPackName,
} from "./discovery-lab-pack-types.js";

type SuggestionDeps = {
  getSettings: () => Promise<BotSettings>;
  getMarketStats: (input?: { limit?: number; refresh?: boolean }) => Promise<DiscoveryLabMarketStatsPayload>;
};

type ThresholdRange = {
  key: keyof DiscoveryLabThresholdOverrides;
  label: string;
  unit: "usd" | "percent" | "count" | "ratio";
  min: number;
  recommended: number;
  max: number;
};

type StrategySuggestionsSnapshot = Omit<DiscoveryLabStrategySuggestionsPayload, "meta">;

type StrategySuggestionsCache = {
  payload: StrategySuggestionsSnapshot;
  cacheState: "ready" | "degraded";
  warnings: string[];
  marketStatsRefreshedAt: string | null;
  sources: DiscoveryLabDataSource[];
};

const STRATEGY_LOCAL_SOURCE: DiscoveryLabDataSource = {
  key: "settings",
  label: "Runtime settings",
  tier: "local",
  detail: "Current discovery thresholds and risk defaults used to shape each draft pack.",
};

export type DiscoveryLabStrategySuggestion = {
  id: string;
  title: string;
  summary: string;
  confidencePercent: number;
  recommendedSessionMinutes: number;
  posture: "aggressive" | "balanced" | "defensive";
  thresholdOverrides: DiscoveryLabThresholdOverrides;
  thresholdRanges: ThresholdRange[];
  discoveryFilters: Array<{ key: string; label: string; value: string }>;
  packDraft: DiscoveryLabPackDraft;
};

export type DiscoveryLabStrategySuggestionsPayload = {
  generatedAt: string;
  meta: DiscoveryLabSnapshotMeta & {
    marketStatsRefreshedAt: string | null;
  };
  regime: "RISK_ON" | "CHOP" | "RISK_OFF";
  confidencePercent: number;
  marketSummary: {
    tokenUniverseSize: number;
    advancingSharePercent: number;
    cautionSharePercent: number;
    medianPriceChange5mPercent: number | null;
    medianLiquidityUsd: number | null;
    medianVolume24hUsd: number | null;
    medianRugScoreNormalized: number | null;
  };
  suggestions: DiscoveryLabStrategySuggestion[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildStrategyMeta(input: {
  cacheState: "empty" | "ready" | "degraded";
  lastRefreshedAt: string | null;
  warnings: string[];
  marketStatsRefreshedAt: string | null;
  sources: DiscoveryLabDataSource[];
}): DiscoveryLabStrategySuggestionsPayload["meta"] {
  const parsedLastRefresh = input.lastRefreshedAt ? Date.parse(input.lastRefreshedAt) : Number.NaN;
  return {
    refreshMode: "manual",
    cacheState: input.cacheState,
    lastRefreshedAt: input.lastRefreshedAt,
    staleMinutes: Number.isFinite(parsedLastRefresh)
      ? Math.max(0, Math.round((Date.now() - parsedLastRefresh) / 60_000))
      : null,
    warnings: input.warnings,
    focusMint: null,
    focusTokenCachedAt: null,
    sources: input.sources,
    marketStatsRefreshedAt: input.marketStatsRefreshedAt,
  };
}

function emptySuggestionsPayload(input: {
  cacheState: "empty" | "ready" | "degraded";
  warnings: string[];
  marketStatsRefreshedAt: string | null;
  sources: DiscoveryLabDataSource[];
}): DiscoveryLabStrategySuggestionsPayload {
  return {
    generatedAt: new Date().toISOString(),
    meta: buildStrategyMeta({
      cacheState: input.cacheState,
      lastRefreshedAt: null,
      warnings: input.warnings,
      marketStatsRefreshedAt: input.marketStatsRefreshedAt,
      sources: input.sources,
    }),
    regime: "CHOP",
    confidencePercent: 0,
    marketSummary: {
      tokenUniverseSize: 0,
      advancingSharePercent: 0,
      cautionSharePercent: 0,
      medianPriceChange5mPercent: null,
      medianLiquidityUsd: null,
      medianVolume24hUsd: null,
      medianRugScoreNormalized: null,
    },
    suggestions: [],
  };
}

function deriveRegime(stats: DiscoveryLabMarketStatsPayload): DiscoveryLabStrategySuggestionsPayload["regime"] {
  const bullish = stats.marketPulse.advancingSharePercent >= 58
    && (stats.marketPulse.medianPriceChange5mPercent ?? 0) >= 4
    && stats.marketPulse.cautionSharePercent <= 35;
  if (bullish) {
    return "RISK_ON";
  }
  const defensive = stats.marketPulse.advancingSharePercent <= 38
    || stats.marketPulse.cautionSharePercent >= 55
    || (stats.marketPulse.medianPriceChange5mPercent ?? 0) <= -2;
  if (defensive) {
    return "RISK_OFF";
  }
  return "CHOP";
}

function deriveRegimeConfidence(stats: DiscoveryLabMarketStatsPayload, regime: DiscoveryLabStrategySuggestionsPayload["regime"]): number {
  const adv = stats.marketPulse.advancingSharePercent / 100;
  const caution = stats.marketPulse.cautionSharePercent / 100;
  const momentum = clamp(((stats.marketPulse.medianPriceChange5mPercent ?? 0) + 12) / 24, 0, 1);
  if (regime === "RISK_ON") {
    return Math.round(clamp((adv * 0.45) + ((1 - caution) * 0.25) + (momentum * 0.3), 0.45, 0.92) * 100);
  }
  if (regime === "RISK_OFF") {
    return Math.round(clamp((caution * 0.45) + ((1 - adv) * 0.25) + ((1 - momentum) * 0.3), 0.45, 0.92) * 100);
  }
  const middle = 1 - Math.abs(adv - 0.5) * 2;
  return Math.round(clamp((middle * 0.5) + ((1 - Math.abs(momentum - 0.5)) * 0.3) + ((1 - Math.abs(caution - 0.5)) * 0.2), 0.42, 0.82) * 100);
}

function buildThresholdRanges(overrides: DiscoveryLabThresholdOverrides): ThresholdRange[] {
  return [
    {
      key: "maxGraduationAgeSeconds",
      label: "Freshness ceiling",
      unit: "count",
      min: 300,
      recommended: overrides.maxGraduationAgeSeconds ?? 1_800,
      max: 7_200,
    },
    {
      key: "maxMarketCapUsd",
      label: "Market-cap ceiling",
      unit: "usd",
      min: 180_000,
      recommended: overrides.maxMarketCapUsd ?? 900_000,
      max: 3_000_000,
    },
    {
      key: "minLiquidityUsd",
      label: "Min liquidity",
      unit: "usd",
      min: 3_000,
      recommended: overrides.minLiquidityUsd ?? 8_000,
      max: 30_000,
    },
    {
      key: "minVolume5mUsd",
      label: "Min 5m volume",
      unit: "usd",
      min: 500,
      recommended: overrides.minVolume5mUsd ?? 2_000,
      max: 15_000,
    },
    {
      key: "minUniqueBuyers5m",
      label: "Min unique buyers 5m",
      unit: "count",
      min: 8,
      recommended: overrides.minUniqueBuyers5m ?? 20,
      max: 80,
    },
    {
      key: "minBuySellRatio",
      label: "Min buy/sell ratio",
      unit: "ratio",
      min: 1,
      recommended: overrides.minBuySellRatio ?? 1.2,
      max: 2.4,
    },
    {
      key: "maxTop10HolderPercent",
      label: "Max top-10 concentration",
      unit: "percent",
      min: 12,
      recommended: overrides.maxTop10HolderPercent ?? 28,
      max: 55,
    },
    {
      key: "maxSingleHolderPercent",
      label: "Max largest holder",
      unit: "percent",
      min: 8,
      recommended: overrides.maxSingleHolderPercent ?? 18,
      max: 28,
    },
  ];
}

function median(values: Array<number | null | undefined>): number | null {
  const sorted = values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function describeWindow(seconds: number): string {
  if (seconds < 3_600) {
    return `${Math.round(seconds / 60)}m`;
  }
  return `${round(seconds / 3_600, 1)}h`;
}

function buildPackDraft(input: {
  title: string;
  summary: string;
  sessionMinutes: number;
  thresholdOverrides: DiscoveryLabThresholdOverrides;
  sortBy: string;
  minTrade5m: number;
  minVolume5mUsd: number;
  maxGraduationAgeSeconds: number;
}): DiscoveryLabPackDraft {
  return withAutoPackName({
    name: input.title,
    description: input.summary,
    thesis: `Suggested for a ${input.sessionMinutes} minute session based on current DEX breadth, momentum, and risk posture.`,
    defaultProfile: DEFAULT_PROFILE,
    defaultSources: ["pump_dot_fun"],
    thresholdOverrides: input.thresholdOverrides,
    targetPnlBand: {
      label: `${input.sessionMinutes}m live window`,
      minPercent: input.sessionMinutes <= 10 ? 8 : 12,
      maxPercent: input.sessionMinutes >= 30 ? 45 : 28,
    },
    recipes: [
      {
        name: input.title,
        mode: "graduated",
        description: input.summary,
        deepEvalLimit: 12,
        params: {
          source: "pump_dot_fun",
          graduated: true,
          sort_by: input.sortBy,
          sort_type: "desc",
          min_graduated_time: Math.floor(Date.now() / 1000) - input.maxGraduationAgeSeconds,
          min_trade_5m_count: input.minTrade5m,
          min_volume_5m_usd: input.minVolume5mUsd,
          min_last_trade_unix_time: Math.floor(Date.now() / 1000) - Math.min(input.sessionMinutes * 60, 900),
        },
      },
    ],
  });
}

export class DiscoveryLabStrategySuggestionService {
  private cache: StrategySuggestionsCache | null = null;

  constructor(private readonly deps: SuggestionDeps) {}

  async getSuggestions(input?: { refresh?: boolean }): Promise<DiscoveryLabStrategySuggestionsPayload> {
    if (input?.refresh) {
      return this.refreshSuggestions();
    }
    if (this.cache) {
      return this.composeFromCache(this.cache);
    }

    const [settings, stats] = await Promise.all([
      this.deps.getSettings(),
      this.deps.getMarketStats({ limit: 18 }),
    ]);
    if (stats.meta.cacheState === "empty") {
      return emptySuggestionsPayload({
        cacheState: "empty",
        warnings: ["No strategy-idea snapshot exists yet. Refresh ideas after the market board has been refreshed."],
        marketStatsRefreshedAt: stats.meta.lastRefreshedAt,
        sources: [...stats.meta.sources, STRATEGY_LOCAL_SOURCE],
      });
    }
    return this.buildAndCache(settings, stats);
  }

  private async refreshSuggestions(): Promise<DiscoveryLabStrategySuggestionsPayload> {
    const [settings, stats] = await Promise.all([
      this.deps.getSettings(),
      this.deps.getMarketStats({ limit: 18, refresh: true }),
    ]);
    return this.buildAndCache(settings, stats);
  }

  private buildAndCache(settings: BotSettings, stats: DiscoveryLabMarketStatsPayload): DiscoveryLabStrategySuggestionsPayload {
    const regime = deriveRegime(stats);
    const regimeConfidence = deriveRegimeConfidence(stats, regime);
    const baseFilters = settings.filters;
    const momentumBias = clamp((stats.marketPulse.medianPriceChange5mPercent ?? 0) / 12, -1, 1);
    const cautionBias = clamp((stats.marketPulse.cautionSharePercent - 35) / 40, -1, 1);
    const boardRows = stats.tokens;
    const freshRows = boardRows.filter((token) => (token.graduationAgeMinutes ?? Number.POSITIVE_INFINITY) <= 30);
    const socialShare = boardRows.length > 0
      ? boardRows.filter((token) => token.socials.count >= 2).length / boardRows.length
      : 0;
    const cleanShare = boardRows.length > 0
      ? boardRows.filter((token) => token.rugRiskLevel !== "danger" && (token.rugScoreNormalized ?? 100) < 60).length / boardRows.length
      : 0;
    const freshShare = boardRows.length > 0 ? freshRows.length / boardRows.length : 0;
    const socialBias = clamp((socialShare - 0.3) / 0.35, -1, 1);
    const securityBias = clamp((cleanShare - 0.55) / 0.3, -1, 1);
    const freshCapMedian = median(freshRows.map((token) => token.marketCapUsd)) ?? median(boardRows.map((token) => token.marketCapUsd));
    const freshLiquidityMedian = median(freshRows.map((token) => token.liquidityUsd)) ?? stats.marketPulse.medianLiquidityUsd;
    const freshVolumeMedian = median(freshRows.map((token) => token.volume5mUsd)) ?? stats.marketPulse.medianVolume24hUsd;

    const templates: Array<{
      id: string;
      title: string;
      summary: string;
      posture: "aggressive" | "balanced" | "defensive";
      sessionMinutes: number;
      sortBy: string;
      confidenceAdjust: number;
      scale: number;
      widenTop10: number;
    }> = regime === "RISK_ON"
      ? [
        { id: "primary-runner", title: "Primary runner continuation", summary: "Tighter freshness, stronger tape, sized for the cleanest current follow-through names.", posture: "aggressive", sessionMinutes: 15, sortBy: "volume_5m_usd", confidenceAdjust: 0, scale: 1.2, widenTop10: -4 },
        { id: "fast-openers", title: "Fast opener scalps", summary: "Very fresh post-grad names for short sessions where tape is already expanding.", posture: "aggressive", sessionMinutes: 5, sortBy: "graduated_time", confidenceAdjust: -4, scale: 1.1, widenTop10: -2 },
        { id: "balanced-flow", title: "Balanced flow capture", summary: "Keeps enough breadth to avoid overfitting the hottest names while staying inside current risk conditions.", posture: "balanced", sessionMinutes: 10, sortBy: "trade_5m_count", confidenceAdjust: -8, scale: 1, widenTop10: 0 },
        { id: "quality-expansion", title: "Quality breadth expansion", summary: "Wider discovery with concentration and buy-pressure guards still engaged.", posture: "balanced", sessionMinutes: 30, sortBy: "volume_5m_usd", confidenceAdjust: -10, scale: 0.92, widenTop10: 2 },
        { id: "defensive-backstop", title: "Defensive backstop", summary: "Fallback pack if hot momentum cools during the session.", posture: "defensive", sessionMinutes: 10, sortBy: "last_trade_unix_time", confidenceAdjust: -14, scale: 0.8, widenTop10: -6 },
      ]
      : regime === "RISK_OFF"
        ? [
          { id: "survival-scalp", title: "Survival scalp", summary: "Strictest quality gate for a tape that is fading or fragmenting.", posture: "defensive", sessionMinutes: 5, sortBy: "last_trade_unix_time", confidenceAdjust: 0, scale: 1.25, widenTop10: -8 },
          { id: "tight-balance", title: "Tight balance", summary: "Only keep names with enough liquidity and buyer support to justify a short controlled attempt.", posture: "defensive", sessionMinutes: 10, sortBy: "volume_5m_usd", confidenceAdjust: -5, scale: 1.15, widenTop10: -6 },
          { id: "watchlist-builder", title: "Watchlist builder", summary: "Slightly wider pack for manual review when auto deployment should stay conservative.", posture: "balanced", sessionMinutes: 15, sortBy: "trade_5m_count", confidenceAdjust: -10, scale: 0.95, widenTop10: -3 },
          { id: "late-session-only", title: "Late-session only", summary: "Longer hold window but only for names with stronger liquidity and lower concentration.", posture: "defensive", sessionMinutes: 30, sortBy: "volume_5m_usd", confidenceAdjust: -12, scale: 1.05, widenTop10: -8 },
          { id: "probe-pack", title: "Probe pack", summary: "Small-footprint discovery when the desk wants signals but not broad exposure.", posture: "defensive", sessionMinutes: 5, sortBy: "graduated_time", confidenceAdjust: -16, scale: 0.85, widenTop10: -10 },
        ]
        : [
          { id: "balanced-primary", title: "Balanced primary", summary: "Middle path between tape quality and row count while the market is mixed.", posture: "balanced", sessionMinutes: 10, sortBy: "trade_5m_count", confidenceAdjust: 0, scale: 1, widenTop10: 0 },
          { id: "quality-lean", title: "Quality lean", summary: "Slightly tighter version for the cleaner subset of the current range-bound market.", posture: "balanced", sessionMinutes: 15, sortBy: "volume_5m_usd", confidenceAdjust: -4, scale: 1.08, widenTop10: -4 },
          { id: "breadth-lean", title: "Breadth lean", summary: "Wider candidate set for manual review without fully opening the gates.", posture: "balanced", sessionMinutes: 15, sortBy: "graduated_time", confidenceAdjust: -7, scale: 0.9, widenTop10: 3 },
          { id: "micro-scalp", title: "Micro scalp", summary: "Quickest-session pack when the board is choppy but some local bursts still exist.", posture: "aggressive", sessionMinutes: 5, sortBy: "last_trade_unix_time", confidenceAdjust: -9, scale: 0.95, widenTop10: -2 },
          { id: "defensive-overlay", title: "Defensive overlay", summary: "Use if the mixed tape starts turning lower during the session.", posture: "defensive", sessionMinutes: 10, sortBy: "volume_5m_usd", confidenceAdjust: -12, scale: 1.15, widenTop10: -6 },
        ];

    const suggestions = templates.map((template) => {
      const shortWindow = template.sessionMinutes <= 30;
      const aggressiveShort = shortWindow && template.posture === "aggressive";
      const liquidity = Math.max(
        3_500,
        round(
          Math.max(baseFilters.minLiquidityUsd * template.scale, (freshLiquidityMedian ?? baseFilters.minLiquidityUsd) * 0.55)
          * (1 + (securityBias * 0.08) + (cautionBias * 0.1)),
          0,
        ),
      );
      const volume5m = Math.max(
        900,
        round(
          Math.max(baseFilters.minVolume5mUsd * template.scale, (freshVolumeMedian ?? baseFilters.minVolume5mUsd) * 0.34)
          * (1 + (momentumBias * 0.1) + (socialBias * 0.06)),
          0,
        ),
      );
      const uniqueBuyers = Math.max(
        10,
        Math.round(baseFilters.minUniqueBuyers5m * template.scale * (1 + momentumBias * 0.08 + socialBias * 0.08)),
      );
      const buySellRatio = round(
        clamp(
          baseFilters.minBuySellRatio
            + (template.posture === "aggressive" ? 0.08 : 0)
            + (cautionBias * 0.08)
            + (socialBias * 0.05),
          1.05,
          2,
        ),
        2,
      );
      const top10 = round(
        clamp(
          baseFilters.maxTop10HolderPercent
            + template.widenTop10
            - (securityBias * 2.5)
            + (aggressiveShort ? -2 : 0),
          14,
          45,
        ),
        1,
      );
      const singleHolder = round(
        clamp(
          baseFilters.maxSingleHolderPercent
            + (template.widenTop10 / 2)
            - (securityBias * 1.4)
            + (aggressiveShort ? -1 : 0),
          8,
          22,
        ),
        1,
      );
      const maxGraduationAgeSeconds = Math.round(clamp(
        (template.sessionMinutes <= 5
          ? 600
          : template.sessionMinutes <= 10
            ? 900
            : template.sessionMinutes <= 15
              ? 1_260
              : template.sessionMinutes <= 30
                ? 1_740
                : 5_400)
          * (1 - (freshShare * 0.08))
          * (1 + (template.posture === "defensive" ? 0.12 : 0))
          * (1 - (securityBias * 0.06)),
        300,
        template.sessionMinutes <= 30 ? 1_800 : 5_400,
      ));
      const marketCapAnchor = freshCapMedian ?? baseFilters.maxMarketCapUsd;
      const maxMarketCapUsd = round(
        clamp(
          Math.min(
            baseFilters.maxMarketCapUsd,
            marketCapAnchor * (
              aggressiveShort
                ? 1.32
                : template.posture === "defensive"
                  ? 1.42
                  : shortWindow
                    ? 1.55
                    : 1.9
            ),
          ) * (1 + Math.max(socialBias, 0) * 0.08),
          180_000,
          shortWindow ? 1_600_000 : 2_400_000,
        ),
        0,
      );
      const thresholdOverrides: DiscoveryLabThresholdOverrides = {
        minLiquidityUsd: liquidity,
        maxMarketCapUsd,
        minHolders: Math.max(
          shortWindow ? 38 : 35,
          Math.round(baseFilters.minHolders * (template.posture === "defensive" ? 1.12 : shortWindow ? 0.9 : 0.85)),
        ),
        minVolume5mUsd: volume5m,
        minUniqueBuyers5m: uniqueBuyers,
        minBuySellRatio: buySellRatio,
        maxTop10HolderPercent: top10,
        maxSingleHolderPercent: singleHolder,
        maxGraduationAgeSeconds,
        maxNegativePriceChange5mPercent: round(
          clamp(
            baseFilters.maxNegativePriceChange5mPercent
              + (template.posture === "aggressive" ? 2 : -1)
              - (securityBias * 1.5)
              - (shortWindow ? 1 : 0),
            6,
            18,
          ),
          1,
        ),
      };
      const summary = [
        template.summary,
        shortWindow
          ? `Keeps the lane inside ${describeWindow(maxGraduationAgeSeconds)} from graduation and caps market cap near ${round(maxMarketCapUsd / 1_000_000, 2)}M.`
          : `Lets the lane widen to ${describeWindow(maxGraduationAgeSeconds)} while keeping structure and flow guards engaged.`,
        socialShare >= 0.35
          ? "Board socials are present enough to allow cleaner continuation names."
          : "Board social backing is thin, so the pack leans harder on freshness and structure.",
        cleanShare >= 0.6
          ? "Current free security read supports normal deployment."
          : "Free security read is mixed, so concentration and drawdown ceilings stay tighter.",
      ].join(" ");
      const packDraft = buildPackDraft({
        title: template.title,
        summary,
        sessionMinutes: template.sessionMinutes,
        thresholdOverrides,
        sortBy: template.sortBy,
        minTrade5m: Math.max(8, Math.round(uniqueBuyers * 1.2)),
        minVolume5mUsd: volume5m,
        maxGraduationAgeSeconds,
      });

      return {
        id: template.id,
        title: template.title,
        summary,
        confidencePercent: Math.round(clamp(regimeConfidence + template.confidenceAdjust, 38, 95)),
        recommendedSessionMinutes: template.sessionMinutes,
        posture: template.posture,
        thresholdOverrides,
        thresholdRanges: buildThresholdRanges(thresholdOverrides),
        discoveryFilters: [
          { key: "source", label: "Source", value: "pump_dot_fun" },
          { key: "graduated", label: "Stage", value: "graduated only" },
          { key: "sort_by", label: "Sort", value: template.sortBy },
          { key: "window", label: "Graduation window", value: describeWindow(maxGraduationAgeSeconds) },
          { key: "market_cap", label: "Cap lane", value: `${round(maxMarketCapUsd / 1_000_000, 2)}M max` },
          { key: "socials", label: "Social backing", value: socialShare >= 0.35 ? "present on board" : "thin, tighter gate" },
          { key: "security", label: "Free security read", value: cleanShare >= 0.6 ? "cleaner than usual" : "mixed, tighten concentration" },
        ],
        packDraft,
      } satisfies DiscoveryLabStrategySuggestion;
    });

    const payload: StrategySuggestionsSnapshot = {
      generatedAt: new Date().toISOString(),
      regime,
      confidencePercent: regimeConfidence,
      marketSummary: {
        tokenUniverseSize: stats.tokenUniverseSize,
        advancingSharePercent: stats.marketPulse.advancingSharePercent,
        cautionSharePercent: stats.marketPulse.cautionSharePercent,
        medianPriceChange5mPercent: stats.marketPulse.medianPriceChange5mPercent,
        medianLiquidityUsd: stats.marketPulse.medianLiquidityUsd,
        medianVolume24hUsd: stats.marketPulse.medianVolume24hUsd,
        medianRugScoreNormalized: stats.marketPulse.medianRugScoreNormalized,
      },
      suggestions,
    };
    this.cache = {
      payload,
      cacheState: stats.meta.cacheState === "degraded" ? "degraded" : "ready",
      warnings: stats.meta.warnings,
      marketStatsRefreshedAt: stats.meta.lastRefreshedAt,
      sources: [...stats.meta.sources, STRATEGY_LOCAL_SOURCE],
    };
    return this.composeFromCache(this.cache);
  }

  private composeFromCache(cache: StrategySuggestionsCache): DiscoveryLabStrategySuggestionsPayload {
    return {
      ...cache.payload,
      meta: buildStrategyMeta({
        cacheState: cache.cacheState,
        lastRefreshedAt: cache.payload.generatedAt,
        warnings: cache.warnings,
        marketStatsRefreshedAt: cache.marketStatsRefreshedAt,
        sources: cache.sources,
      }),
    };
  }
}
