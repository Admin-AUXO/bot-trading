import Decimal from "decimal.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import {
  defaultStrategyConfigs,
  getExitPlan,
  getMaxSlippageBps,
  getTimeLimitMinutes,
  getTimeStopMinutes,
  type StrategyConfigMap,
} from "../utils/strategy-config.js";
import type { RuntimeState } from "./runtime-state.js";
import type { PositionTracker } from "./position-tracker.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";
import type { JupiterService } from "../services/jupiter.js";
import type { BirdeyeService } from "../services/birdeye.js";
import type { PositionState, ExitReason, TradeData } from "../utils/types.js";

const log = createChildLogger("exit-monitor");

const BATCH_INTERVAL_MS = config.exitMonitor.batchIntervalMs;

export class ExitMonitor {
  private monitoredIds: Set<string> = new Set();
  private batchHandle?: ReturnType<typeof setInterval>;
  private runtimeState: RuntimeState;

  constructor(
    private positionTracker: PositionTracker,
    private tradeExecutor: ITradeExecutor,
    private jupiter: JupiterService,
    private birdeye: BirdeyeService,
    runtimeStateOrConfigs: RuntimeState | StrategyConfigMap,
  ) {
    this.runtimeState = isRuntimeState(runtimeStateOrConfigs)
      ? runtimeStateOrConfigs
      : {
          scope: { mode: config.tradeMode, configProfile: "default" },
          strategyConfigs: runtimeStateOrConfigs ?? defaultStrategyConfigs,
          capitalConfig: config.capital,
        };
  }

  startMonitoring(position: PositionState): void {
    if (this.monitoredIds.has(position.id)) return;
    this.monitoredIds.add(position.id);
    log.info({ id: position.id, strategy: position.strategy }, "monitoring started");

    if (!this.batchHandle) {
      this.batchHandle = setInterval(() => this.batchCheck(), BATCH_INTERVAL_MS);
    }
  }

  stopMonitoring(positionId: string): void {
    this.monitoredIds.delete(positionId);
    if (this.monitoredIds.size === 0 && this.batchHandle) {
      clearInterval(this.batchHandle);
      this.batchHandle = undefined;
    }
  }

  stopAll(): void {
    this.monitoredIds.clear();
    if (this.batchHandle) {
      clearInterval(this.batchHandle);
      this.batchHandle = undefined;
    }
  }

  private async batchCheck(): Promise<void> {
    const toRemove: string[] = [];
    for (const id of this.monitoredIds) {
      const p = this.positionTracker.getById(id);
      if (!p || p.status === "CLOSED") toRemove.push(id);
    }
    toRemove.forEach((id) => this.monitoredIds.delete(id));

    const positions = [...this.monitoredIds]
      .map((id) => this.positionTracker.getById(id))
      .filter((p): p is PositionState => !!p);

    if (positions.length === 0) return;

    const addresses = [...new Set(positions.map((p) => p.tokenAddress))];
    const exitMeta = {
      purpose: "EXIT_MONITOR" as const,
      essential: true,
    };
    const [prices, solPrice, tradeDataMap] = await Promise.all([
      this.birdeye.getMultiPrice(addresses, { ...exitMeta, batchSize: addresses.length }),
      this.jupiter.getSolPriceUsd(),
      this.fetchTradeDataBatch(positions),
    ]);

    const exitPromises: Promise<void>[] = [];

    for (const pos of positions) {
      const priceData = prices.get(pos.tokenAddress);
      const currentPriceUsd = priceData?.value;
      if (!currentPriceUsd) continue;

      const currentPriceSol = solPrice ? currentPriceUsd / solPrice : pos.currentPriceSol;
      const pnlPercent = new Decimal(currentPriceUsd).sub(pos.entryPriceUsd).div(pos.entryPriceUsd).mul(100).toNumber();
      const newPeakPrice = currentPriceUsd > pos.peakPriceUsd ? currentPriceUsd : pos.peakPriceUsd;

      this.positionTracker.updatePrice(pos.id, currentPriceSol, currentPriceUsd);

      const holdMinutes = (Date.now() - pos.openedAt.getTime()) / 60_000;
      const dropFromPeak = newPeakPrice > 0
        ? new Decimal(newPeakPrice).sub(currentPriceUsd).div(newPeakPrice).mul(100).toNumber()
        : 0;
      const slippage = getMaxSlippageBps(pos.strategy, this.runtimeState.strategyConfigs);

      if (pnlPercent <= -pos.stopLossPercent) {
        exitPromises.push(this.executeFullExit(pos, "STOP_LOSS", slippage));
        continue;
      }

      if (this.shouldTimeStop(pos, holdMinutes, pnlPercent)) {
        exitPromises.push(this.executeFullExit(pos, "TIME_STOP", slippage));
        continue;
      }

      if (this.shouldTimeLimit(pos, holdMinutes)) {
        exitPromises.push(this.executeFullExit(pos, "TIME_LIMIT", slippage));
        continue;
      }

      exitPromises.push(this.checkFadeAndScaledExits(pos, pnlPercent, dropFromPeak, slippage, tradeDataMap.get(pos.tokenAddress)));
    }

    const results = await Promise.allSettled(exitPromises);
    for (const result of results) {
      if (result.status === "rejected") {
        log.error({ err: result.reason instanceof Error ? result.reason.message : String(result.reason) }, "exit promise rejected");
      }
    }
  }

