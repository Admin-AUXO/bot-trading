import { db } from "../db/client.js";
import { createChildLogger } from "../utils/logger.js";
import type { PositionState, Strategy, MarketRegime, ExitReason, TradeMode, TradeSource } from "../utils/types.js";
import type { Prisma } from "@prisma/client";

const log = createChildLogger("position-tracker");

interface PositionFilter {
  mode?: TradeMode;
  configProfile?: string;
}

export class PositionTracker {
  private positions: Map<string, PositionState> = new Map();
  private openIdsByScope: Map<string, Set<string>> = new Map();
  private openIdsByStrategyScope: Map<string, Set<string>> = new Map();
  private openIdsByTokenScope: Map<string, string> = new Map();

  async loadOpenPositions(filter?: PositionFilter): Promise<void> {
    const where: Record<string, unknown> = {
      status: { in: ["OPEN", "PARTIALLY_CLOSED"] },
    };
    if (filter?.mode) where.mode = filter.mode;
    if (filter?.configProfile) where.configProfile = filter.configProfile;

    const rows = await db.position.findMany({ where });
    const nextPositions = new Map<string, PositionState>();
    for (const r of rows) {
      nextPositions.set(r.id, {
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
    this.positions = nextPositions;
    this.rebuildIndexes();
    log.info({ count: nextPositions.size }, "loaded open positions");
  }

  getAll(): PositionState[] {
    return Array.from(this.positions.values());
  }

  private matchesFilter(position: PositionState, filter?: PositionFilter): boolean {
    if (!filter) return true;
    if (filter.mode && position.mode !== filter.mode) return false;
    if (filter.configProfile && position.configProfile !== filter.configProfile) return false;
    return true;
  }

  getOpen(filter?: PositionFilter): PositionState[] {
    const indexedIds = this.getIndexedIdsForScope(filter);
    if (indexedIds) {
      return [...indexedIds]
        .map((id) => this.positions.get(id))
        .filter((position): position is PositionState => !!position);
    }

    return this.getAll().filter((p) => {
      const statusOk = p.status === "OPEN" || p.status === "PARTIALLY_CLOSED";
      return statusOk && this.matchesFilter(p, filter);
    });
  }

  getByStrategy(strategy: Strategy, filter?: PositionFilter): PositionState[] {
    const indexedIds = this.getIndexedIdsForStrategyScope(strategy, filter);
    if (indexedIds) {
      return [...indexedIds]
        .map((id) => this.positions.get(id))
        .filter((position): position is PositionState => !!position);
    }

    return Array.from(this.positions.values()).filter((p) => {
      if (p.strategy !== strategy) return false;
      const statusOk = p.status === "OPEN" || p.status === "PARTIALLY_CLOSED";
      return statusOk && this.matchesFilter(p, filter);
    });
  }

  getById(id: string): PositionState | undefined {
    return this.positions.get(id);
  }

  hydratePosition(position: PositionState): void {
    this.positions.set(position.id, position);
    this.rebuildIndexes();
  }

  removePosition(id: string): void {
    this.positions.delete(id);
    this.rebuildIndexes();
  }

  async createPositionRecord(
    params: {
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
    },
    tx: Prisma.TransactionClient = db,
  ): Promise<PositionState> {
    const mode = params.mode ?? "LIVE";
    const configProfile = params.configProfile ?? "default";

    const row = await tx.position.create({
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

    return {
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
  }

  async applyPositionFill(
    id: string,
    fill: {
      additionalSol: number;
      additionalToken: number;
      fillPriceSol: number;
      fillPriceUsd: number;
    },
    tx: Prisma.TransactionClient = db,
  ): Promise<PositionState | null> {
    const pos = this.positions.get(id);
    if (!pos) return null;

    const nextPosition = this.buildFilledPositionState(pos, fill);

    await tx.position.update({
      where: { id },
      data: {
        tranche2Filled: true,
        amountSol: nextPosition.amountSol,
        amountToken: nextPosition.amountToken,
        remainingToken: nextPosition.remainingToken,
        entryPriceSol: nextPosition.entryPriceSol,
        entryPriceUsd: nextPosition.entryPriceUsd,
        currentPriceSol: nextPosition.currentPriceSol,
        currentPriceUsd: nextPosition.currentPriceUsd,
        peakPriceUsd: nextPosition.peakPriceUsd,
      },
    });

    return nextPosition;
  }

  async applyTrancheExit(
    id: string,
    tranche: 1 | 2 | 3,
    remainingToken: number,
    tx: Prisma.TransactionClient = db,
  ): Promise<PositionState | null> {
    const pos = this.positions.get(id);
    if (!pos) return null;

    const nextPosition = this.buildExitedPositionState(pos, tranche, remainingToken);
    const update: Record<string, unknown> = {
      remainingToken: nextPosition.remainingToken,
      status: nextPosition.status,
    };

    if (tranche === 1) update.exit1Done = true;
    if (tranche === 2) update.exit2Done = true;
    if (tranche === 3) update.exit3Done = true;

    await tx.position.update({ where: { id }, data: update });
    return nextPosition;
  }

  async finalizeClosedPosition(
    id: string,
    exitReason: ExitReason,
    pnlSol: number,
    pnlUsd: number,
    pnlPercent: number,
    tx: Prisma.TransactionClient = db,
  ): Promise<PositionState | null> {
    const pos = this.positions.get(id);
    if (!pos) return null;

    const nextPosition: PositionState = {
      ...pos,
      status: "CLOSED",
      remainingToken: 0,
    };

    await tx.position.update({
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

    return nextPosition;
  }

  holdsToken(tokenAddress: string, filter?: PositionFilter): boolean {
    const scopeKey = this.buildScopeKey(filter);
    if (scopeKey) {
      return this.openIdsByTokenScope.has(this.tokenScopeKey(tokenAddress, scopeKey));
    }
    return this.getOpen(filter).some((p) => p.tokenAddress === tokenAddress);
  }

  openCount(filter?: PositionFilter): number {
    const indexedIds = this.getIndexedIdsForScope(filter);
    if (indexedIds) return indexedIds.size;
    return this.getOpen(filter).length;
  }

  countByStrategy(strategy: Strategy, filter?: PositionFilter): number {
    const indexedIds = this.getIndexedIdsForStrategyScope(strategy, filter);
    if (indexedIds) return indexedIds.size;
    return this.getByStrategy(strategy, filter).length;
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
    const pos = await this.createPositionRecord(params);
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

  async fillPosition(id: string, fill: {
    additionalSol: number;
    additionalToken: number;
    fillPriceSol: number;
    fillPriceUsd: number;
  }): Promise<void> {
    const nextPosition = await this.applyPositionFill(id, fill);
    if (!nextPosition) return;
    this.positions.set(id, nextPosition);
  }

  async closePosition(id: string, exitReason: ExitReason, pnlSol: number, pnlUsd: number, pnlPercent: number): Promise<void> {
    const pos = await this.finalizeClosedPosition(id, exitReason, pnlSol, pnlUsd, pnlPercent);
    if (!pos) return;
    this.positions.delete(id);
    log.info({ id, strategy: pos.strategy, exitReason, pnlUsd }, "position closed");
  }

  private buildFilledPositionState(
    pos: PositionState,
    fill: {
      additionalSol: number;
      additionalToken: number;
      fillPriceSol: number;
      fillPriceUsd: number;
    },
  ): PositionState {
    const totalToken = pos.amountToken + fill.additionalToken;
    const weightedPriceSol = totalToken > 0
      ? (pos.entryPriceSol * pos.amountToken + fill.fillPriceSol * fill.additionalToken) / totalToken
      : pos.entryPriceSol;
    const weightedPriceUsd = totalToken > 0
      ? (pos.entryPriceUsd * pos.amountToken + fill.fillPriceUsd * fill.additionalToken) / totalToken
      : pos.entryPriceUsd;

    return {
      ...pos,
      tranche2Filled: true,
      amountSol: pos.amountSol + fill.additionalSol,
      amountToken: totalToken,
      remainingToken: pos.remainingToken + fill.additionalToken,
      entryPriceSol: weightedPriceSol,
      entryPriceUsd: weightedPriceUsd,
      currentPriceSol: fill.fillPriceSol,
      currentPriceUsd: fill.fillPriceUsd,
      peakPriceUsd: Math.max(pos.peakPriceUsd, fill.fillPriceUsd),
    };
  }

  private buildExitedPositionState(
    pos: PositionState,
    tranche: 1 | 2 | 3,
    remainingToken: number,
  ): PositionState {
    const nextPosition: PositionState = {
      ...pos,
      remainingToken,
      status: remainingToken <= 0 ? "CLOSED" : "PARTIALLY_CLOSED",
    };

    if (tranche === 1) nextPosition.exit1Done = true;
    if (tranche === 2) nextPosition.exit2Done = true;
    if (tranche === 3) nextPosition.exit3Done = true;

    return nextPosition;
  }

  private rebuildIndexes(): void {
    this.openIdsByScope.clear();
    this.openIdsByStrategyScope.clear();
    this.openIdsByTokenScope.clear();

    for (const position of this.positions.values()) {
      if (position.status !== "OPEN" && position.status !== "PARTIALLY_CLOSED") continue;

      const scopeKey = this.scopeKey(position.mode, position.configProfile);
      this.addToSetMap(this.openIdsByScope, scopeKey, position.id);
      this.addToSetMap(this.openIdsByStrategyScope, this.strategyScopeKey(position.strategy, scopeKey), position.id);
      this.openIdsByTokenScope.set(this.tokenScopeKey(position.tokenAddress, scopeKey), position.id);
    }
  }

  private addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
    const existing = map.get(key);
    if (existing) {
      existing.add(value);
      return;
    }

    map.set(key, new Set([value]));
  }

  private getIndexedIdsForScope(filter?: PositionFilter): Set<string> | null {
    const scopeKey = this.buildScopeKey(filter);
    if (!scopeKey) return null;
    return this.openIdsByScope.get(scopeKey) ?? new Set();
  }

  private getIndexedIdsForStrategyScope(strategy: Strategy, filter?: PositionFilter): Set<string> | null {
    const scopeKey = this.buildScopeKey(filter);
    if (!scopeKey) return null;
    return this.openIdsByStrategyScope.get(this.strategyScopeKey(strategy, scopeKey)) ?? new Set();
  }

  private buildScopeKey(filter?: PositionFilter): string | null {
    if (!filter?.mode || !filter.configProfile) return null;
    return this.scopeKey(filter.mode, filter.configProfile);
  }

  private scopeKey(mode: TradeMode, configProfile: string): string {
    return `${mode}:${configProfile}`;
  }

  private strategyScopeKey(strategy: Strategy, scopeKey: string): string {
    return `${strategy}:${scopeKey}`;
  }

  private tokenScopeKey(tokenAddress: string, scopeKey: string): string {
    return `${tokenAddress}:${scopeKey}`;
  }
}
