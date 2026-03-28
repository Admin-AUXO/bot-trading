import { randomBytes } from "crypto";
import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import { getStopLossPercent } from "../utils/strategy-config.js";
import type { PositionTracker } from "./position-tracker.js";
import type { RiskManager } from "./risk-manager.js";
import type { JupiterService } from "../services/jupiter.js";
import type { ExecutionScope, TradeResult } from "../utils/types.js";
import { SOL_MINT } from "../utils/types.js";
import type { BuyParams, ITradeExecutor, SellParams } from "../utils/trade-executor-interface.js";

const log = createChildLogger("dry-run");

export class DryRunExecutor implements ITradeExecutor {
  constructor(
    private positionTracker: PositionTracker,
    private riskManager: RiskManager,
    private jupiter: JupiterService,
    private scope: ExecutionScope,
  ) {}

  private fakeTxSig(): string {
    return `dryrun_${randomBytes(32).toString("hex")}`;
  }

  async executeBuy(params: BuyParams): Promise<TradeResult> {
    const shouldTrackPending = !params.positionId;
    if (shouldTrackPending) {
      const check = this.riskManager.canOpenPosition(params.strategy, params.amountSol);
      if (!check.allowed) return { success: false, error: check.reason };
      this.riskManager.reservePosition(params.strategy);
    }

    try {
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
          mode: this.scope.mode,
          configProfile: this.scope.configProfile,
          entryLiquidity: params.entryLiquidity,
          entryMcap: params.entryMcap,
          entryHolders: params.entryHolders,
          entryVolume1h: params.entryVolume1h,
          entryBuyPressure: params.entryBuyPressure,
          entrySlippageBps: Math.round(quote.priceImpactPct * 100),
          tradeSource: params.tradeSource ?? "AUTO",
        });
        positionId = pos.id;
      } else {
        await this.positionTracker.fillPosition(positionId, {
          additionalSol: params.amountSol,
          additionalToken: amountToken,
          fillPriceSol: priceSol,
          fillPriceUsd: priceUsd ?? 0,
        });
      }

      await db.trade.create({
        data: {
          mode: this.scope.mode,
          configProfile: this.scope.configProfile,
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
          tradeSource: params.tradeSource ?? "AUTO",
        },
      });
      this.riskManager.recordBuyExecution(params.amountSol, config.capital.gasFee);

      log.info({
        profile: this.scope.configProfile,
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
    } finally {
      if (shouldTrackPending) this.riskManager.releasePosition(params.strategy);
    }
  }

  async executeSell(params: SellParams): Promise<TradeResult> {
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

    const remaining = Math.max(0, position.remainingToken - params.amountToken);
    const tranche = params.trancheNumber as 1 | 2 | 3;
    await this.positionTracker.markTrancheExit(params.positionId, tranche, remaining);

    await db.trade.create({
      data: {
        mode: this.scope.mode,
        configProfile: this.scope.configProfile,
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
        gasFee: config.capital.gasFee,
        jitoTip: 0,
        txSignature: txSig,
        exitReason: params.exitReason,
        pnlSol,
        pnlUsd,
        pnlPercent,
        trancheNumber: params.trancheNumber,
        regime: position.regime,
        tradeSource: params.tradeSource ?? "AUTO",
      },
    });
    this.riskManager.recordSellExecution(solReceived, pnlUsd, pnlUsd > 0, config.capital.gasFee);

    if (remaining <= 0) {
      const realized = await db.trade.aggregate({
        where: { positionId: params.positionId, side: "SELL" },
        _sum: { pnlSol: true, pnlUsd: true },
      });
      const totalPnlSol = Number(realized._sum.pnlSol ?? 0);
      const totalPnlUsd = Number(realized._sum.pnlUsd ?? 0);
      const totalCostUsd = position.amountToken * position.entryPriceUsd;
      const totalPnlPercent = totalCostUsd > 0 ? (totalPnlUsd / totalCostUsd) * 100 : 0;
      await this.positionTracker.closePosition(
        params.positionId,
        params.exitReason,
        totalPnlSol,
        totalPnlUsd,
        totalPnlPercent,
      );
    }

    log.info({
      profile: this.scope.configProfile,
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
      gasFee: config.capital.gasFee,
      jitoTip: 0,
    };
  }

}
