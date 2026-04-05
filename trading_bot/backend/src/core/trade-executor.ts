import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import { defaultStrategyConfigs, getStopLossPercent, type StrategyConfigMap } from "../utils/strategy-config.js";
import type { RuntimeState } from "./runtime-state.js";
import type { PositionTracker } from "./position-tracker.js";
import type { RiskManager } from "./risk-manager.js";
import type { JupiterService } from "../services/jupiter.js";
import type { HeliusService } from "../services/helius.js";
import type { ExecutionScope, TradeResult } from "../utils/types.js";
import { SOL_MINT } from "../utils/types.js";
import type { BuyParams, ITradeExecutor, SellParams } from "../utils/trade-executor-interface.js";

const log = createChildLogger("trade-executor");

export class TradeExecutor implements ITradeExecutor {
  private runtimeState: RuntimeState;
  private pendingTokenKeys = new Set<string>();

  constructor(
    private positionTracker: PositionTracker,
    private riskManager: RiskManager,
    private jupiter: JupiterService,
    private helius: HeliusService,
    runtimeStateOrScope: RuntimeState | ExecutionScope,
    strategyConfigs?: StrategyConfigMap,
  ) {
    this.runtimeState = isRuntimeState(runtimeStateOrScope)
      ? runtimeStateOrScope
      : {
          scope: runtimeStateOrScope,
          strategyConfigs: strategyConfigs ?? defaultStrategyConfigs,
          capitalConfig: config.capital,
        };
  }

