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
    maxNegativePriceChange5mPercent?: number;
  };
};

const UPDATED_AT = "2026-04-16T00:40:00.000Z";

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

export const WORKSPACE_DISCOVERY_LAB_PACK_SEEDS: WorkspacePackSeed[] = [
  {
    id: "scalp-tape-structure",
    name: "Scalp tape + structure",
    description: "Small-ticket scalp pack that keeps the tape-led continuation recipes, then anchors them with the holder-liquidity control so overlap is cleaner before entry.",
    thesis: "Retained legacy workspace scalp pack for fast continuation entries with one live-tape recipe and one holder-liquidity quality backstop.",
    targetPnlBand: { label: "45-110% scalp", minPercent: 45, maxPercent: 110 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 9_000,
      maxMarketCapUsd: 1_800_000,
      minHolders: 40,
      minVolume5mUsd: 1_800,
      minUniqueBuyers5m: 14,
      minBuySellRatio: 1.08,
      maxTop10HolderPercent: 42,
      maxSingleHolderPercent: 22,
      maxNegativePriceChange5mPercent: 14,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "pump_live_tape_20m",
        description: "Fresh pump graduates that still show live tape inside the first 20 minutes.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "45-80%", minPercent: 45, maxPercent: 80 },
        params: {
          min_last_trade_unix_time: "now-180",
          min_trade_5m_count: 45,
        },
      }),
      buildGraduatedRecipe({
        name: "pump_holder_liquidity_4h",
        description: "Higher-quality pump graduates with enough holder spread and liquidity for fast scalp routing.",
        sortBy: "liquidity",
        graduatedLookbackSeconds: 14_400,
        targetPnlBand: { label: "70-110%", minPercent: 70, maxPercent: 110 },
        params: {
          min_holder: 60,
          min_liquidity: 14_000,
        },
      }),
    ],
  },
  {
    id: "workspace-micro-burst-probe",
    name: "Workspace - Micro Burst Probe",
    description: "Proxy-calibrated scalp workspace pack for the first 4 to 25 minutes after graduation. It keeps the smallest-ticket fast-turn lane, but now uses the validated balanced proxy lens instead of the earlier noise-heavy thresholds.",
    thesis: "Use this when you want the lowest PnL band in the pack set, tighter small-ticket scouting, and fast exits without flattening into pure junk recall.",
    targetPnlBand: { label: "35-100% micro scalp", minPercent: 35, maxPercent: 100 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 8_000,
      maxMarketCapUsd: 2_000_000,
      minHolders: 35,
      minVolume5mUsd: 1_500,
      minUniqueBuyers5m: 12,
      minBuySellRatio: 1.05,
      maxTop10HolderPercent: 45,
      maxSingleHolderPercent: 25,
      maxNegativePriceChange5mPercent: 18,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_3m_tape_ping",
        description: "Opening tape scout for 35% to 50% micro-burst continuations where the first impulse is still actively printing.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 180,
        targetPnlBand: { label: "35-50%", minPercent: 35, maxPercent: 50 },
        params: {
          min_last_trade_unix_time: "now-120",
          min_trade_1m_count: 18,
          min_volume_1m_usd: 650,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_6m_buyer_burst",
        description: "Fresh buyer-breadth lane for 45% to 62% follow-through where the first wallet wave is still expanding.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 360,
        targetPnlBand: { label: "45-62%", minPercent: 45, maxPercent: 62 },
        params: {
          min_trade_1m_count: 24,
          min_volume_5m_usd: 1_900,
          min_holder: 24,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_12m_flow_retest",
        description: "Mid-burst continuation retest for 58% to 80% names that still have enough five-minute flow to re-accelerate.",
        sortBy: "volume_5m_usd",
        graduatedLookbackSeconds: 720,
        targetPnlBand: { label: "58-80%", minPercent: 58, maxPercent: 80 },
        params: {
          min_volume_5m_usd: 2_200,
          min_trade_5m_count: 40,
          min_holder: 28,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_24m_micro_extension",
        description: "Tightest close-out lane for 78% to 100% micro-burst names that have held the first reaction and are pushing one more extension.",
        sortBy: "price_change_5m_percent",
        graduatedLookbackSeconds: 1_440,
        targetPnlBand: { label: "78-100%", minPercent: 78, maxPercent: 100 },
        params: {
          min_price_change_5m_percent: 7,
          min_trade_5m_count: 38,
          min_volume_30m_usd: 9_000,
        },
      }),
    ],
  },
  {
    id: "workspace-structured-trend-ramp",
    name: "Workspace - Structured Trend Ramp",
    description: "Balanced continuation workspace pack for 20 minutes to two hours after graduation. It now sits as the mid-range bridge between the fresh-burst packs and the later quality packs, with cleaner holder structure and broader participation.",
    thesis: "Use this when you want the middle PnL band in the pack set: steadier continuation names, stronger structure than the scalp packs, and room for medium-duration follow-through.",
    targetPnlBand: { label: "85-200% structured trend", minPercent: 85, maxPercent: 200 },
    defaultProfile: "runtime",
    thresholdOverrides: {
      minLiquidityUsd: 13_000,
      maxMarketCapUsd: 3_800_000,
      minHolders: 80,
      minVolume5mUsd: 2_600,
      minUniqueBuyers5m: 17,
      minBuySellRatio: 1.09,
      maxTop10HolderPercent: 38,
      maxSingleHolderPercent: 18,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_18m_structure_base",
        description: "Structured entry base for 85% to 115% continuation names with a cleaner holder and liquidity floor than the burst ladders.",
        sortBy: "liquidity",
        graduatedLookbackSeconds: 1_080,
        targetPnlBand: { label: "85-115%", minPercent: 85, maxPercent: 115 },
        params: {
          min_liquidity: 15_000,
          min_holder: 72,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_36m_breadth_hold",
        description: "Breadth-and-flow hold lane for 108% to 142% names that still look orderly after the first half hour.",
        sortBy: "volume_30m_usd",
        graduatedLookbackSeconds: 2_160,
        targetPnlBand: { label: "108-142%", minPercent: 108, maxPercent: 142 },
        params: {
          min_volume_30m_usd: 20_000,
          min_holder: 82,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_75m_wallet_quality",
        description: "Participation-heavy lane for 132% to 170% trend names that are still compounding with a broader holder base.",
        sortBy: "holder",
        graduatedLookbackSeconds: 4_500,
        targetPnlBand: { label: "132-170%", minPercent: 132, maxPercent: 170 },
        params: {
          min_holder: 95,
          min_volume_1h_usd: 26_000,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_110m_trend_extension",
        description: "Longest structured continuation lane for 165% to 200% names still holding one-hour strength and healthy turnover.",
        sortBy: "price_change_1h_percent",
        graduatedLookbackSeconds: 6_600,
        targetPnlBand: { label: "165-200%", minPercent: 165, maxPercent: 200 },
        params: {
          min_price_change_1h_percent: 17,
          min_volume_1h_usd: 30_000,
          min_trade_1h_count: 240,
        },
      }),
    ],
  },
  {
    id: "workspace-late-migration-pressure",
    name: "Workspace - Late Migration Pressure",
    description: "Pre-grad and late-curve workspace pack built around curve pressure, progress, and migration-quality participation. It now sits at the top of the ladder as the most selective asymmetric pack instead of overlapping the trend and quality packs.",
    thesis: "Use this when you want the highest PnL band in the workspace set: lower hit rate, tighter structure, and migration-aware setup logic aimed at asymmetric late-curve moves.",
    targetPnlBand: { label: "180-360% late migration", minPercent: 180, maxPercent: 360 },
    defaultProfile: "high-value",
    thresholdOverrides: {
      minLiquidityUsd: 18_000,
      maxMarketCapUsd: 5_500_000,
      minHolders: 100,
      minVolume5mUsd: 3_500,
      minUniqueBuyers5m: 22,
      minBuySellRatio: 1.16,
      maxTop10HolderPercent: 34,
      maxSingleHolderPercent: 16,
      maxNegativePriceChange5mPercent: 9,
    },
    recipes: [
      buildPregradRecipe({
        name: "pre_987_curve_pressure",
        description: "Opening late-curve pressure lane for 180% to 220% setups that are crowded near migration but still building five-minute tape.",
        sortBy: "trade_5m_count",
        minProgressPercent: 98.7,
        maxProgressPercent: 99.55,
        targetPnlBand: { label: "180-220%", minPercent: 180, maxPercent: 220 },
        params: {
          min_trade_5m_count: 70,
          min_volume_5m_usd: 4_500,
        },
      }),
      buildPregradRecipe({
        name: "pre_991_wallet_stack",
        description: "Buyer-depth lane for 210% to 255% names where wallet breadth has to be visible before the migration event.",
        sortBy: "holder",
        minProgressPercent: 99.1,
        maxProgressPercent: 99.85,
        targetPnlBand: { label: "210-255%", minPercent: 210, maxPercent: 255 },
        params: {
          min_holder: 110,
          min_volume_30m_usd: 24_000,
        },
      }),
      buildPregradRecipe({
        name: "pre_993_reclaim_flow",
        description: "Reclaim-and-flow lane for 245% to 305% names where late-curve price support is already showing up in the 30-minute tape.",
        sortBy: "price_change_30m_percent",
        minProgressPercent: 99.3,
        maxProgressPercent: 99.93,
        targetPnlBand: { label: "245-305%", minPercent: 245, maxPercent: 305 },
        params: {
          min_price_change_30m_percent: 13,
          min_volume_30m_usd: 30_000,
        },
      }),
      buildPregradRecipe({
        name: "pre_9955_migration_squeeze",
        description: "Highest-conviction squeeze lane for 295% to 360% asymmetric pre-migration names with real one-hour participation behind them.",
        sortBy: "volume_1h_usd",
        minProgressPercent: 99.55,
        targetPnlBand: { label: "295-360%", minPercent: 295, maxPercent: 360 },
        params: {
          min_volume_1h_usd: 42_000,
          min_holder: 125,
          min_trade_30m_count: 220,
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
