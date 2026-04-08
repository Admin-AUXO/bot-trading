import type {
  Strategy,
  MarketRegime,
  CapitalLevel,
  ExitReason,
  PositionStatus,
  TradeMode,
  TradeSource,
  ApiCallPurpose,
  ApiService,
  QuotaSource,
  QuotaStatus,
} from "@prisma/client";

export type {
  Strategy,
  MarketRegime,
  CapitalLevel,
  ExitReason,
  PositionStatus,
  TradeMode,
  TradeSource,
  ApiCallPurpose,
  ApiService,
  QuotaSource,
  QuotaStatus,
};

export interface ExecutionScope {
  mode: TradeMode;
  configProfile: string;
}

export interface CapitalConfig {
  startingUsd: number;
  startingSol: number;
  gasReserve: number;
  gasFee: number;
  maxOpenPositions: number;
  rollingWindowSize: number;
  dailyLossPercent: number;
  weeklyLossPercent: number;
}

export interface TokenOverview {
  address: string;
  symbol: string;
  name: string;
  price: number;
  priceChange5m: number;
  priceChange1h: number;
  volume5m: number;
  volume1h: number;
  liquidity: number;
  marketCap: number;
  holder: number;
  buyPercent: number;
  sellPercent: number;
}

export interface TokenSecurity {
  top10HolderPercent: number;
  freezeable: boolean;
  mintAuthority: boolean;
  transferFeeEnable: boolean;
  mutableMetadata: boolean;
  totalSupply?: number;
}

export interface TokenHolder {
  address: string;
  percent: number;
  balanceUi?: number;
}

export interface TradeData {
  volume5m: number;
  volumeHistory5m: number;
  volumeBuy5m: number;
  trade5m: number;
  buy5m: number;
  uniqueWallet5m: number;
}

export interface MemeToken {
  address: string;
  symbol: string;
  name: string;
  source: string;
  progressPercent: number;
  graduated: boolean;
  graduatedTime?: number;
  realSolReserves: number;
  creator: string;
}

export interface MultiPriceResult {
  value: number;
  priceChange24h: number;
  liquidity: number;
  updateUnixTime: number;
}

export type SeedSource =
  | "JUPITER_TOP_TRENDING"
  | "JUPITER_TOP_TRADED"
  | "JUPITER_RECENT"
  | "DEX_SCREENER";

export interface SeedCandidate {
  address: string;
  symbol: string;
  name: string;
  source: SeedSource | string;
  priceUsd: number;
  liquidityUsd: number;
  marketCap: number;
  pairCreatedAt?: number;
  metadata?: Record<string, JsonValue>;
}

export interface PrefilterResult {
  address: string;
  passed: boolean;
  source: string;
  reason?: string;
  pairAddress?: string;
  priceUsd?: number;
  liquidityUsd?: number;
  pairCreatedAt?: number;
  metadata?: Record<string, JsonValue>;
}

export interface FinalScoreInput {
  address: string;
  symbol: string;
  name?: string;
  source: string;
}

export interface ExitRefresh {
  tokenAddress: string;
  priceUsd: number | null;
  liquidityUsd: number;
  priceSource: string;
  updatedAt: number;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  inputAmountUi: number;
  outputAmountUi: number;
  inputDecimals: number;
  outputDecimals: number;
  priceImpactPct: number;
  slippageBps: number;
  routePlan: unknown[];
}

