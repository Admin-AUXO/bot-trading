import { randomBytes } from "crypto";
import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import { getStopLossPercent } from "../utils/strategy-config.js";
import type { PositionTracker } from "./position-tracker.js";
import type { RiskManager } from "./risk-manager.js";
import type { JupiterService } from "../services/jupiter.js";
import type { Strategy, MarketRegime, ExitReason, TradeResult, TradeMode } from "../utils/types.js";
import { SOL_MINT } from "../utils/types.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";

const log = createChildLogger("dry-run");

export class DryRunExecutor implements ITradeExecutor {
  constructor(
    private positionTracker: PositionTracker,
    private riskManager: RiskManager,
    private jupiter: JupiterService,
    private configProfile: string,
  ) {}

  private fakeTxSig(): string {
    return `dryrun_${randomBytes(32).toString("hex")}`;
  }

  async executeBuy(params: {
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
  }): Promise<TradeResult> {
    const amountLamports = await this.jupiter.toBaseUnits(SOL_MINT, params.amountSol);
    if (amountLamports === null || amountLamports <= 0) {
      return { success: false, error: "failed to normalize SOL amount (dry-run)" };
    }

    const quote = await this.jupiter.getQuote({
      inputMint: SOL_MINT,
      outputMint: params.tokenAddress,
      amount: amountLamports,
      slippageBps: params.maxSlippageBps,
    });

    if (!quote) return { success: false, error: "failed to get quote (dry-run)" };
    if (quote.inputAmountUi <= 0 || quote.outputAmountUi <= 0) {
      return { success: false, error: "invalid normalized quote (dry-run)" };
    }

    if (quote.priceImpactPct > params.maxSlippageBps / 100) {
      return { success: false, error: `slippage too high: ${quote.priceImpactPct}% (dry-run)` };
    }

    const priceUsd = await this.jupiter.getTokenPriceUsd(params.tokenAddress);
    const amountToken = quote.outputAmountUi;
    const priceSol = params.amountSol / amountToken;
    const txSig = this.fakeTxSig();

    let positionId = params.positionId;
    if (!positionId) {
      const pos = await this.positionTracker.openPosition({
        strategy: params.strategy,
        tokenAddress: params.tokenAddress,
        tokenSymbol: params.tokenSymbol,
        entryPriceSol: priceSol,
        entryPriceUsd: priceUsd ?? 0,
        amountSol: params.amountSol,
        amountToken,
        stopLossPercent: getStopLossPercent(params.strategy),
        regime: params.regime,
        entryVolume5m: params.entryVolume5m,
        platform: params.platform,
        walletSource: params.walletSource,
        mode: "DRY_RUN",
        configProfile: this.configProfile,
        entryLiquidity: params.entryLiquidity,
        entryMcap: params.entryMcap,
        entryHolders: params.entryHolders,
        entryVolume1h: params.entryVolume1h,
        entryBuyPressure: params.entryBuyPressure,
        entrySlippageBps: Math.round(quote.priceImpactPct * 100),
      });
      positionId = pos.id;
    } else {
      await this.positionTracker.fillTranche2(positionId, amountToken);
    }

    await db.trade.create({
      data: {
        mode: "DRY_RUN",
        configProfile: this.configProfile,
        strategy: params.strategy,
        tokenAddress: params.tokenAddress,
        tokenSymbol: params.tokenSymbol,
        side: "BUY",
        positionId,
        amountSol: params.amountSol,
        amountToken,
        priceUsd: priceUsd ?? 0,
        priceSol,
        slippageBps: Math.round(quote.priceImpactPct * 100),
        gasFee: config.capital.gasFee,
        jitoTip: 0,
        txSignature: txSig,
        trancheNumber: params.trancheNumber ?? 1,
        regime: params.regime,
        walletAddress: params.walletSource,
        platform: params.platform,
      },
    });

    log.info({
      profile: this.configProfile,
      strategy: params.strategy,
      token: params.tokenSymbol,
      amountSol: params.amountSol,
      priceUsd,
    }, "DRY-RUN buy recorded");

    return {
      success: true,
      txSignature: txSig,
      priceUsd: priceUsd ?? 0,
      priceSol,
      amountToken,
      slippageBps: Math.round(quote.priceImpactPct * 100),
      gasFee: config.capital.gasFee,
      jitoTip: 0,
    };
  }

