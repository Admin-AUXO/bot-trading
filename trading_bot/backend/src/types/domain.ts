export interface DiscoveryToken {
  mint: string;
  symbol: string;
  name: string;
  source: string;
  creator: string | null;
  platformId: string | null;
  graduated: boolean;
  graduatedAt: number | null;
  creationAt: number | null;
  recentListingAt: number | null;
  lastTradeAt: number | null;
  decimals: number | null;
  progressPercent: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  totalSupply: number | null;
  circulatingSupply: number | null;
  holders: number | null;
  volume1mUsd: number | null;
  volume5mUsd: number | null;
  volume30mUsd: number | null;
  volume1hUsd: number | null;
  volume24hUsd: number | null;
  volume1mChangePercent: number | null;
  volume5mChangePercent: number | null;
  volume30mChangePercent: number | null;
  volume1hChangePercent: number | null;
  volume24hChangePercent: number | null;
  trades1m: number | null;
  trades5m: number | null;
  trades30m: number | null;
  trades1h: number | null;
  trades24h: number | null;
  priceChange1mPercent: number | null;
  priceChange5mPercent: number | null;
  priceChange30mPercent: number | null;
  priceChange1hPercent: number | null;
  priceChange24hPercent: number | null;
}

export interface TradeDataSnapshot {
  lastTradeAt: number | null;
  priceUsd: number | null;
  volume1mUsd: number | null;
  volume5mUsd: number | null;
  volume30mUsd: number | null;
  volume1hUsd: number | null;
  volume24hUsd: number | null;
  volume1mChangePercent: number | null;
  volume5mChangePercent: number | null;
  volume30mChangePercent: number | null;
  volume1hChangePercent: number | null;
  volume24hChangePercent: number | null;
  volumeBuy1mUsd: number | null;
  volumeBuy5mUsd: number | null;
  volumeBuy30mUsd: number | null;
  volumeBuy1hUsd: number | null;
  volumeBuy24hUsd: number | null;
  volumeSell1mUsd: number | null;
  volumeSell5mUsd: number | null;
  volumeSell30mUsd: number | null;
  volumeSell1hUsd: number | null;
  volumeSell24hUsd: number | null;
  uniqueWallets1m: number | null;
  uniqueWallets5m: number | null;
  uniqueWallets30m: number | null;
  uniqueWallets1h: number | null;
  uniqueWallets24h: number | null;
  trades1m: number | null;
  trades5m: number | null;
  trades30m: number | null;
  trades1h: number | null;
  trades24h: number | null;
  buys1m: number | null;
  buys5m: number | null;
  buys30m: number | null;
  buys1h: number | null;
  buys24h: number | null;
  sells1m: number | null;
  sells5m: number | null;
  sells30m: number | null;
  sells1h: number | null;
  sells24h: number | null;
  priceChange1mPercent: number | null;
  priceChange5mPercent: number | null;
  priceChange30mPercent: number | null;
  priceChange1hPercent: number | null;
  priceChange24hPercent: number | null;
}

export interface MintAuthoritySnapshot {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  supplyRaw: string;
  decimals: number;
  isInitialized: boolean;
}

export interface TokenSecuritySnapshot {
  creatorBalancePercent: number | null;
  ownerBalancePercent: number | null;
  updateAuthorityBalancePercent: number | null;
  top10HolderPercent: number | null;
  top10UserPercent: number | null;
  freezeable: boolean | null;
  mintAuthorityEnabled: boolean | null;
  mutableMetadata: boolean | null;
  transferFeeEnabled: boolean | null;
  transferFeePercent: number | null;
  trueToken: boolean | null;
  token2022: boolean | null;
  nonTransferable: boolean | null;
  honeypot: boolean | null;
  fakeToken: boolean | null;
}

export interface HolderConcentration {
  top10Percent: number;
  largestHolderPercent: number;
  largestAccountsCount: number;
  largestHolderAddress: string | null;
}

export interface CandidateEvaluation {
  passed: boolean;
  rejectReason?: string;
  deferReason?: string;
  metrics: Record<string, unknown>;
  entryPriceUsd?: number;
  filterState: CandidateFilterState;
}