  private async fetchTradeDataBatch(positions: PositionState[]): Promise<Map<string, TradeData>> {
    const needsData = positions.filter((p) => p.strategy === "S3_MOMENTUM" && p.entryVolume5m && p.entryVolume5m > 0);
    if (needsData.length === 0) return new Map();
    const fetched = await Promise.all(needsData.map((p) => this.birdeye.getTradeData(p.tokenAddress, {
      strategy: p.strategy,
      mode: p.mode,
      configProfile: p.configProfile,
      purpose: "EXIT_MONITOR",
      essential: true,
    })));
    const map = new Map<string, TradeData>();
    needsData.forEach((p, i) => {
      if (fetched[i]) map.set(p.tokenAddress, fetched[i]!);
    });
    return map;
  }

  private shouldTimeStop(pos: PositionState, holdMinutes: number, pnlPercent: number): boolean {
    const timeStopMinutes = getTimeStopMinutes(pos.strategy, this.runtimeState.strategyConfigs);
    const pnlThreshold = pos.strategy === "S3_MOMENTUM" ? config.exitMonitor.timeStopPnlS3Pct : config.exitMonitor.timeStopPnlDefaultPct;
    return holdMinutes >= timeStopMinutes && pnlPercent < pnlThreshold;
  }

  private shouldTimeLimit(pos: PositionState, holdMinutes: number): boolean {
    const limitMinutes = getTimeLimitMinutes(pos.strategy, this.runtimeState.strategyConfigs);
    return holdMinutes >= limitMinutes;
  }

  private async checkFadeAndScaledExits(
    pos: PositionState,
    pnlPercent: number,
    dropFromPeak: number,
    slippage: number,
    tradeData: TradeData | undefined,
  ): Promise<void> {
    if (pos.entryVolume5m && pos.entryVolume5m > 0 && tradeData) {
      const volumeRatio = new Decimal(tradeData.volume5m).div(pos.entryVolume5m).toNumber();
      const threshold = pos.strategy === "S3_MOMENTUM" ? config.exitMonitor.fadeVolumeRatioS3 : config.exitMonitor.fadeVolumeRatioDefault;
      if (volumeRatio < threshold) {
        await this.executeFullExit(pos, "FADE_EXIT", slippage);
        return;
      }
    }

    await this.checkScaledExits(pos, pnlPercent, dropFromPeak, slippage);
  }

