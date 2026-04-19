import type { DiscoveryLabProfile, DiscoveryLabRecipe } from "./discovery-lab-pack-types.js";
import { DEFAULT_SOURCES } from "./discovery-lab-pack-types.js";

type PnlBand = {
  label: string;
  minPercent?: number;
  maxPercent?: number;
};

type WorkspacePackSeed = {
  id: string;
  name: string;
  description: string;
  thesis: string;
  targetPnlBand: PnlBand;
  defaultProfile: DiscoveryLabProfile;
  recipes: DiscoveryLabRecipe[];
  thresholdOverrides: {
    minLiquidityUsd?: number;
    maxMarketCapUsd?: number;
    minHolders?: number;
    minVolume5mUsd?: number;
    minUniqueBuyers5m?: number;
    minBuySellRatio?: number;
    maxTop10HolderPercent?: number;
    maxSingleHolderPercent?: number;
    maxGraduationAgeSeconds?: number;
    maxNegativePriceChange5mPercent?: number;
  };
};

const UPDATED_AT = "2026-04-19T15:20:00.000Z";

function buildGraduatedRecipe(input: {
  name: string;
  description: string;
  sortBy: string;
  graduatedLookbackSeconds: number;
  targetPnlBand: PnlBand;
  params?: Record<string, string | number | boolean>;
}): DiscoveryLabRecipe {
  return {
    name: input.name,
    mode: "graduated",
    description: input.description,
    targetPnlBand: input.targetPnlBand,
    params: {
      graduated: true,
      sort_by: input.sortBy,
      sort_type: "desc",
      min_graduated_time: `now-${input.graduatedLookbackSeconds}`,
      limit: 100,
      ...(input.params ?? {}),
    },
  };
}

function buildPregradRecipe(input: {
  name: string;
  description: string;
  sortBy: string;
  minProgressPercent: number;
  maxProgressPercent?: number;
  createdLookbackSeconds?: number;
  targetPnlBand: PnlBand;
  params?: Record<string, string | number | boolean>;
}): DiscoveryLabRecipe {
  return {
    name: input.name,
    mode: "pregrad",
    description: input.description,
    targetPnlBand: input.targetPnlBand,
    params: {
      graduated: false,
      sort_by: input.sortBy,
      sort_type: "desc",
      min_progress_percent: input.minProgressPercent,
      limit: 100,
      ...(input.maxProgressPercent !== undefined ? { max_progress_percent: input.maxProgressPercent } : {}),
      ...(input.createdLookbackSeconds !== undefined ? { min_creation_time: `now-${input.createdLookbackSeconds}` } : {}),
      ...(input.params ?? {}),
    },
  };
}

