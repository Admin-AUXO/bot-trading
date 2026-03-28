import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import type { PositionState, Strategy, MarketRegime, ExitReason, TradeMode, TradeSource } from "../utils/types.js";

const log = createChildLogger("position-tracker");

export class PositionTracker {
  private positions: Map<string, PositionState> = new Map();

  async loadOpenPositions(): Promise<void> {
    const rows = await db.position.findMany({
      where: { status: { in: ["OPEN", "PARTIALLY_CLOSED"] } },
    });
    for (const r of rows) {
      this.positions.set(r.id, {
        id: r.id,
        mode: r.mode,
        configProfile: r.configProfile,
        strategy: r.strategy,
        tokenAddress: r.tokenAddress,
        tokenSymbol: r.tokenSymbol,
        entryPriceSol: Number(r.entryPriceSol),
        entryPriceUsd: Number(r.entryPriceUsd),
        currentPriceSol: Number(r.currentPriceSol),
        currentPriceUsd: Number(r.currentPriceUsd),
        amountSol: Number(r.amountSol),
        amountToken: Number(r.amountToken),
        remainingToken: Number(r.remainingToken),
        peakPriceUsd: Number(r.peakPriceUsd),
        stopLossPercent: Number(r.stopLossPercent),
        tranche1Filled: r.tranche1Filled,
        tranche2Filled: r.tranche2Filled,
        exit1Done: r.exit1Done,
        exit2Done: r.exit2Done,
        exit3Done: r.exit3Done,
        status: r.status,
        entryVolume5m: r.entryVolume5m ? Number(r.entryVolume5m) : 0,
        regime: r.regime,
        openedAt: r.openedAt,
        platform: r.platform ?? undefined,
        walletSource: r.walletSource ?? undefined,
        entryLiquidity: r.entryLiquidity ? Number(r.entryLiquidity) : undefined,
        entryMcap: r.entryMcap ? Number(r.entryMcap) : undefined,
        entryHolders: r.entryHolders ?? undefined,
        entryVolume1h: r.entryVolume1h ? Number(r.entryVolume1h) : undefined,
        entryBuyPressure: r.entryBuyPressure ? Number(r.entryBuyPressure) : undefined,
        entryRegime: r.entryRegime ?? undefined,
        entrySlippageBps: r.entrySlippageBps ?? undefined,
        entryLatencyMs: r.entryLatencyMs ?? undefined,
        maxPnlPercent: r.maxPnlPercent ? Number(r.maxPnlPercent) : 0,
        minPnlPercent: r.minPnlPercent ? Number(r.minPnlPercent) : 0,
        tradeSource: r.tradeSource,
      });
    }
    log.info({ count: this.positions.size }, "loaded open positions");
  }

  getAll(): PositionState[] {
    return Array.from(this.positions.values());
  }

  getOpen(mode?: TradeMode): PositionState[] {
    return this.getAll().filter((p) => {
      const statusOk = p.status === "OPEN" || p.status === "PARTIALLY_CLOSED";
      return mode ? statusOk && p.mode === mode : statusOk;
    });
  }

  getByStrategy(strategy: Strategy, mode?: TradeMode): PositionState[] {
    return Array.from(this.positions.values()).filter((p) => {
      if (p.strategy !== strategy) return false;
      const statusOk = p.status === "OPEN" || p.status === "PARTIALLY_CLOSED";
      return mode ? statusOk && p.mode === mode : statusOk;
    });
  }

  getById(id: string): PositionState | undefined {
    return this.positions.get(id);
  }

  holdsToken(tokenAddress: string, mode?: TradeMode): boolean {
    return this.getOpen(mode).some((p) => p.tokenAddress === tokenAddress);
  }

  openCount(mode?: TradeMode): number {
    return this.getOpen(mode).filter((p) => p.tradeSource !== "MANUAL").length;
  }

  countByStrategy(strategy: Strategy, mode?: TradeMode): number {
    return this.getByStrategy(strategy, mode).filter((p) => p.tradeSource !== "MANUAL").length;
  }