export interface PositionState {
  id: string;
  mode: TradeMode;
  tradeSource: TradeSource;
  configProfile: string;
  strategy: Strategy;
  tokenAddress: string;
  tokenSymbol: string;
  entryPriceSol: number;
  entryPriceUsd: number;
  currentPriceSol: number;
  currentPriceUsd: number;
  amountSol: number;
  amountToken: number;
  remainingToken: number;
  peakPriceUsd: number;
  stopLossPercent: number;
  tranche1Filled: boolean;
  tranche2Filled: boolean;
  exit1Done: boolean;
  exit2Done: boolean;
  exit3Done: boolean;
  status: PositionStatus;
  entryVolume5m: number;
  regime: MarketRegime;
  openedAt: Date;
  platform?: string;
  walletSource?: string;
  entryLiquidity?: number;
  entryMcap?: number;
  entryHolders?: number;
  entryVolume1h?: number;
  entryBuyPressure?: number;
  entryRegime?: MarketRegime;
  entrySlippageBps?: number;
  entryLatencyMs?: number;
  maxPnlPercent?: number;
  minPnlPercent?: number;
}

export interface BotStateSnapshot {
  scope: ExecutionScope;
  capitalUsd: number;
  capitalSol: number;
  walletBalance: number;
  walletCapitalUsd: number;
  walletCapitalSol: number;
  dailyLossUsd: number;
  weeklyLossUsd: number;
  dailyLossLimit: number;
  weeklyLossLimit: number;
  capitalLevel: CapitalLevel;
  regime: MarketRegime;
  rollingWinRate: number;
  isRunning: boolean;
  pauseReason: string | null;
  pauseReasons: string[];
  openPositions: PositionState[];
}

export interface ApiRequestMeta {
  strategy?: Strategy;
  mode?: TradeMode;
  configProfile?: string;
  purpose?: ApiCallPurpose;
  essential?: boolean;
  batchSize?: number;
}

export interface BudgetSnapshot {
  service: ApiService;
  date: string;
  budgetTotal: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  dailyBudget: number;
  dailyUsed: number;
  dailyRemaining: number;
  essentialCredits: number;
  nonEssentialCredits: number;
  cachedCalls: number;
  totalCalls: number;
  avgCreditsPerCall: number;
  softLimitPct: number;
  hardLimitPct: number;
  quotaStatus: QuotaStatus;
  quotaSource: QuotaSource;
  providerCycleStart: Date | null;
  providerCycleEnd: Date | null;
  providerReportedUsed: number | null;
  providerReportedRemaining: number | null;
  providerReportedOverage: number | null;
  providerReportedOverageCost: number | null;
  pauseReason: string | null;
}

export interface TradeResult {
  success: boolean;
  txSignature?: string;
  error?: string;
  priceUsd?: number;
  priceSol?: number;
  amountToken?: number;
  slippageBps?: number;
  gasFee?: number;
  jitoTip?: number;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface SignalResult {
  passed: boolean;
  tokenAddress: string;
  tokenSymbol: string;
  rejectReason?: string;
  filterResults: Record<string, JsonValue>;
  metadata?: Record<string, JsonValue>;
}

export interface RegimeState {
  regime: MarketRegime;
  solPrice: number;
  solChange5m: number;
  solChange1h: number;
  trendingCount: number;
  rollingWinRate: number;
}

export interface StrategyOverrides {
  enabled?: boolean;
  positionSizeSol?: number;
  stopLossPercent?: number;
  tp1Percent?: number;
  tp2Percent?: number;
  trailingStopPercent?: number;
  timeStopMinutes?: number;
  timeLimitMinutes?: number;
  maxSlippageBps?: number;
  minLiquidity?: number;
  maxMarketCap?: number;
  minBuyPressure?: number;
  minUniqueHolders?: number;
  maxSourceTxAgeSeconds?: number;
  maxGraduationAgeAtEntrySeconds?: number;
  maxTop10HolderPercent?: number;
  maxSingleHolderPercent?: number;
  requireTradeDataInLive?: boolean;
  volumeSpikeMultiplier?: number;
  scanIntervalMs?: number;
}

export interface ConfigProfileSettings {
  s1?: StrategyOverrides;
  s2?: StrategyOverrides;
  s3?: StrategyOverrides;
  capitalUsd?: number;
  dailyLossPercent?: number;
  weeklyLossPercent?: number;
}

export const SOL_MINT = "So11111111111111111111111111111111111111112";
