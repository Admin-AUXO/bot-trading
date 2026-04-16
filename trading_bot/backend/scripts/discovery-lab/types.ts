import type {
  DiscoveryToken,
  HolderConcentration,
  MintAuthoritySnapshot,
  TradeDataSnapshot,
} from "../../src/types/domain.js";

export type Scalar = string | number | boolean;
export type RecipeMode = "graduated" | "pregrad";
export type QueryValue = Scalar | null | undefined;

export type LabRecipe = {
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

export type ResolvedPlan = {
  key: string;
  source: string;
  recipe: LabRecipe;
  params: Record<string, Scalar>;
  filterCount: number;
};

export type LabThresholds = {
  profileName: "runtime" | "high-value" | "scalp";
  minLiquidityUsd: number;
  maxMarketCapUsd: number;
  minHolders: number;
  minUniqueBuyers5m: number;
  minBuySellRatio: number;
  maxTop10HolderPercent: number;
  maxSingleHolderPercent: number;
  maxGraduationAgeSeconds: number;
  minVolume5mUsd: number;
  maxNegativePriceChange5mPercent: number;
};

export type DeepEvaluation = {
  mint: string;
  mode: RecipeMode;
  pass: boolean;
  grade: string;
  preScore: number;
  entryScore: number;
  playScore: number;
  rejectReason: string | null;
  softIssues: string[];
  notes: string[];
  tradeData: TradeDataSnapshot | null;
  mintAuthorities: MintAuthoritySnapshot | null;
  holderConcentration: HolderConcentration | null;
};

export type CacheEntry = {
  fetchedAt: number;
  value: MintResearch;
};

export type BatchFetchResult<T> = {
  value: T | null;
  error: string | null;
};

export type RankedToken = {
  token: DiscoveryToken;
  preScore: number;
};

export type MintResearch = {
  tradeData: TradeDataSnapshot | null;
  mintAuthorities: MintAuthoritySnapshot | null;
  holderConcentration: HolderConcentration | null;
  errorMessage: string | null;
};

export type QueryOutcome = {
  plan: ResolvedPlan;
  returnedCount: number;
  selectedCount: number;
  queryCu: number;
  durationMs: number;
  status: "ok" | "skipped" | "error";
  skipReason?: string;
  errorMessage?: string;
  selectedTokens: RankedToken[];
  topReturned: Array<{
    symbol: string;
    mint: string;
    preScore: number;
    liquidityUsd: number;
    volume5mUsd: number;
    volume1hUsd: number;
    progressPercent: number;
  }>;
};

export type QuerySummary = {
  key: string;
  source: string;
  recipeName: string;
  recipeMode: RecipeMode;
  filterCount: number;
  returnedCount: number;
  selectedCount: number;
  goodCount: number;
  rejectCount: number;
  selectionRatePercent: number;
  passRatePercent: number;
  winnerHitRatePercent: number;
  avgGoodPlayScore: number;
  avgGoodEntryScore: number;
  avgSelectedPlayScore: number;
  avgSelectedEntryScore: number;
  estimatedCu: number;
  goodMints: string[];
  topSelectedTokens: Array<{
    symbol: string;
    mint: string;
    grade: string;
    playScore: number;
    rejectReason: string | null;
  }>;
  topGoodTokens: Array<{
    symbol: string;
    mint: string;
    grade: string;
    playScore: number;
    rejectReason: string | null;
  }>;
};

export type SourceSummary = {
  source: string;
  recipesRun: number;
  totalReturned: number;
  totalGoodTokens: number;
  uniqueGoodTokens: number;
  bestByGoodCount: string | null;
  bestByAverageScore: string | null;
  bestByEfficiency: string | null;
  bestByQuality: string | null;
};

export type WinnerSummary = {
  tokenName: string;
  address: string;
  timeSinceGraduationMin: number | null;
  timeSinceCreationMin: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  holders: number | null;
  volume1mUsd: number | null;
  volume5mUsd: number | null;
  volumeChange1mPercent: number | null;
  volumeChange5mPercent: number | null;
  priceChange1mPercent: number | null;
  priceChange5mPercent: number | null;
  trades1m: number | null;
  trades5m: number | null;
  uniqueWallets5m: number | null;
  uniqueWallets24h: number | null;
  buySellRatio: number | null;
  marketCapUsd: number | null;
  mintAuth: string | null;
  top10HolderPercent: number | null;
  maxSingleHolderPercent: number | null;
  score: number;
  whichRecipes: string[];
};