  private async checkScaledExits(
    pos: PositionState,
    pnlPercent: number,
    dropFromPeak: number,
    slippage: number,
  ): Promise<void> {
    const exitPlan = getExitPlan(pos.strategy, this.runtimeState.strategyConfigs);

    if (pos.strategy === "S1_COPY") {
      const f = config.exitMonitor.exitFractions.s1;
      if (!pos.exit1Done && pnlPercent >= exitPlan.tp1ThresholdPct) {
        await this.executePartialExit(pos, 1, f.tp1, "TAKE_PROFIT_T1", slippage);
      } else if (!pos.exit2Done && pos.exit1Done && pnlPercent >= exitPlan.tp2ThresholdPct) {
        await this.executePartialExit(pos, 2, f.tp2, "TAKE_PROFIT_T2", slippage);
      } else if (pos.exit1Done && pos.exit2Done && dropFromPeak >= exitPlan.trailingStopPercent) {
        await this.executeFullExit(pos, "TRAILING_STOP", slippage);
      }
    }

    if (pos.strategy === "S2_GRADUATION") {
      const f = config.exitMonitor.exitFractions.s2;
      if (!pos.exit1Done && pnlPercent >= exitPlan.tp1ThresholdPct) {
        await this.executePartialExit(pos, 1, f.tp1, "TAKE_PROFIT_T1", slippage);
      } else if (!pos.exit2Done && pos.exit1Done && pnlPercent >= exitPlan.tp2ThresholdPct) {
        await this.executePartialExit(pos, 2, f.tp2, "TAKE_PROFIT_T2", slippage);
      } else if (pos.exit1Done && pos.exit2Done && dropFromPeak >= exitPlan.trailingStopPercent) {
        await this.executeFullExit(pos, "TRAILING_STOP", slippage);
      }
    }

    if (pos.strategy === "S3_MOMENTUM") {
      const f = config.exitMonitor.exitFractions.s3;
      if (!pos.exit1Done && pnlPercent >= exitPlan.tp1ThresholdPct) {
        await this.executePartialExit(pos, 1, f.tp1, "TAKE_PROFIT_T1", slippage);
      } else if (!pos.exit2Done && pos.exit1Done && pnlPercent >= exitPlan.tp2ThresholdPct) {
        await this.executePartialExit(pos, 2, f.tp2, "TAKE_PROFIT_T2", slippage);
      } else if (pos.exit1Done && pos.exit2Done && dropFromPeak >= exitPlan.trailingStopPercent) {
        await this.executeFullExit(pos, "TRAILING_STOP", slippage);
      }
    }
  }

  private async executePartialExit(
    pos: PositionState,
    tranche: 1 | 2 | 3,
    sellFraction: number,
    exitReason: ExitReason,
    slippage: number,
  ): Promise<void> {
    const sellAmount = pos.remainingToken * sellFraction;
    await this.tradeExecutor.executeSell({
      positionId: pos.id,
      tokenAddress: pos.tokenAddress,
      tokenSymbol: pos.tokenSymbol,
      strategy: pos.strategy,
      amountToken: sellAmount,
      maxSlippageBps: slippage,
      exitReason,
      trancheNumber: tranche,
    });
  }

  private async executeFullExit(pos: PositionState, exitReason: ExitReason, slippage: number): Promise<void> {
    const result = await this.tradeExecutor.executeSell({
      positionId: pos.id,
      tokenAddress: pos.tokenAddress,
      tokenSymbol: pos.tokenSymbol,
      strategy: pos.strategy,
      amountToken: pos.remainingToken,
      maxSlippageBps: slippage,
      exitReason,
      trancheNumber: 3,
    });

    if (result.success) {
      this.stopMonitoring(pos.id);
      return;
    }

    log.warn({ id: pos.id, exitReason, error: result.error }, "full exit failed; keeping position monitored");
  }

}

function isRuntimeState(value: RuntimeState | StrategyConfigMap): value is RuntimeState {
  return "capitalConfig" in value;
}