  async executeBuy(params: BuyParams): Promise<TradeResult> {
    const entryStart = Date.now();
    const shouldTrackPending = !params.positionId;
    const tokenReservationKey = shouldTrackPending ? this.reserveTokenSlot(params.tokenAddress) : null;
    const executionMeta = {
      strategy: params.strategy,
      mode: this.runtimeState.scope.mode,
      configProfile: this.runtimeState.scope.configProfile,
      purpose: "EXECUTION" as const,
      essential: false,
    };

    if (!params.positionId) {
      if (!tokenReservationKey) {
        log.info({ token: params.tokenAddress }, "buy blocked by duplicate token guard");
        return { success: false, error: "token already held or pending in active runtime" };
      }
      if (this.positionTracker.holdsToken(params.tokenAddress, this.runtimeState.scope)) {
        this.releaseTokenSlot(tokenReservationKey);
        log.info({ token: params.tokenAddress }, "buy blocked by existing open position");
        return { success: false, error: "token already held in active runtime" };
      }
    }

    const riskCheck = params.positionId
      ? this.riskManager.canIncreasePosition(params.strategy, params.amountSol)
      : this.riskManager.canOpenPosition(params.strategy, params.amountSol);
    if (!riskCheck.allowed) {
      if (
        !params.positionId
        && riskCheck.reason?.includes("open positions reached")
        && params.tradeSource !== "MANUAL"
      ) {
          await db.signal.create({
            data: {
              mode: this.runtimeState.scope.mode,
              configProfile: this.runtimeState.scope.configProfile,
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
            },
          }).catch((err) => { log.warn({ err }, "failed to log skipped signal"); });
      }
      log.info({ reason: riskCheck.reason }, "buy blocked by risk manager");
      return { success: false, error: riskCheck.reason };
    }

    if (shouldTrackPending) this.riskManager.reservePosition(params.strategy);
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
        this.helius.getPriorityFeeEstimate(executionMeta),
        this.helius.getLatestBlockhash(executionMeta),
      ]);
      const jitoTipSol = priorityFee / 1e9;
      const totalFeeSol = config.capital.gasFee + jitoTipSol;

      const swapTx = await this.jupiter.buildSwapTransaction(quote, {
        priorityFee,
        blockhash: blockhashInfo.blockhash,
      });

      if (!swapTx) return { success: false, error: "failed to build swap tx" };

      const simResult = await this.helius.simulateTransaction(swapTx, executionMeta);
      if (!simResult.success) {
        return { success: false, error: "tx simulation failed" };
      }

      if (simResult.unitsConsumed) {
        log.debug({ cu: simResult.unitsConsumed }, "simulation CU consumed");
      }

      const isS1 = params.strategy === "S1_COPY";
      const txSig = isS1
        ? await this.helius.sendTransactionFast(swapTx, executionMeta)
        : await this.helius.sendTransaction(swapTx, undefined, executionMeta);

      if (!txSig) return { success: false, error: "tx submission failed" };

      const confirmed = await this.helius.confirmTransaction(txSig, undefined, executionMeta);
      if (!confirmed) return { success: false, error: "tx confirmation failed" };

      const entryLatencyMs = Date.now() - entryStart;
      const fill = await this.helius.getWalletTradeFillFromSignature(
        txSig,
        config.solana.publicKey,
        params.tokenAddress,
        executionMeta,
      );
      if (!fill || fill.side !== "BUY") {
        return { success: false, error: "tx confirmed but fill reconciliation failed" };
      }

      const priceSol = fill.amountSol / fill.amountToken;
      const [tokenPriceUsd, solPriceUsd] = await Promise.all([
        this.jupiter.getTokenPriceUsd(params.tokenAddress),
        this.jupiter.getSolPriceUsd(),
      ]);
      const priceUsd = tokenPriceUsd ?? (solPriceUsd ? priceSol * solPriceUsd : null);

      let positionId = params.positionId;
      let persistedPosition = positionId
        ? this.positionTracker.getById(positionId) ?? null
        : null;

      try {
        await db.$transaction(async (tx) => {
          if (!positionId) {
            persistedPosition = await this.positionTracker.createPositionRecord({
              mode: this.runtimeState.scope.mode,
              configProfile: this.runtimeState.scope.configProfile,
              strategy: params.strategy,
              tokenAddress: params.tokenAddress,
              tokenSymbol: params.tokenSymbol,
              entryPriceSol: priceSol,
              entryPriceUsd: priceUsd ?? 0,
              amountSol: fill.amountSol,
              amountToken: fill.amountToken,
              stopLossPercent: getStopLossPercent(params.strategy, this.runtimeState.strategyConfigs),
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
            }, tx);
            positionId = persistedPosition.id;
          } else {
            persistedPosition = await this.positionTracker.applyPositionFill(positionId, {
              additionalSol: fill.amountSol,
              additionalToken: fill.amountToken,
              fillPriceSol: priceSol,
              fillPriceUsd: priceUsd ?? 0,
            }, tx);
          }

          if (!positionId) {
            throw new Error("position persistence failed during buy");
          }

          await tx.trade.create({
            data: {
              mode: this.runtimeState.scope.mode,
              configProfile: this.runtimeState.scope.configProfile,
              strategy: params.strategy,
              tokenAddress: params.tokenAddress,
              tokenSymbol: params.tokenSymbol,
              side: "BUY",
              positionId,
              amountSol: fill.amountSol,
              amountToken: fill.amountToken,
              priceUsd: priceUsd ?? 0,
              priceSol,
              slippageBps: Math.round(quote.priceImpactPct * 100),
              gasFee: config.capital.gasFee,
              jitoTip: jitoTipSol,
              txSignature: txSig,
              trancheNumber: params.trancheNumber ?? 1,
              regime: params.regime,
              walletAddress: params.walletSource,
              platform: params.platform,
              tradeSource: params.tradeSource ?? "AUTO",
              copyLeadMs: params.copyLeadMs ?? null,
            },
          });
        });
      } catch (err) {
        log.error({ err, txSig, token: params.tokenSymbol }, "buy confirmed but persistence failed");
        return { success: false, error: "buy confirmed but persistence failed" };
      }

      if (persistedPosition) {
        this.positionTracker.hydratePosition(persistedPosition);
      }
      this.riskManager.recordBuyExecution(fill.amountSol, fill.feeSol);

      log.info({
        strategy: params.strategy,
        token: params.tokenSymbol,
        amountSol: fill.amountSol,
        priceUsd,
        latencyMs: entryLatencyMs,
        tx: txSig,
      }, "buy executed");

      return {
        success: true,
        txSignature: txSig,
        priceUsd: priceUsd ?? 0,
        priceSol,
        amountToken: fill.amountToken,
        slippageBps: Math.round(quote.priceImpactPct * 100),
        gasFee: config.capital.gasFee,
        jitoTip: jitoTipSol,
      };
    } finally {
      if (shouldTrackPending) this.riskManager.releasePosition(params.strategy);
      if (tokenReservationKey) this.releaseTokenSlot(tokenReservationKey);
    }
  }

  async executeSell(params: SellParams): Promise<TradeResult> {
    const position = this.positionTracker.getById(params.positionId);
    if (!position) return { success: false, error: "position not found" };
    const executionMeta = {
      strategy: params.strategy,
      mode: position.mode,
      configProfile: position.configProfile,
      purpose: "EXECUTION" as const,
      essential: true,
    };

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
    if (quote.priceImpactPct > params.maxSlippageBps / 100) {
      return { success: false, error: `sell slippage too high: ${quote.priceImpactPct}%` };
    }

    const [priorityFee, blockhashInfo] = await Promise.all([
      this.helius.getPriorityFeeEstimate(executionMeta),
      this.helius.getLatestBlockhash(executionMeta),
    ]);
    const jitoTipSol = priorityFee / 1e9;
    const totalFeeSol = config.capital.gasFee + jitoTipSol;
    const swapTx = await this.jupiter.buildSwapTransaction(quote, {
      priorityFee,
      blockhash: blockhashInfo.blockhash,
    });

    if (!swapTx) return { success: false, error: "failed to build sell tx" };
    const simResult = await this.helius.simulateTransaction(swapTx, executionMeta);
    if (!simResult.success) return { success: false, error: "sell tx simulation failed" };

    const txSig = await this.helius.sendTransaction(swapTx, undefined, executionMeta);
    if (!txSig) return { success: false, error: "sell tx submission failed" };

    const confirmed = await this.helius.confirmTransaction(txSig, undefined, executionMeta);
    if (!confirmed) return { success: false, error: "sell tx confirmation failed" };

    const fill = await this.helius.getWalletTradeFillFromSignature(
      txSig,
      config.solana.publicKey,
      params.tokenAddress,
      executionMeta,
    );
    if (!fill || fill.side !== "SELL") {
      return { success: false, error: "sell tx confirmed but fill reconciliation failed" };
    }

    const priceSol = fill.amountSol / fill.amountToken;
    const [tokenPriceUsd, solPriceUsd] = await Promise.all([
      this.jupiter.getTokenPriceUsd(params.tokenAddress),
      this.jupiter.getSolPriceUsd(),
    ]);
    const priceUsd = tokenPriceUsd ?? (solPriceUsd ? priceSol * solPriceUsd : null);

    const pnlSol = fill.amountSol - (position.entryPriceSol * fill.amountToken);
    const resolvedEntryUsd = position.entryPriceUsd > 0
      ? position.entryPriceUsd
      : position.entryPriceSol * (solPriceUsd ?? 0);
    const pnlUsd = priceUsd != null && resolvedEntryUsd > 0
      ? (priceUsd - resolvedEntryUsd) * fill.amountToken
      : pnlSol * (solPriceUsd ?? 0);
    const pnlPercent = ((priceSol - position.entryPriceSol) / position.entryPriceSol) * 100;

    const remaining = Math.max(0, position.remainingToken - fill.amountToken);
    const tranche = params.trancheNumber as 1 | 2 | 3;
    let nextPosition = position;

    try {
      await db.$transaction(async (tx) => {
        const updatedPosition = await this.positionTracker.applyTrancheExit(
          params.positionId,
          tranche,
          remaining,
          tx,
        );
        if (updatedPosition) {
          nextPosition = updatedPosition;
        }

        await tx.trade.create({
          data: {
            mode: position.mode,
            configProfile: position.configProfile,
            strategy: params.strategy,
            tokenAddress: params.tokenAddress,
            tokenSymbol: params.tokenSymbol,
            side: "SELL",
            positionId: params.positionId,
            amountSol: fill.amountSol,
            amountToken: fill.amountToken,
            priceUsd: priceUsd ?? 0,
            priceSol,
            slippageBps: Math.round(quote.priceImpactPct * 100),
            gasFee: config.capital.gasFee,
            jitoTip: jitoTipSol,
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

        if (remaining <= 0) {
          const realized = await tx.trade.aggregate({
            where: { positionId: params.positionId, side: "SELL" },
            _sum: { pnlSol: true, pnlUsd: true },
          });
          const totalPnlSol = Number(realized._sum.pnlSol ?? 0);
          const totalPnlUsd = Number(realized._sum.pnlUsd ?? 0);
          const totalCostUsd = position.amountToken * position.entryPriceUsd;
          const totalPnlPercent = totalCostUsd > 0 ? (totalPnlUsd / totalCostUsd) * 100 : 0;
          const closedPosition = await this.positionTracker.finalizeClosedPosition(
            params.positionId,
            params.exitReason,
            totalPnlSol,
            totalPnlUsd,
            totalPnlPercent,
            tx,
          );
          if (closedPosition) {
            nextPosition = closedPosition;
          }
        }
      });
    } catch (err) {
      log.error({ err, txSig, positionId: params.positionId }, "sell confirmed but persistence failed");
      return { success: false, error: "sell confirmed but persistence failed" };
    }

    if (remaining <= 0) {
      this.positionTracker.removePosition(params.positionId);
    } else {
      this.positionTracker.hydratePosition(nextPosition);
    }
    this.riskManager.recordSellExecution(fill.amountSol, pnlUsd, pnlUsd > 0, fill.feeSol);

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
      amountToken: fill.amountToken,
      gasFee: config.capital.gasFee,
      jitoTip: jitoTipSol,
    };
  }

  private reserveTokenSlot(tokenAddress: string): string | null {
    const key = `${this.runtimeState.scope.mode}:${this.runtimeState.scope.configProfile}:${tokenAddress}`;
    if (this.pendingTokenKeys.has(key)) return null;
    this.pendingTokenKeys.add(key);
    return key;
  }

  private releaseTokenSlot(key: string): void {
    this.pendingTokenKeys.delete(key);
  }

}

function isRuntimeState(value: RuntimeState | ExecutionScope): value is RuntimeState {
  return "capitalConfig" in value;
}
