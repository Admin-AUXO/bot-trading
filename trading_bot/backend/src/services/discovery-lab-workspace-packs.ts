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
      minLiquidityUsd: 10_000,
      maxMarketCapUsd: 1_050_000,
      minHolders: 44,
      minVolume5mUsd: 2_100,
      minUniqueBuyers5m: 15,
      minBuySellRatio: 1.1,
      maxTop10HolderPercent: 39,
      maxSingleHolderPercent: 20,
      maxGraduationAgeSeconds: 1_200,
      maxNegativePriceChange5mPercent: 12,
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
      minLiquidityUsd: 9_000,
      maxMarketCapUsd: 950_000,
      minHolders: 40,
      minVolume5mUsd: 1_900,
      minUniqueBuyers5m: 14,
      minBuySellRatio: 1.08,
      maxTop10HolderPercent: 41,
      maxSingleHolderPercent: 21,
      maxGraduationAgeSeconds: 1_500,
      maxNegativePriceChange5mPercent: 14,
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
  // ─────────────────────────────────────────────────────────────────────────────
  // 30–60% SCALP PACKS  (Jack — 2026-04-17)
  // Optimized for fast momentum captures: tight freshness window, strong
  // volume/buy-pressure signals, liquidity guards for clean exits.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "workspace-scalp-30pct-recent-tape",
    name: "Scalp 30-60% · Recent Tape",
    description: "Graduated tokens within 15 minutes of graduation, sorted by trade recency. Targets fast 30-60% scalp bursts where tape is still live. Liquidity floor at $15k ensures clean in/out.",
    thesis: "Use when you want the tightest-freshness lane: graduates that just came off the bond curve and are still printing live 1m/5m tape. Best used in RISK_ON or hot momentum conditions. Tight liquidity guard keeps exits clean.",
    targetPnlBand: { label: "30-60% fast scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 15_000,       // higher floor for cleaner exits at target
      maxMarketCapUsd: 1_200_000,   // allow micro-to-mid cap range
      minHolders: 45,
      minVolume5mUsd: 2_500,        // strong 5m volume = momentum present
      minUniqueBuyers5m: 16,
      minBuySellRatio: 1.12,        // buy pressure must dominate
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 20,
      maxGraduationAgeSeconds: 900,  // 15-min freshness window (tight)
      maxNegativePriceChange5mPercent: 10,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_5m_live_tape_fast",
        description: "Fastest tape lane: graduates <5 min old, trade within 90s, strong 1m volume.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 300,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          min_last_trade_unix_time: "now-90",
          min_trade_5m_count: 35,
          min_volume_1m_usd: 1_500,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_10m_tape_momentum",
        description: "Momentum lane: graduates <10 min, sustained 5m tape, buy pressure confirming.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 600,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          min_last_trade_unix_time: "now-150",
          min_trade_5m_count: 40,
          min_volume_5m_usd: 2_000,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_15m_tape_extension",
        description: "Extension lane: graduates <15 min, still active 5m tape, pushing final scalp leg.",
        sortBy: "volume_5m_usd",
        graduatedLookbackSeconds: 900,
        targetPnlBand: { label: "48-60%", minPercent: 48, maxPercent: 60 },
        params: {
          min_last_trade_unix_time: "now-180",
          min_trade_5m_count: 38,
          min_volume_5m_usd: 2_500,
        },
      }),
    ],
  },
  {
    id: "workspace-scalp-30pct-deep-liquidity",
    name: "Scalp 30-60% · Deep Liquidity",
    description: "Graduated tokens with deep liquidity ($20k+) and strong holder distribution. Slower tape but much cleaner exits at the 30-60% target. Suitable for slightly choppier conditions where liquidity matters more than raw recency.",
    thesis: "Use when you want the safer of the two 30-60% lanes: higher liquidity floor means wider market cap range but more robust in/out quality. Best in CHOP or when the hot-recency lane is returning too many false breakouts.",
    targetPnlBand: { label: "30-60% liquid scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 20_000,       // deep liquidity — clean exits
      maxMarketCapUsd: 1_800_000,
      minHolders: 50,
      minVolume5mUsd: 3_000,
      minUniqueBuyers5m: 18,
      minBuySellRatio: 1.14,
      maxTop10HolderPercent: 38,
      maxSingleHolderPercent: 18,
      maxGraduationAgeSeconds: 1_200, // 20-min window (slightly wider for liquid names)
      maxNegativePriceChange5mPercent: 9,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_8m_liquid_tape",
        description: "Liquid tape lane: graduates <8 min, $20k+ liquidity, strong 1m/5m tape.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 480,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          min_last_trade_unix_time: "now-120",
          min_liquidity: 20_000,
          min_trade_5m_count: 32,
          min_volume_1m_usd: 2_000,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_14m_liquid_buyer_stack",
        description: "Buyer-stack lane: graduates <14 min, deep liquidity, sustained buyer pressure.",
        sortBy: "trade_5m_count",
        graduatedLookbackSeconds: 840,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          min_liquidity: 20_000,
          min_trade_5m_count: 38,
          min_holder: 50,
          min_volume_5m_usd: 3_000,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_20m_liquid_momentum_ext",
        description: "Momentum extension: graduates <20 min, $20k+ liquidity, final scalp push.",
        sortBy: "liquidity",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "48-60%", minPercent: 48, maxPercent: 60 },
        params: {
          min_liquidity: 22_000,
          min_holder: 55,
          min_trade_5m_count: 36,
          min_volume_change_1m_percent: 8,
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