export interface CandidateFilterState {
  platformId?: string | null;
  creationAt?: number | null;
  recentListingAt?: number | null;
  lastTradeAt?: number | null;
  decimals?: number | null;
  progressPercent?: number | null;
  priceUsd?: number | null;
  liquidityUsd?: number | null;
  marketCapUsd?: number | null;
  fdvUsd?: number | null;
  totalSupply?: number | null;
  circulatingSupply?: number | null;
  holders?: number | null;
  volume1mUsd?: number | null;
  volume5mUsd?: number | null;
  volume30mUsd?: number | null;
  volume1hUsd?: number | null;
  volume24hUsd?: number | null;
  volume1mChangePercent?: number | null;
  volume5mChangePercent?: number | null;
  volume30mChangePercent?: number | null;
  volume1hChangePercent?: number | null;
  volume24hChangePercent?: number | null;
  volumeBuy1mUsd?: number | null;
  volumeBuy5mUsd?: number | null;
  volumeBuy30mUsd?: number | null;
  volumeBuy1hUsd?: number | null;
  volumeBuy24hUsd?: number | null;
  volumeSell1mUsd?: number | null;
  volumeSell5mUsd?: number | null;
  volumeSell30mUsd?: number | null;
  volumeSell1hUsd?: number | null;
  volumeSell24hUsd?: number | null;
  uniqueWallets1m?: number | null;
  uniqueWallets5m?: number | null;
  uniqueWallets30m?: number | null;
  uniqueWallets1h?: number | null;
  uniqueWallets24h?: number | null;
  trades1m?: number | null;
  trades5m?: number | null;
  trades30m?: number | null;
  trades1h?: number | null;
  trades24h?: number | null;
  buys1m?: number | null;
  buys5m?: number | null;
  buys30m?: number | null;
  buys1h?: number | null;
  buys24h?: number | null;
  sells1m?: number | null;
  sells5m?: number | null;
  sells30m?: number | null;
  sells1h?: number | null;
  sells24h?: number | null;
  buySellRatio?: number | null;
  priceChange1mPercent?: number | null;
  priceChange5mPercent?: number | null;
  priceChange30mPercent?: number | null;
  priceChange1hPercent?: number | null;
  priceChange24hPercent?: number | null;
  graduationAgeSeconds?: number | null;
  top10HolderPercent?: number | null;
  largestHolderPercent?: number | null;
  largestAccountsCount?: number | null;
  largestHolderAddress?: string | null;
  creatorBalancePercent?: number | null;
  ownerBalancePercent?: number | null;
  updateAuthorityBalancePercent?: number | null;
  top10UserPercent?: number | null;
  mintAuthorityActive?: boolean | null;
  freezeAuthorityActive?: boolean | null;
  transferFeeEnabled?: boolean | null;
  transferFeePercent?: number | null;
  trueToken?: boolean | null;
  token2022?: boolean | null;
  nonTransferable?: boolean | null;
  fakeToken?: boolean | null;
  honeypot?: boolean | null;
  freezeable?: boolean | null;
  mutableMetadata?: boolean | null;
  securityCheckedAt?: number | null;
  source?: string | null;
  creator?: string | null;
}

export interface RuntimeSnapshot {
  botState: {
    tradeMode: string;
    capitalUsd: number;
    cashUsd: number;
    realizedPnlUsd: number;
    pauseReason: string | null;
    lastDiscoveryAt: Date | null;
    lastEvaluationAt: Date | null;
    lastExitCheckAt: Date | null;
  };
  entryGate: {
    allowed: boolean;
    reason: string | null;
    retryable: boolean;
    dailyRealizedPnlUsd: number;
    consecutiveLosses: number;
  };
  settings: BotSettings;
  openPositions: number;
  queuedCandidates: number;
  latestCandidates: unknown[];
  latestFills: unknown[];
  providerSummary?: unknown[];
  providerBudget?: unknown;
  adaptiveModel?: AdaptiveModelState;
}

export type StrategyPresetId =
  | "FIRST_MINUTE_POSTGRAD_CONTINUATION"
  | "LATE_CURVE_MIGRATION_SNIPE";

export type StrategyRecipeMode = "graduated" | "pregrad";
export type StrategyRecipeParamValue = string | number | boolean | null;

export interface StrategyPackRecipe {
  name: string;
  mode: StrategyRecipeMode;
  description?: string;
  deepEvalLimit?: number;
  params: Record<string, StrategyRecipeParamValue>;
}

export interface StrategyThresholdOverrides {
  minLiquidityUsd?: number;
  maxMarketCapUsd?: number;
  minHolders?: number;
  minUniqueBuyers5m?: number;
  minBuySellRatio?: number;
  maxTop10HolderPercent?: number;
  maxSingleHolderPercent?: number;
  maxGraduationAgeSeconds?: number;
  minVolume5mUsd?: number;
  maxNegativePriceChange5mPercent?: number;
  securityCheckMinLiquidityUsd?: number;
  securityCheckVolumeMultiplier?: number;
  maxTransferFeePercent?: number;
}