  async openPosition(params: {
    strategy: Strategy;
    tokenAddress: string;
    tokenSymbol: string;
    entryPriceSol: number;
    entryPriceUsd: number;
    amountSol: number;
    amountToken: number;
    stopLossPercent: number;
    regime: MarketRegime;
    entryVolume5m?: number;
    platform?: string;
    walletSource?: string;
    mode?: TradeMode;
    configProfile?: string;
    entryLiquidity?: number;
    entryMcap?: number;
    entryHolders?: number;
    entryVolume1h?: number;
    entryBuyPressure?: number;
    entrySlippageBps?: number;
    entryLatencyMs?: number;
    tradeSource?: TradeSource;
  }): Promise<PositionState> {
    const mode = params.mode ?? "LIVE";
    const configProfile = params.configProfile ?? "default";

    const row = await db.position.create({
      data: {
        mode,
        configProfile,
        strategy: params.strategy,
        tokenAddress: params.tokenAddress,
        tokenSymbol: params.tokenSymbol,
        entryPriceSol: params.entryPriceSol,
        entryPriceUsd: params.entryPriceUsd,
        currentPriceSol: params.entryPriceSol,
        currentPriceUsd: params.entryPriceUsd,
        amountSol: params.amountSol,
        amountToken: params.amountToken,
        remainingToken: params.amountToken,
        peakPriceUsd: params.entryPriceUsd,
        stopLossPercent: params.stopLossPercent,
        entryVolume5m: params.entryVolume5m ?? null,
        regime: params.regime,
        platform: params.platform ?? null,
        walletSource: params.walletSource ?? null,
        entryLiquidity: params.entryLiquidity ?? null,
        entryMcap: params.entryMcap ?? null,
        entryHolders: params.entryHolders ?? null,
        entryVolume1h: params.entryVolume1h ?? null,
        entryBuyPressure: params.entryBuyPressure ?? null,
        entryRegime: params.regime,
        entrySlippageBps: params.entrySlippageBps ?? null,
        entryLatencyMs: params.entryLatencyMs ?? null,
        tradeSource: params.tradeSource ?? "AUTO",
        maxPnlPercent: 0,
        minPnlPercent: 0,
        status: "OPEN",
      },
    });

    const pos: PositionState = {
      id: row.id,
      mode: row.mode,
      configProfile: row.configProfile,
      strategy: row.strategy,
      tokenAddress: row.tokenAddress,
      tokenSymbol: row.tokenSymbol,
      entryPriceSol: Number(row.entryPriceSol),
      entryPriceUsd: Number(row.entryPriceUsd),
      currentPriceSol: Number(row.currentPriceSol),
      currentPriceUsd: Number(row.currentPriceUsd),
      amountSol: Number(row.amountSol),
      amountToken: Number(row.amountToken),
      remainingToken: Number(row.remainingToken),
      peakPriceUsd: Number(row.peakPriceUsd),
      stopLossPercent: Number(row.stopLossPercent),
      tranche1Filled: row.tranche1Filled,
      tranche2Filled: row.tranche2Filled,
      exit1Done: row.exit1Done,
      exit2Done: row.exit2Done,
      exit3Done: row.exit3Done,
      status: row.status,
      entryVolume5m: params.entryVolume5m ?? 0,
      regime: row.regime,
      openedAt: row.openedAt,
      platform: row.platform ?? undefined,
      walletSource: row.walletSource ?? undefined,
      entryLiquidity: params.entryLiquidity,
      entryMcap: params.entryMcap,
      entryHolders: params.entryHolders,
      entryVolume1h: params.entryVolume1h,
      entryBuyPressure: params.entryBuyPressure,
      entryRegime: params.regime,
      entrySlippageBps: params.entrySlippageBps,
      entryLatencyMs: params.entryLatencyMs,
      tradeSource: params.tradeSource ?? "AUTO",
      maxPnlPercent: 0,
      minPnlPercent: 0,
    };

    this.positions.set(pos.id, pos);
    log.info({ id: pos.id, strategy: pos.strategy, token: pos.tokenSymbol }, "position opened");
    return pos;
  }

  async updatePrice(id: string, priceSol: number, priceUsd: number): Promise<void> {
    const pos = this.positions.get(id);
    if (!pos) return;

    const pnlPercent = pos.entryPriceUsd > 0
      ? ((priceUsd - pos.entryPriceUsd) / pos.entryPriceUsd) * 100
      : 0;
    const newPeakPrice = priceUsd > pos.peakPriceUsd ? priceUsd : pos.peakPriceUsd;
    const newMaxPnl = (pos.maxPnlPercent === undefined || pnlPercent > pos.maxPnlPercent) ? pnlPercent : pos.maxPnlPercent;
    const newMinPnl = (pos.minPnlPercent === undefined || pnlPercent < pos.minPnlPercent) ? pnlPercent : pos.minPnlPercent;

    await db.position.update({
      where: { id },
      data: {
        currentPriceSol: priceSol,
        currentPriceUsd: priceUsd,
        peakPriceUsd: newPeakPrice,
        maxPnlPercent: newMaxPnl,
        minPnlPercent: newMinPnl,
      },
    });

    pos.currentPriceSol = priceSol;
    pos.currentPriceUsd = priceUsd;
    pos.peakPriceUsd = newPeakPrice;
    pos.maxPnlPercent = newMaxPnl;
    pos.minPnlPercent = newMinPnl;
  }

  async markTrancheExit(id: string, tranche: 1 | 2 | 3, remainingToken: number): Promise<void> {
    const pos = this.positions.get(id);
    if (!pos) return;

    pos.remainingToken = remainingToken;
    const update: Record<string, unknown> = { remainingToken };

    if (tranche === 1) { pos.exit1Done = true; update.exit1Done = true; }
    if (tranche === 2) { pos.exit2Done = true; update.exit2Done = true; }
    if (tranche === 3) { pos.exit3Done = true; update.exit3Done = true; }

    if (remainingToken <= 0) {
      pos.status = "CLOSED";
      update.status = "CLOSED";
    } else {
      pos.status = "PARTIALLY_CLOSED";
      update.status = "PARTIALLY_CLOSED";
    }

    await db.position.update({ where: { id }, data: update });
  }

  async fillTranche2(id: string, additionalToken: number): Promise<void> {
    const pos = this.positions.get(id);
    if (!pos) return;

    pos.tranche2Filled = true;
    pos.amountToken += additionalToken;
    pos.remainingToken += additionalToken;

    await db.position.update({
      where: { id },
      data: {
        tranche2Filled: true,
        amountToken: pos.amountToken,
        remainingToken: pos.remainingToken,
      },
    });
  }

  async closePosition(id: string, exitReason: ExitReason, pnlSol: number, pnlUsd: number, pnlPercent: number): Promise<void> {
    const pos = this.positions.get(id);
    if (!pos) return;

    pos.status = "CLOSED";
    pos.remainingToken = 0;

    await db.position.update({
      where: { id },
      data: {
        status: "CLOSED",
        exitReason,
        pnlSol,
        pnlUsd,
        pnlPercent,
        remainingToken: 0,
        closedAt: new Date(),
      },
    });

    this.positions.delete(id);
    log.info({ id, strategy: pos.strategy, exitReason, pnlUsd }, "position closed");
  }
}