export const WORKSPACE_DISCOVERY_LAB_PACK_SEEDS: WorkspacePackSeed[] = [  // ─────────────────────────────────────────────────────────────────────────────
  // SCALP 30-60% PACKS  (Jack — 2026-04-17)
  // Scalp lane: trade recency + volume filters (max 4 filters each to stay under ceiling)
  // NOTE: graduated, min_graduated_time, sort_by, sort_type are always sent; user filters max 4
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "workspace-scalp-30pct-recent-tape",
    name: "Scalp 30-60% · Recent Tape",
    description: "Graduated tokens within 15 minutes of graduation, sorted by trade recency. Targets fast 30-60% scalp bursts where tape is still live. Liquidity floor at $15k ensures clean in/out.",
    thesis: "Use when you want the tightest-freshness lane: graduates that just came off the bond curve and are still printing live 1m/5m tape. Best in RISK_ON or hot momentum conditions.",
    targetPnlBand: { label: "30-60% fast scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 14_000,
      maxMarketCapUsd: 1_200_000,
      minHolders: 45,
      minVolume5mUsd: 2_200,
      minUniqueBuyers5m: 15,
      minBuySellRatio: 1.12,
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 20,
      maxGraduationAgeSeconds: 900,
      maxNegativePriceChange5mPercent: 10,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "Recent Tape · Fast 30-42%",
        description: "Fastest tape lane: graduates <5 min old, trade within 90s, strong 1m volume.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 420,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          // 3 filters: min_last_trade_unix_time, min_trade_5m_count, min_volume_1m_usd
          min_last_trade_unix_time: "now-90",
          min_trade_5m_count: 28,
          min_volume_1m_usd: 800,
        },
      }),
      buildGraduatedRecipe({
        name: "Recent Tape · Momentum 38-52%",
        description: "Momentum lane: graduates <10 min, sustained 5m tape, buy pressure confirming.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 720,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          // 3 filters: min_last_trade_unix_time, min_trade_5m_count, min_volume_5m_usd
          min_last_trade_unix_time: "now-150",
          min_trade_5m_count: 32,
          min_volume_5m_usd: 1_600,
        },
      }),
      buildGraduatedRecipe({
        name: "Recent Tape · Extension 48-60%",
        description: "Extension lane: graduates <15 min, still active 5m tape, pushing final scalp leg.",
        sortBy: "volume_5m_usd",
        graduatedLookbackSeconds: 1_080,
        targetPnlBand: { label: "48-60%", minPercent: 48, maxPercent: 60 },
        params: {
          // 3 filters: min_last_trade_unix_time, min_trade_5m_count, min_volume_5m_usd
          min_last_trade_unix_time: "now-180",
          min_trade_5m_count: 34,
          min_volume_5m_usd: 2_000,
        },
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // PACK B — LIQUIDITY SORT  (Jack — 2026-04-17)
  // Sort by liquidity desc; targets graduated tokens with the deepest pools for
  // clean 30-60% scalp entries and exits.
  // NOTE: max 4 user filters per recipe to stay under 5-filter ceiling
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "workspace-scalp-30pct-deep-liquidity",
    name: "Scalp 30-60% · Deep Liquidity",
    description: "Graduated tokens sorted by liquidity depth. Targets established graduates with $20k+ pools for clean 30-60% scalp entries and exits. Best in choppy or mixed conditions.",
    thesis: "Use when you want the safer of the two 30-60% lanes: higher liquidity floor means wider market cap range but more robust in/out quality.",
    targetPnlBand: { label: "30-60% liquid scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 16_000,
      maxMarketCapUsd: 1_800_000,
      minHolders: 50,
      minVolume5mUsd: 2_400,
      minUniqueBuyers5m: 15,
      minBuySellRatio: 1.14,
      maxTop10HolderPercent: 38,
      maxSingleHolderPercent: 18,
      maxGraduationAgeSeconds: 1_200,
      maxNegativePriceChange5mPercent: 9,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "Deep Liq · Tape 30-42%",
        description: "Liquid tape lane: graduates <8 min, $20k+ liquidity, strong 1m/5m tape.",
        sortBy: "liquidity",
        graduatedLookbackSeconds: 600,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          // 3 filters: min_liquidity, min_last_trade_unix_time, min_trade_5m_count
          min_liquidity: 16_000,
          min_last_trade_unix_time: "now-150",
          min_trade_5m_count: 28,
        },
      }),
      buildGraduatedRecipe({
        name: "Deep Liq · Buyer Stack 38-52%",
        description: "Buyer-stack lane: graduates <14 min, deep liquidity, sustained buyer pressure.",
        sortBy: "liquidity",
        graduatedLookbackSeconds: 1_020,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          // 3 filters: min_liquidity, min_last_trade_unix_time, min_trade_5m_count
          min_liquidity: 18_000,
          min_last_trade_unix_time: "now-180",
          min_trade_5m_count: 32,
        },
      }),
      buildGraduatedRecipe({
        name: "Deep Liq · Momentum 48-60%",
        description: "Momentum extension: graduates <20 min, $20k+ liquidity, final scalp push to 60%.",
        sortBy: "liquidity",
        graduatedLookbackSeconds: 1_440,
        targetPnlBand: { label: "48-60%", minPercent: 48, maxPercent: 60 },
        params: {
          // 3 filters: min_liquidity, min_last_trade_unix_time, min_trade_5m_count
          min_liquidity: 18_000,
          min_last_trade_unix_time: "now-240",
          min_trade_5m_count: 36,
        },
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // PACK C — TREND SCOUT  (Jack — 2026-04-17)
  // Fast-moving graduated tokens sorted by trade recency.
  // NOTE: max 4 user filters per recipe to stay under 5-filter ceiling
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "workspace-trend-scout",
    name: "Scalp 30-60% · Trend Scout",
    description: "Fast-moving graduated tokens sorted by trade recency. Built for tokens showing directional momentum on the graduated side.",
    thesis: "Use when you want to follow the tape: graduated names with current five-minute and one-hour momentum in the 30-60% scalp band.",
    targetPnlBand: { label: "30-60% momentum scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 10_000,
      maxMarketCapUsd: 1_200_000,
      minHolders: 46,
      minVolume5mUsd: 2_200,
      minUniqueBuyers5m: 14,
      minBuySellRatio: 1.12,
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 20,
      maxGraduationAgeSeconds: 900,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "Trend Scout · Opening 30-42%",
        description: "Opening momentum lane: graduates <10 min, trade within 90s, strong 1m/5m tape.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 600,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          // 3 filters: max_market_cap, min_last_trade_unix_time, min_trade_5m_count
          max_market_cap: 280_000,
          min_last_trade_unix_time: "now-90",
          min_trade_5m_count: 32,
        },
      }),
      buildGraduatedRecipe({
        name: "Trend Scout · Follow 38-52%",
        description: "Trend-follow lane: graduates <20 min, one-hour directional momentum, solid 5m participation.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          // 3 filters: max_market_cap, min_last_trade_unix_time, min_trade_5m_count
          max_market_cap: 480_000,
          min_last_trade_unix_time: "now-150",
          min_trade_5m_count: 38,
        },
      }),
      buildGraduatedRecipe({
        name: "Trend Scout · Extension 48-60%",
        description: "Extension lane: graduates <15 min, sustained tape, pushing final scalp leg to 60%.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 900,
        targetPnlBand: { label: "48-60%", minPercent: 48, maxPercent: 60 },
        params: {
          // 3 filters: max_market_cap, min_last_trade_unix_time, min_trade_5m_count
          max_market_cap: 600_000,
          min_last_trade_unix_time: "now-180",
          min_trade_5m_count: 42,
        },
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // PACK D — PUMP HOLDER  (Jack — 2026-04-17)
  // Wallet-breadth and volume-intensity focused. Sorts by holder count.
  // NOTE: max 4 user filters per recipe to stay under 5-filter ceiling
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "workspace-pump-holder",
    name: "Scalp 30-60% · Pump Holder",
    description: "Wallet-breadth and volume-intensity focused pack. Sorts by unique holder count and one-minute volume to catch early pump dynamics.",
    thesis: "Use when you want early pump dynamics: strong holder distribution and one-minute volume signals in the 30-60% scalp band.",
    targetPnlBand: { label: "30-60% holder pump scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 8_000,
      maxMarketCapUsd: 1_000_000,
      minHolders: 38,
      minVolume5mUsd: 1_800,
      minUniqueBuyers5m: 12,
      minBuySellRatio: 1.10,
      maxTop10HolderPercent: 44,
      maxSingleHolderPercent: 24,
      maxGraduationAgeSeconds: 900,
      maxNegativePriceChange5mPercent: 14,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "Pump Holder · Fast 30-42%",
        description: "Fastest holder-depth lane: graduates within 2 min, holder accumulation visible.",
        sortBy: "holder",
        graduatedLookbackSeconds: 120,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          // 3 filters: max_market_cap, min_holder, min_trade_5m_count
          max_market_cap: 180_000,
          min_holder: 36,
          min_trade_5m_count: 28,
        },
      }),
      buildGraduatedRecipe({
        name: "Pump Holder · Breadth 38-52%",
        description: "Buyer-breadth lane: graduates <5 min, growing holder count, visible 5m volume.",
        sortBy: "holder",
        graduatedLookbackSeconds: 300,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          // 3 filters: max_market_cap, min_holder, min_trade_5m_count
          max_market_cap: 300_000,
          min_holder: 44,
          min_trade_5m_count: 32,
        },
      }),
      buildGraduatedRecipe({
        name: "Pump Holder · Volume 48-60%",
        description: "Volume-confirmation lane: graduates <10 min, real 5m volume, growing holder distribution.",
        sortBy: "volume_5m_usd",
        graduatedLookbackSeconds: 600,
        targetPnlBand: { label: "48-60%", minPercent: 48, maxPercent: 60 },
        params: {
          // 3 filters: max_market_cap, min_holder, min_trade_5m_count
          max_market_cap: 480_000,
          min_holder: 50,
          min_trade_5m_count: 36,
        },
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // PACK E — QUALITY GUARD  (Jack — 2026-04-17)
  // Higher-bar discovery for tokens with proven sustainable trade participation.
  // NOTE: max 4 user filters per recipe to stay under 5-filter ceiling
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "workspace-quality-guard",
    name: "Scalp 30-60% · Quality Guard",
    description: "Higher-bar discovery for tokens that have proven sustainable five-minute and one-hour trade participation.",
    thesis: "Use when you want quality: higher-liquidity, broader-market-cap names that are still printing one-hour momentum in the 30-60% scalp band.",
    targetPnlBand: { label: "30-60% quality scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 12_000,
      maxMarketCapUsd: 1_500_000,
      minHolders: 52,
      minVolume5mUsd: 2_400,
      minUniqueBuyers5m: 16,
      minBuySellRatio: 1.12,
      maxTop10HolderPercent: 38,
      maxSingleHolderPercent: 18,
      maxGraduationAgeSeconds: 1_200,
      maxNegativePriceChange5mPercent: 11,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "Quality Guard · Open 30-42%",
        description: "Opening quality lane: graduates <30 min, 1h tape, broad participation.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_800,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          // 3 filters: max_market_cap, min_last_trade_unix_time, min_trade_5m_count
          max_market_cap: 480_000,
          min_last_trade_unix_time: "now-120",
          min_trade_5m_count: 34,
        },
      }),
      buildGraduatedRecipe({
        name: "Quality Guard · Deep 38-52%",
        description: "Deep quality lane: graduates <1h, sustained 1h tape, broader market-cap tolerance.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 3_600,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          // 3 filters: max_market_cap, min_last_trade_unix_time, min_trade_5m_count
          max_market_cap: 720_000,
          min_last_trade_unix_time: "now-150",
          min_trade_5m_count: 40,
        },
      }),
      buildGraduatedRecipe({
        name: "Quality Guard · Scalp 48-60%",
        description: "Scalp lane: graduates <20 min, strong 5m churn, final push to 60%.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "48-60%", minPercent: 48, maxPercent: 60 },
        params: {
          // 3 filters: max_market_cap, min_last_trade_unix_time, min_trade_5m_count
          max_market_cap: 900_000,
          min_last_trade_unix_time: "now-180",
          min_trade_5m_count: 44,
        },
      }),
    ],
  },

];

export function listWorkspaceDiscoveryLabPackSeeds() {
  return WORKSPACE_DISCOVERY_LAB_PACK_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    description: seed.description,
    thesis: seed.thesis,
    targetPnlBand: { ...seed.targetPnlBand },
    defaultSources: [...DEFAULT_SOURCES],
    defaultProfile: seed.defaultProfile,
    thresholdOverrides: { ...seed.thresholdOverrides },
    recipes: seed.recipes.map((recipe) => ({
      ...recipe,
      targetPnlBand: recipe.targetPnlBand ? { ...recipe.targetPnlBand } : undefined,
      params: { ...recipe.params },
    })),
    updatedAt: UPDATED_AT,
  }));
}
