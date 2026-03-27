import type { Strategy, MarketRegime, ExitReason, TradeResult, TradeSource } from "./types.js";

export interface BuyParams {
  strategy: Strategy;
  tokenAddress: string;
  tokenSymbol: string;
  amountSol: number;
  maxSlippageBps: number;
  regime: MarketRegime;
  trancheNumber?: number;
  positionId?: string;
  entryVolume5m?: number;
  platform?: string;
  walletSource?: string;
  entryLiquidity?: number;
  entryMcap?: number;
  entryHolders?: number;
  entryVolume1h?: number;
  entryBuyPressure?: number;
  tradeSource?: TradeSource;
  priceAtSignal?: number;
  copyLeadMs?: number;
}

export interface SellParams {
  positionId: string;
  tokenAddress: string;
  tokenSymbol: string;
  strategy: Strategy;
  amountToken: number;
  maxSlippageBps: number;
  exitReason: ExitReason;
  trancheNumber: number;
  tradeSource?: TradeSource;
}

export interface ITradeExecutor {
  executeBuy(params: BuyParams): Promise<TradeResult>;
  executeSell(params: SellParams): Promise<TradeResult>;
}