export interface StrategyExitOverrides {
  stopLossPercent?: number;
  tp1Multiplier?: number;
  tp2Multiplier?: number;
  tp1SellFraction?: number;
  tp2SellFraction?: number;
  postTp1RetracePercent?: number;
  trailingStopPercent?: number;
  timeStopMinutes?: number;
  timeStopMinReturnPercent?: number;
  timeLimitMinutes?: number;
}

export interface LiveStrategyCalibrationSummary {
  winnerCount: number;
  avgWinnerScore: number | null;
  avgWinnerVolume5mUsd: number | null;
  avgWinnerMarketCapUsd: number | null;
  avgWinnerTimeSinceGraduationMin: number | null;
  avgRecipeOverlap: number | null;
  volumeStrength: number | null;
  graduationFreshness: number | null;
  calibrationConfidence: number | null;
  dominantMode: StrategyRecipeMode | null;
  derivedProfile: "scalp" | "balanced" | "runner" | null;
}

export interface AdaptiveWinnerCohort {
  id: string;
  key: string;
  label: string;
  tokenCount: number;
  winnerCount: number;
  avgWinnerScore: number | null;
  avgWinnerVolume5mUsd: number | null;
  avgWinnerAgeMin: number | null;
}

export interface AdaptiveDecisionBand {
  id: string;
  cohortKey: string;
  label: string;
  eligibility: string;
  entryPosture: string;
  sizePosture: string;
  exitPosture: string;
  confidence: string;
  support: string;
}

export interface AdaptiveModelState {
  status: "inactive" | "active" | "stale" | "degraded";
  automationUsesAdaptive: boolean;
  enabled: boolean;
  sourceRunId: string | null;
  packId: string | null;
  packName: string | null;
  dominantMode: StrategyRecipeMode | null;
  dominantPresetId: StrategyPresetId | null;
  winnerCount: number;
  bandCount: number;
  calibrationConfidence: number | null;
  staleWarning: string | null;
  degradedWarning: string | null;
  warnings: string[];
  updatedAt: string | null;
}

export interface AdaptiveTokenExplanation {
  enabled: boolean;
  status: "inactive" | "matched" | "partial" | "unmatched";
  matchedBandId: string | null;
  matchedBandLabel: string | null;
  entryPosture: string | null;
  sizePosture: string | null;
  exitPosture: string | null;
  capitalModifierPercent: number | null;
  dominantMode: StrategyRecipeMode | null;
  entryScore: number | null;
  volume5mUsd: number | null;
  liquidityUsd: number | null;
  buySellRatio: number | null;
  graduationAgeMin: number | null;
  reasons: string[];
}

export interface LiveStrategySettings {
  enabled: boolean;
  sourceRunId: string | null;
  packId: string | null;
  packName: string | null;
  sources: string[];
  recipes: StrategyPackRecipe[];
  thresholdOverrides: StrategyThresholdOverrides;
  exitOverrides: StrategyExitOverrides;
  capitalModifierPercent: number;
  dominantMode: StrategyRecipeMode | null;
  dominantPresetId: StrategyPresetId | null;
  calibrationSummary: LiveStrategyCalibrationSummary | null;
  winnerCohorts: AdaptiveWinnerCohort[];
  decisionBands: AdaptiveDecisionBand[];
  updatedAt: string | null;
}

export interface StrategySettings {
  livePresetId: StrategyPresetId;
  dryRunPresetId: StrategyPresetId;
  heliusWatcherEnabled: boolean;
  liveStrategy: LiveStrategySettings;
}

export interface BotSettings {
  tradeMode: "DRY_RUN" | "LIVE";
  cadence: {
    discoveryIntervalMs: number;
    offHoursDiscoveryIntervalMs: number;
    evaluationIntervalMs: number;
    idleEvaluationIntervalMs: number;
    exitIntervalMs: number;
    entryDelayMs: number;
    evaluationConcurrency: number;
  };
  capital: {
    capitalUsd: number;
    positionSizeUsd: number;
    maxOpenPositions: number;
  };
  filters: {
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
    securityCheckMinLiquidityUsd: number;
    securityCheckVolumeMultiplier: number;
    maxTransferFeePercent: number;
  };
  exits: {
    stopLossPercent: number;
    tp1Multiplier: number;
    tp2Multiplier: number;
    tp1SellFraction: number;
    tp2SellFraction: number;
    postTp1RetracePercent: number;
    trailingStopPercent: number;
    timeStopMinutes: number;
    timeStopMinReturnPercent: number;
      timeLimitMinutes: number;
  };
  strategy: StrategySettings;
}
