import type {
  DiscoveryLabPack,
  DiscoveryLabProfile,
  DiscoveryLabRecipe,
  DiscoveryLabThresholdOverrides,
} from "./discovery-lab-pack-types.js";
import { DEFAULT_SOURCES } from "./discovery-lab-pack-types.js";

const CREATED_PACKS_UPDATED_AT = "2026-04-16T17:00:00.000Z";

type PnlBand = {
  label: string;
  minPercent?: number;
  maxPercent?: number;
};

type CreatedPackSeed = {
  id: string;
  name: string;
  description: string;
  thesis: string;
  targetPnlBand: PnlBand;
  defaultProfile: DiscoveryLabProfile;
  thresholdOverrides: DiscoveryLabThresholdOverrides;
  recipes: DiscoveryLabRecipe[];
};

type GraduatedRecipeInput = {
  name: string;
  description: string;
  sortBy: string;
  graduatedLookbackSeconds: number;
  targetPnlBand: PnlBand;
  params?: Record<string, string | number | boolean>;
};

function buildGraduatedRecipe(input: GraduatedRecipeInput): DiscoveryLabRecipe {
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

function buildCreatedPack(seed: CreatedPackSeed): DiscoveryLabPack {
  return {
    id: seed.id,
    kind: "created",
    name: seed.name,
    description: seed.description,
    thesis: seed.thesis,
    targetPnlBand: seed.targetPnlBand,
    defaultSources: DEFAULT_SOURCES,
    defaultProfile: seed.defaultProfile,
    thresholdOverrides: seed.thresholdOverrides,
    recipes: seed.recipes,
    updatedAt: CREATED_PACKS_UPDATED_AT,
    sourcePath: `repo://discovery-lab-created-packs/${seed.id}`,
  };
}

const CREATED_PACK_SEEDS: CreatedPackSeed[] = [
  {
    id: "created-early-grad-scalp-tape-surge",
    name: "Created - Early Grad Scalp Tape Surge",
    description: "Earliest graduated scalp lane built on fresh-trade recency plus strong 5m tape count, tuned for ultra-low-cap acceleration in the first 4 to 18 minutes.",
    thesis: "Use when you want first-rotation low-cap graduates only, with recency-first tape pressure and strict concentration/drawdown guardrails.",
    targetPnlBand: { label: "45-115% early tape scalp", minPercent: 45, maxPercent: 115 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 8_000,
      maxMarketCapUsd: 850_000,
      minHolders: 38,
      minVolume5mUsd: 1_700,
      minUniqueBuyers5m: 13,
      minBuySellRatio: 1.08,
      maxTop10HolderPercent: 43,
      maxSingleHolderPercent: 22,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_4m_tape_surge",
        description: "Earliest low-cap scalp lane for graduates still printing live tape inside four minutes.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 240,
        targetPnlBand: { label: "45-62%", minPercent: 45, maxPercent: 62 },
        params: {
          max_market_cap: 220_000,
          min_trade_5m_count: 36,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_7m_tape_reclaim",
        description: "Early reclaim lane for low-cap names that rebuilt trade pace quickly after the first impulse.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 420,
        targetPnlBand: { label: "58-76%", minPercent: 58, maxPercent: 76 },
        params: {
          max_market_cap: 300_000,
          min_trade_5m_count: 42,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_12m_tape_hold",
        description: "Mid-fresh lane for low-cap continuations still printing current trades and broad five-minute participation.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 720,
        targetPnlBand: { label: "70-95%", minPercent: 70, maxPercent: 95 },
        params: {
          max_market_cap: 380_000,
          min_trade_5m_count: 48,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_18m_scalp_extension",
        description: "Latest early extension lane for low-cap names that remain active enough for fast scalp exits.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_080,
        targetPnlBand: { label: "88-115%", minPercent: 88, maxPercent: 115 },
        params: {
          max_market_cap: 480_000,
          min_trade_5m_count: 54,
        },
      }),
    ],
  },
  {
    id: "created-early-grad-scalp-buyer-stack",
    name: "Created - Early Grad Scalp Buyer Stack",
    description: "Early graduated scalp pack centered on buyer expansion using the proven recency + trade-count shape with a tighter low-cap ladder.",
    thesis: "Use when you want early continuation only after fresh tape persists and five-minute trade participation remains elevated in low-cap names.",
    targetPnlBand: { label: "50-125% buyer stack scalp", minPercent: 50, maxPercent: 125 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 9_000,
      maxMarketCapUsd: 1_000_000,
      minHolders: 42,
      minVolume5mUsd: 1_900,
      minUniqueBuyers5m: 14,
      minBuySellRatio: 1.1,
      maxTop10HolderPercent: 42,
      maxSingleHolderPercent: 21,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_4m_wallet_open",
        description: "Opening low-cap lane where recent tape and 5m trade participation confirm immediately.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 240,
        targetPnlBand: { label: "50-68%", minPercent: 50, maxPercent: 68 },
        params: {
          max_market_cap: 240_000,
          min_trade_5m_count: 40,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_9m_buyer_depth",
        description: "Buyer-depth lane for low-cap names still printing current tape and broader trade participation.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 540,
        targetPnlBand: { label: "64-86%", minPercent: 64, maxPercent: 86 },
        params: {
          max_market_cap: 340_000,
          min_trade_5m_count: 50,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_15m_holder_confirmation",
        description: "Confirmation lane for setups that maintain active tape through fifteen minutes without losing trade participation.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 900,
        targetPnlBand: { label: "82-104%", minPercent: 82, maxPercent: 104 },
        params: {
          max_market_cap: 500_000,
          min_trade_5m_count: 58,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_24m_buyer_extension",
        description: "Latest early extension lane where low-cap names still print timely tape and high 5m churn.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_440,
        targetPnlBand: { label: "98-125%", minPercent: 98, maxPercent: 125 },
        params: {
          max_market_cap: 680_000,
          min_trade_5m_count: 66,
        },
      }),
    ],
  },
  {
    id: "created-early-grad-scalp-liquidity-ramp",
    name: "Created - Early Grad Scalp Liquidity Ramp",
    description: "Early graduated scalp pack that keeps the proven recency lens but stages progressively higher trade-count gates across low-to-mid microcaps.",
    thesis: "Use when you want early scalps that still favor lower-cap acceleration, but with a slightly wider cap ladder than the first two packs.",
    targetPnlBand: { label: "55-135% liquidity ramp scalp", minPercent: 55, maxPercent: 135 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 10_000,
      maxMarketCapUsd: 1_200_000,
      minHolders: 45,
      minVolume5mUsd: 2_100,
      minUniqueBuyers5m: 15,
      minBuySellRatio: 1.11,
      maxTop10HolderPercent: 41,
      maxSingleHolderPercent: 20,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_5m_liquidity_ping",
        description: "Opening lane for lower-cap names with fresh tape and immediate five-minute trade confirmation.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 300,
        targetPnlBand: { label: "55-74%", minPercent: 55, maxPercent: 74 },
        params: {
          max_market_cap: 280_000,
          min_trade_5m_count: 42,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_11m_liquidity_ramp",
        description: "Ramp lane for names that keep printing current trades while 5m activity expands.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 660,
        targetPnlBand: { label: "70-92%", minPercent: 70, maxPercent: 92 },
        params: {
          max_market_cap: 420_000,
          min_trade_5m_count: 52,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_20m_flow_absorption",
        description: "Flow lane for low-cap continuations still printing active tape through the twenty-minute window.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "88-112%", minPercent: 88, maxPercent: 112 },
        params: {
          max_market_cap: 620_000,
          min_trade_5m_count: 60,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_32m_liquidity_extension",
        description: "Latest extension lane for names still printing timely trades with strong five-minute churn.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_920,
        targetPnlBand: { label: "105-135%", minPercent: 105, maxPercent: 135 },
        params: {
          max_market_cap: 860_000,
          min_trade_5m_count: 70,
        },
      }),
    ],
  },
  {
    id: "created-early-grad-scalp-momentum-retest",
    name: "Created - Early Grad Scalp Momentum Retest",
    description: "Early graduated momentum scalp pack using the proven recency-first query shape with stricter 5m churn gates and a capped low-mid market-cap ladder.",
    thesis: "Use when you want momentum scalps that still bias to lower market caps but allow slightly broader winners than the tighter first three packs.",
    targetPnlBand: { label: "60-145% momentum retest scalp", minPercent: 60, maxPercent: 145 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 9_500,
      maxMarketCapUsd: 1_350_000,
      minHolders: 44,
      minVolume5mUsd: 2_200,
      minUniqueBuyers5m: 16,
      minBuySellRatio: 1.12,
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 19,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_6m_momentum_impulse",
        description: "Opening momentum lane for lower-cap names that still print very fresh tape and dense five-minute trades.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 360,
        targetPnlBand: { label: "60-82%", minPercent: 60, maxPercent: 82 },
        params: {
          max_market_cap: 320_000,
          min_trade_5m_count: 44,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_13m_retest_hold",
        description: "Retest lane for names that keep current tape and maintain elevated trade participation after the first reaction.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 780,
        targetPnlBand: { label: "78-101%", minPercent: 78, maxPercent: 101 },
        params: {
          max_market_cap: 480_000,
          min_trade_5m_count: 55,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_22m_momentum_breadth",
        description: "Breadth lane for continuations that are still very active on tape with persistent five-minute churn.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_320,
        targetPnlBand: { label: "96-122%", minPercent: 96, maxPercent: 122 },
        params: {
          max_market_cap: 700_000,
          min_trade_5m_count: 64,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_36m_extension_guard",
        description: "Extension lane for higher-quality early runners still printing timely tape and strong five-minute activity.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 2_160,
        targetPnlBand: { label: "115-145%", minPercent: 115, maxPercent: 145 },
        params: {
          max_market_cap: 980_000,
          min_trade_5m_count: 74,
        },
      }),
    ],
  },
  {
    id: "created-early-grad-scalp-quality-guard",
    name: "Created - Early Grad Scalp Quality Guard",
    description: "Most selective early graduated scalp pack using the same recency-first query base with the strongest trade-count thresholds and a still-capped low-mid market-cap ladder.",
    thesis: "Use when you want high-integrity continuation setups with fresh tape, dense five-minute participation, and strong structural guardrails.",
    targetPnlBand: { label: "65-155% quality guard scalp", minPercent: 65, maxPercent: 155 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 12_000,
      maxMarketCapUsd: 1_500_000,
      minHolders: 55,
      minVolume5mUsd: 2_600,
      minUniqueBuyers5m: 18,
      minBuySellRatio: 1.14,
      maxTop10HolderPercent: 37,
      maxSingleHolderPercent: 17,
      maxNegativePriceChange5mPercent: 10,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_8m_quality_open",
        description: "Opening quality lane for low-cap names with fresh tape and already-strong five-minute trade pace.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 480,
        targetPnlBand: { label: "65-90%", minPercent: 65, maxPercent: 90 },
        params: {
          max_market_cap: 380_000,
          min_trade_5m_count: 50,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_16m_quality_confirmation",
        description: "Confirmation lane for names that sustain fresh tape and heavy five-minute churn through sixteen minutes.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 960,
        targetPnlBand: { label: "86-112%", minPercent: 86, maxPercent: 112 },
        params: {
          max_market_cap: 560_000,
          min_trade_5m_count: 58,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_28m_quality_flow",
        description: "Flow lane for continuations still printing timely trades with broad five-minute participation.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_680,
        targetPnlBand: { label: "108-132%", minPercent: 108, maxPercent: 132 },
        params: {
          max_market_cap: 820_000,
          min_trade_5m_count: 68,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_42m_quality_scalp_runner",
        description: "Latest early runner lane for quality names still printing active tape and high five-minute churn.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 2_520,
        targetPnlBand: { label: "126-155%", minPercent: 126, maxPercent: 155 },
        params: {
          max_market_cap: 1_120_000,
          min_trade_5m_count: 78,
        },
      }),
    ],
  },
];

export const DEFAULT_CREATED_DISCOVERY_LAB_PACK_ID = CREATED_PACK_SEEDS[0].id;
export const CREATED_DISCOVERY_LAB_PACKS = CREATED_PACK_SEEDS.map(buildCreatedPack);

export function listCreatedDiscoveryLabPacks(): DiscoveryLabPack[] {
  return CREATED_DISCOVERY_LAB_PACKS.map((pack) => ({
    ...pack,
    targetPnlBand: pack.targetPnlBand ? { ...pack.targetPnlBand } : undefined,
    defaultSources: [...pack.defaultSources],
    thresholdOverrides: { ...pack.thresholdOverrides },
    recipes: pack.recipes.map((recipe) => ({
      ...recipe,
      targetPnlBand: recipe.targetPnlBand ? { ...recipe.targetPnlBand } : undefined,
      params: { ...recipe.params },
    })),
  }));
}

export function getCreatedDiscoveryLabPackById(packId: string): DiscoveryLabPack | null {
  return listCreatedDiscoveryLabPacks().find((pack) => pack.id === packId) ?? null;
}
