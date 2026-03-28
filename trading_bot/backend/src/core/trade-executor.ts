import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import { getStopLossPercent } from "../utils/strategy-config.js";
import type { PositionTracker } from "./position-tracker.js";
import type { RiskManager } from "./risk-manager.js";
import type { JupiterService } from "../services/jupiter.js";
import type { HeliusService } from "../services/helius.js";
import type { Strategy, MarketRegime, ExitReason, TradeResult, TradeSource } from "../utils/types.js";
import { SOL_MINT } from "../utils/types.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";

const log = createChildLogger("trade-executor");

export class TradeExecutor implements ITradeExecutor {
  constructor(
    private positionTracker: PositionTracker,
    private riskManager: RiskManager,
    private jupiter: JupiterService,
    private helius: HeliusService,
  ) {}

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
    tradeSource?: TradeSource;
    priceAtSignal?: number;
    copyLeadMs?: number;
  }): Promise<TradeResult> {
    const entryStart = Date.now();
    const isManual = params.tradeSource === "MANUAL";

    if (!params.positionId && !isManual) {
      const check = this.riskManager.canOpenPosition(params.strategy);
      if (!check.allowed) {
        if (check.reason === "max 5 open positions reached") {
          await db.signal.create({
            data: {
              strategy: params.strategy,
              tokenAddress: params.tokenAddress,
              tokenSymbol: params.tokenSymbol,
              signalType: "BUY",
              source: "executor",
              passed: false,
              rejectReason: "MAX_POSITIONS",
              regime: params.regime,
              tokenLiquidity: params.entryLiquidity ?? null,
              tokenMcap: params.entryMcap ?? null,
              tokenVolume5m: params.entryVolume5m ?? null,
              buyPressure: params.entryBuyPressure ?? null,
              priceAtSignal: params.priceAtSignal ?? null,
              mode: config.tradeMode,
            },
          }).catch((err) => { log.warn({ err }, "failed to log skipped signal"); });
        }
        log.info({ reason: check.reason }, "buy blocked by risk manager");
        return { success: false, error: check.reason };
      }
    }

    if (!params.positionId && !isManual) this.riskManager.reservePosition(params.strategy);
    try {
      const amountLamports = await this.jupiter.toBaseUnits(SOL_MINT, params.amountSol);
      if (amountLamports === null || amountLamports <= 0) {
        return { success: false, error: "failed to normalize SOL amount" };
      }

      const quote = await this.jupiter.getQuote({
        inputMint: SOL_MINT,
        outputMint: params.tokenAddress,
        amount: amountLamports,
        slippageBps: params.maxSlippageBps,
      });

      if (!quote) return { success: false, error: "failed to get jupiter quote" };

      if (quote.priceImpactPct > params.maxSlippageBps / 100) {
        return { success: false, error: `slippage too high: ${quote.priceImpactPct}%` };
      }

      const amountToken = quote.outputAmountUi;
      if (!isFinite(amountToken) || amountToken <= 0) {
        log.warn({ outAmount: quote.outAmount }, "invalid normalized outAmount from Jupiter — aborting");
        return { success: false, error: "invalid token amount from Jupiter" };
      }

      const [priorityFee, blockhashInfo] = await Promise.all([
        this.helius.getPriorityFeeEstimate(),
        this.helius.getLatestBlockhash(),
      ]);

      const swapTx = await this.jupiter.buildSwapTransaction(quote, {
        priorityFee,
        blockhash: blockhashInfo.blockhash,
      });

      if (!swapTx) return { success: false, error: "failed to build swap tx" };

      const simResult = await this.helius.simulateTransaction(swapTx);
      if (!simResult.success) {
        return { success: false, error: "tx simulation failed" };
      }

      if (simResult.unitsConsumed) {
        log.debug({ cu: simResult.unitsConsumed }, "simulation CU consumed");
      }

      const isS1 = params.strategy === "S1_COPY";
      const txSig = isS1
        ? await this.helius.sendTransactionFast(swapTx)
        : await this.helius.sendTransaction(swapTx);

      if (!txSig) return { success: false, error: "tx submission failed" };

      const confirmed = await this.helius.confirmTransaction(txSig, blockhashInfo);
      if (!confirmed) return { success: false, error: "tx confirmation failed" };

      const entryLatencyMs = Date.now() - entryStart;
      const priceUsd = await this.jupiter.getTokenPriceUsd(params.tokenAddress);
      const priceSol = params.amountSol / amountToken;

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
          entryLiquidity: params.entryLiquidity,
          entryMcap: params.entryMcap,
          entryHolders: params.entryHolders,
          entryVolume1h: params.entryVolume1h,
          entryBuyPressure: params.entryBuyPressure,
          entrySlippageBps: Math.round(quote.priceImpactPct * 100),
          entryLatencyMs,
          tradeSource: params.tradeSource ?? "AUTO",
        });
        positionId = pos.id;
      } else {
        await this.positionTracker.fillTranche2(positionId, amountToken);
      }

      await db.trade.create({
        data: {
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
          jitoTip: priorityFee / 1e9,
          txSignature: txSig,
          trancheNumber: params.trancheNumber ?? 1,
          regime: params.regime,
          walletAddress: params.walletSource,
          platform: params.platform,
          tradeSource: params.tradeSource ?? "AUTO",
          copyLeadMs: params.copyLeadMs ?? null,
        },
      });

      log.info({
        strategy: params.strategy,
        token: params.tokenSymbol,
        amountSol: params.amountSol,
        priceUsd,
        latencyMs: entryLatencyMs,
        tx: txSig,
      }, "buy executed");

      return {
        success: true,
        txSignature: txSig,
        priceUsd: priceUsd ?? 0,
        priceSol,
        amountToken,
        slippageBps: Math.round(quote.priceImpactPct * 100),
        gasFee: config.capital.gasFee,
        jitoTip: priorityFee / 1e9,
      };
    } finally {
      if (!params.positionId && !isManual) this.riskManager.releasePosition(params.strategy);
    }
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
    tradeSource?: TradeSource;
  }): Promise<TradeResult> {
    const position = this.positionTracker.getById(params.positionId);
    if (!position) return { success: false, error: "position not found" };

    const amountLamports = await this.jupiter.toBaseUnits(params.tokenAddress, params.amountToken);
    if (amountLamports === null || amountLamports <= 0) {
      return { success: false, error: "failed to normalize token amount" };
    }

    const quote = await this.jupiter.getQuote({
      inputMint: params.tokenAddress,
      outputMint: SOL_MINT,
      amount: amountLamports,
      slippageBps: params.maxSlippageBps,
    });

    if (!quote) return { success: false, error: "failed to get sell quote" };

    const blockhashInfo = await this.helius.getLatestBlockhash();
    const swapTx = await this.jupiter.buildSwapTransaction(quote, { blockhash: blockhashInfo.blockhash });

    if (!swapTx) return { success: false, error: "failed to build sell tx" };

    const txSig = await this.helius.sendTransaction(swapTx);
    if (!txSig) return { success: false, error: "sell tx submission failed" };

    const confirmed = await this.helius.confirmTransaction(txSig, blockhashInfo);
    if (!confirmed) return { success: false, error: "sell tx confirmation failed" };

    const solReceived = quote.outputAmountUi;
    const priceUsd = await this.jupiter.getTokenPriceUsd(params.tokenAddress);
    const priceSol = solReceived / params.amountToken;

    const pnlSol = solReceived - (position.entryPriceSol * params.amountToken);
    const pnlUsd = priceUsd
      ? (priceUsd - position.entryPriceUsd) * params.amountToken
      : pnlSol * position.entryPriceUsd / position.entryPriceSol;
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
      this.riskManager.recordTradeResult(pnlUsd, pnlUsd > 0);
    }

    await db.trade.create({
      data: {
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
        regime: this.riskManager.getSnapshot().regime,
        tradeSource: params.tradeSource ?? "AUTO",
      },
    });

    log.info({
      strategy: params.strategy,
      token: params.tokenSymbol,
      exitReason: params.exitReason,
      pnlUsd: pnlUsd.toFixed(2),
      tx: txSig,
    }, "sell executed");

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
