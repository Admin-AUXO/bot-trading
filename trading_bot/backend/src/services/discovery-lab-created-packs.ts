import type {
  DiscoveryLabPack,
  DiscoveryLabProfile,
  DiscoveryLabRecipe,
  DiscoveryLabThresholdOverrides,
} from "./discovery-lab-pack-types.js";
import { DEFAULT_SOURCES } from "./discovery-lab-pack-types.js";

const CREATED_PACKS_UPDATED_AT = "2026-04-18T08:20:00.000Z";

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
    targetPnlBand: { label: "30-60% early tape scalp", minPercent: 30, maxPercent: 60 },
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
      maxGraduationAgeSeconds: 900,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_4m_tape_surge",
        description: "Earliest low-cap scalp lane for graduates still printing live tape inside four minutes.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 600,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          min_last_trade_unix_time: "now-180",
          min_trade_1m_count: 10,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_7m_tape_reclaim",
        description: "Early reclaim lane for low-cap names that rebuilt trade pace quickly after the first impulse.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 900,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          min_last_trade_unix_time: "now-210",
          min_trade_1m_count: 12,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_12m_tape_hold",
        description: "Mid-fresh lane for low-cap continuations still printing current trades and broad five-minute participation.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "45-56%", minPercent: 45, maxPercent: 56 },
        params: {
          min_last_trade_unix_time: "now-240",
          min_trade_1m_count: 14,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_18m_scalp_extension",
        description: "Latest early extension lane for low-cap names that remain active enough for fast scalp exits.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 1_800,
        targetPnlBand: { label: "52-60%", minPercent: 52, maxPercent: 60 },
        params: {
          min_last_trade_unix_time: "now-300",
          min_trade_1m_count: 16,
        },
      }),
    ],
  },
  {
    id: "created-early-grad-scalp-buyer-stack",
    name: "Created - Early Grad Scalp Buyer Stack",
    description: "Early graduated scalp pack centered on buyer expansion using the proven recency + trade-count shape with a tighter low-cap ladder.",
    thesis: "Use when you want early continuation only after fresh tape persists and five-minute trade participation remains elevated in low-cap names.",
    targetPnlBand: { label: "30-60% buyer stack scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 10_000,
      maxMarketCapUsd: 950_000,
      minHolders: 42,
      minVolume5mUsd: 2_000,
      minUniqueBuyers5m: 14,
      minBuySellRatio: 1.10,
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 20,
      maxGraduationAgeSeconds: 1_200,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_4m_wallet_open",
        description: "Opening low-cap lane where recent tape and 5m trade participation confirm immediately.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 600,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          min_last_trade_unix_time: "now-180",
          min_trade_1m_count: 10,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_9m_buyer_depth",
        description: "Buyer-depth lane for low-cap names still printing current tape and broader trade participation.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 900,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          min_last_trade_unix_time: "now-210",
          min_trade_1m_count: 12,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_15m_holder_confirmation",
        description: "Confirmation lane for setups that maintain active tape through fifteen minutes without losing trade participation.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "45-57%", minPercent: 45, maxPercent: 57 },
        params: {
          min_last_trade_unix_time: "now-240",
          min_trade_1m_count: 14,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_24m_buyer_extension",
        description: "Latest early extension lane where low-cap names still print timely tape and high 5m churn.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 1_800,
        targetPnlBand: { label: "52-60%", minPercent: 52, maxPercent: 60 },
        params: {
          min_last_trade_unix_time: "now-300",
          min_trade_1m_count: 16,
        },
      }),
    ],
  },
  {
    id: "created-early-grad-scalp-liquidity-ramp",
    name: "Created - Early Grad Scalp Liquidity Ramp",
    description: "Early graduated scalp pack that keeps the proven recency lens but stages progressively higher trade-count gates across low-to-mid microcaps.",
    thesis: "Use when you want early scalps that still favor lower-cap acceleration, but with a slightly wider cap ladder than the first two packs.",
    targetPnlBand: { label: "30-60% liquidity ramp scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 12_000,
      maxMarketCapUsd: 1_000_000,
      minHolders: 45,
      minVolume5mUsd: 2_200,
      minUniqueBuyers5m: 15,
      minBuySellRatio: 1.10,
      maxTop10HolderPercent: 39,
      maxSingleHolderPercent: 19,
      maxGraduationAgeSeconds: 1_200,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_5m_liquidity_ping",
        description: "Opening lane for lower-cap names with fresh tape and immediate five-minute trade confirmation.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 600,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          min_last_trade_unix_time: "now-180",
          min_trade_1m_count: 10,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_11m_liquidity_ramp",
        description: "Ramp lane for names that keep printing current trades while 5m activity expands.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 1_000,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          min_last_trade_unix_time: "now-210",
          min_trade_1m_count: 12,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_20m_flow_absorption",
        description: "Flow lane for low-cap continuations still printing active tape through the twenty-minute window.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 1_500,
        targetPnlBand: { label: "45-56%", minPercent: 45, maxPercent: 56 },
        params: {
          min_last_trade_unix_time: "now-240",
          min_trade_1m_count: 14,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_32m_liquidity_extension",
        description: "Latest extension lane for names still printing timely trades with strong five-minute churn.",
        sortBy: "trade_1m_count",
        graduatedLookbackSeconds: 2_100,
        targetPnlBand: { label: "52-60%", minPercent: 52, maxPercent: 60 },
        params: {
          min_last_trade_unix_time: "now-300",
          min_trade_1m_count: 16,
        },
      }),
    ],
  },
  {
    id: "created-early-grad-scalp-momentum-retest",
    name: "Created - Early Grad Scalp Momentum Retest",
    description: "Early graduated momentum scalp pack using the proven recency-first query shape with stricter 5m churn gates and a capped low-mid market-cap ladder.",
    thesis: "Use when you want momentum scalps that still bias to lower market caps but allow slightly broader winners than the tighter first three packs.",
    targetPnlBand: { label: "30-60% momentum retest scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 10_000,
      maxMarketCapUsd: 1_000_000,
      minHolders: 44,
      minVolume5mUsd: 2_200,
      minUniqueBuyers5m: 15,
      minBuySellRatio: 1.10,
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 19,
      maxGraduationAgeSeconds: 1_200,
      maxNegativePriceChange5mPercent: 12,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_6m_momentum_impulse",
        description: "Opening momentum lane for lower-cap names that still print very fresh tape and dense five-minute trades.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 360,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          min_last_trade_unix_time: "now-90",
          min_trade_5m_count: 30,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_13m_retest_hold",
        description: "Retest lane for names that keep current tape and maintain elevated trade participation after the first reaction.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 780,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          min_last_trade_unix_time: "now-120",
          min_trade_5m_count: 34,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_22m_momentum_breadth",
        description: "Breadth lane for continuations that are still very active on tape with persistent five-minute churn.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 960,
        targetPnlBand: { label: "45-56%", minPercent: 45, maxPercent: 56 },
        params: {
          min_last_trade_unix_time: "now-150",
          min_trade_5m_count: 38,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_36m_extension_guard",
        description: "Extension lane for higher-quality early runners still printing timely tape and strong five-minute activity.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "52-60%", minPercent: 52, maxPercent: 60 },
        params: {
          min_last_trade_unix_time: "now-180",
          min_trade_5m_count: 42,
        },
      }),
    ],
  },
  {
    id: "created-early-grad-scalp-quality-guard",
    name: "Created - Early Grad Scalp Quality Guard",
    description: "Most selective early graduated scalp pack using the same recency-first query base with the strongest trade-count thresholds and a still-capped low-mid market-cap ladder.",
    thesis: "Use when you want high-integrity continuation setups with fresh tape, dense five-minute participation, and strong structural guardrails.",
    targetPnlBand: { label: "30-60% quality guard scalp", minPercent: 30, maxPercent: 60 },
    defaultProfile: "scalp",
    thresholdOverrides: {
      minLiquidityUsd: 14_000,
      maxMarketCapUsd: 1_200_000,
      minHolders: 52,
      minVolume5mUsd: 2_500,
      minUniqueBuyers5m: 17,
      minBuySellRatio: 1.12,
      maxTop10HolderPercent: 38,
      maxSingleHolderPercent: 18,
      maxGraduationAgeSeconds: 1_200,
      maxNegativePriceChange5mPercent: 10,
    },
    recipes: [
      buildGraduatedRecipe({
        name: "grad_8m_quality_open",
        description: "Opening quality lane for low-cap names with fresh tape and already-strong five-minute trade pace.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 480,
        targetPnlBand: { label: "30-42%", minPercent: 30, maxPercent: 42 },
        params: {
          min_last_trade_unix_time: "now-90",
          min_trade_5m_count: 30,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_16m_quality_confirmation",
        description: "Confirmation lane for names that sustain fresh tape and heavy five-minute churn through sixteen minutes.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 960,
        targetPnlBand: { label: "38-52%", minPercent: 38, maxPercent: 52 },
        params: {
          min_last_trade_unix_time: "now-120",
          min_trade_5m_count: 34,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_28m_quality_flow",
        description: "Flow lane for continuations still printing timely trades with broad five-minute participation.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "45-56%", minPercent: 45, maxPercent: 56 },
        params: {
          min_last_trade_unix_time: "now-150",
          min_trade_5m_count: 38,
        },
      }),
      buildGraduatedRecipe({
        name: "grad_42m_quality_scalp_runner",
        description: "Latest early runner lane for quality names still printing active tape and high five-minute churn.",
        sortBy: "last_trade_unix_time",
        graduatedLookbackSeconds: 1_200,
        targetPnlBand: { label: "52-60%", minPercent: 52, maxPercent: 60 },
        params: {
          min_last_trade_unix_time: "now-180",
          min_trade_5m_count: 42,
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
