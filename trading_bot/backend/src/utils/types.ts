import type { Strategy, MarketRegime, CapitalLevel, ExitReason, PositionStatus, TradeMode, TradeSource } from "@prisma/client";

export type { Strategy, MarketRegime, CapitalLevel, ExitReason, PositionStatus, TradeMode, TradeSource };

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
}

export interface TokenHolder {
  address: string;
  percent: number;
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
  capitalUsd: number;
  capitalSol: number;
  walletBalance: number;
  dailyLossUsd: number;
  weeklyLossUsd: number;
  dailyLossLimit: number;
  weeklyLossLimit: number;
  capitalLevel: CapitalLevel;
  regime: MarketRegime;
  rollingWinRate: number;
  isRunning: boolean;
  pauseReason: string | null;
  openPositions: PositionState[];
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
  maxTop10HolderPercent?: number;
  maxSingleHolderPercent?: number;
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
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const PROGRAM_IDS = {
  PUMP_FUN: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  RAYDIUM_LAUNCHLAB: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
  MOONIT: "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG",
  BELIEVE_METEORA_DBC: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
  BOOP_FUN: "boop8hVGQGqehUK2iVEMEnMrL5RbjywRzHKBmBE7ry4",
  RAYDIUM_AMM_V4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  METEORA_DAMM: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
  ORCA_WHIRLPOOLS: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
} as const;