  async executeSell(params: {
    positionId: string;
    tokenAddress: string;
    tokenSymbol: string;
    strategy: Strategy;
    amountToken: number;
    maxSlippageBps: number;
    exitReason: ExitReason;
    trancheNumber: number;
  }): Promise<TradeResult> {
    const position = this.positionTracker.getById(params.positionId);
    if (!position) return { success: false, error: "position not found" };

    const amountLamports = await this.jupiter.toBaseUnits(params.tokenAddress, params.amountToken);
    if (amountLamports === null || amountLamports <= 0) {
      return { success: false, error: "failed to normalize token amount (dry-run)" };
    }

    const quote = await this.jupiter.getQuote({
      inputMint: params.tokenAddress,
      outputMint: SOL_MINT,
      amount: amountLamports,
      slippageBps: params.maxSlippageBps,
    });

    if (!quote) return { success: false, error: "failed to get sell quote (dry-run)" };
    if (quote.inputAmountUi <= 0 || quote.outputAmountUi <= 0) {
      return { success: false, error: "invalid normalized sell quote (dry-run)" };
    }

    const solReceived = quote.outputAmountUi;
    const priceUsd = await this.jupiter.getTokenPriceUsd(params.tokenAddress);
    const priceSol = solReceived / params.amountToken;
    const txSig = this.fakeTxSig();

    const pnlSol = solReceived - (position.entryPriceSol * params.amountToken);
    const pnlUsd = priceUsd
      ? (priceUsd - position.entryPriceUsd) * params.amountToken
      : pnlSol * (position.entryPriceUsd / position.entryPriceSol);
    const pnlPercent = ((priceSol - position.entryPriceSol) / position.entryPriceSol) * 100;

    const remaining = position.remainingToken - params.amountToken;
    const tranche = params.trancheNumber as 1 | 2 | 3;
    await this.positionTracker.markTrancheExit(params.positionId, tranche, remaining);

    if (remaining <= 0) {
      const totalPnlPercent = ((position.currentPriceUsd - position.entryPriceUsd) / position.entryPriceUsd) * 100;
      await this.positionTracker.closePosition(
        params.positionId,
        params.exitReason,
        pnlSol,
        pnlUsd,
        totalPnlPercent,
      );
    }

    await db.trade.create({
      data: {
        mode: "DRY_RUN",
        configProfile: this.configProfile,
        strategy: params.strategy,
        tokenAddress: params.tokenAddress,
        tokenSymbol: params.tokenSymbol,
        side: "SELL",
        positionId: params.positionId,
        amountSol: solReceived,
        amountToken: params.amountToken,
        priceUsd: priceUsd ?? 0,
        priceSol,
        slippageBps: Math.round(quote.priceImpactPct * 100),
        gasFee: 0,
        jitoTip: 0,
        txSignature: txSig,
        exitReason: params.exitReason,
        pnlSol,
        pnlUsd,
        pnlPercent,
        trancheNumber: params.trancheNumber,
        regime: position.regime,
      },
    });

    log.info({
      profile: this.configProfile,
      strategy: params.strategy,
      token: params.tokenSymbol,
      exitReason: params.exitReason,
      pnlUsd: pnlUsd.toFixed(2),
    }, "DRY-RUN sell recorded");

    return {
      success: true,
      txSignature: txSig,
      priceUsd: priceUsd ?? 0,
      priceSol,
      amountToken: params.amountToken,
      gasFee: 0,
      jitoTip: 0,
    };
  }

}
