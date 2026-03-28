import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import type { ApiBudgetManager } from "../core/api-budget-manager.js";
import type { BirdeyeService } from "./birdeye.js";

const log = createChildLogger("outcome-tracker");

const BACKFILL_INTERVAL_MS = config.outcomeTracker.backfillIntervalMs;
const BATCH_SIZE = config.outcomeTracker.batchSize;

const OUTCOME_DELAYS = [
  { field: "priceAfter1m", prevField: null, minutes: 1 },
  { field: "priceAfter5m", prevField: "priceAfter1m", minutes: 5 },
  { field: "priceAfter15m", prevField: "priceAfter5m", minutes: 15 },
  { field: "priceAfter1h", prevField: "priceAfter15m", minutes: 60 },
] as const;

interface PendingOutcome {
  id: string;
  table: "signal" | "position" | "walletActivity" | "graduationEvent";
  tokenAddress: string;
  createdAt: Date;
  delayMinutes: number;
  field: string;
}

export class OutcomeTracker {
  private intervalHandle?: ReturnType<typeof setInterval>;
  private backfillInFlight = false;
  private wouldHaveWonInFlight = false;

  constructor(
    private birdeye: BirdeyeService,
    private budgetManager?: ApiBudgetManager,
  ) {}

  start(): void {
    this.intervalHandle = setInterval(() => this.runBackfill(), BACKFILL_INTERVAL_MS);
    log.info("outcome tracker started");
  }

  stop(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private async runBackfill(): Promise<void> {
    if (this.backfillInFlight) return;
    this.backfillInFlight = true;
    try {
      if (this.budgetManager && !this.budgetManager.shouldRunNonEssential("BIRDEYE")) return;
      await Promise.allSettled([
        this.backfillSignals(),
        this.backfillPositions(),
        this.backfillWalletActivity(),
        this.backfillGraduationEvents(),
      ]);
    } catch (err) {
      log.error({ err }, "backfill cycle failed");
    } finally {
      this.backfillInFlight = false;
    }
  }

  private async backfillSignals(): Promise<void> {
    const pending = await this.findPendingSignals();
    if (pending.length === 0) return;

    const addresses = [...new Set(pending.map((p) => p.tokenAddress))];
    const prices = await this.birdeye.getMultiPrice(addresses, { purpose: "BACKFILL", essential: false, batchSize: addresses.length });

    const updates = [];
    for (const item of pending) {
      const price = prices.get(item.tokenAddress);
      if (!price) continue;

      const elapsed = (Date.now() - item.createdAt.getTime()) / 60_000;
      const update: Record<string, unknown> = {};

      if (elapsed >= 5 && item.field === "priceAfter5m") {
        update.priceAfter5m = price.value;
      } else if (elapsed >= 15 && item.field === "priceAfter15m") {
        update.priceAfter15m = price.value;
      } else if (elapsed >= 60 && item.field === "priceAfter1h") {
        update.priceAfter1h = price.value;
      }

      if (Object.keys(update).length > 0) {
        updates.push(db.signal.update({ where: { id: item.id }, data: update }));
      }
    }

    if (updates.length > 0) await db.$transaction(updates);
  }

  private async findPendingSignals(): Promise<PendingOutcome[]> {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60_000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
    const maxAge = new Date(now.getTime() - config.outcomeTracker.maxSignalAgeHours * 60 * 60_000);

    const results: PendingOutcome[] = [];

    const need5m = await db.signal.findMany({
      where: { priceAfter5m: null, detectedAt: { gte: maxAge, lte: fiveMinAgo } },
      select: { id: true, tokenAddress: true, detectedAt: true },
      take: BATCH_SIZE,
    });
    for (const s of need5m) {
      results.push({ id: s.id, table: "signal", tokenAddress: s.tokenAddress, createdAt: s.detectedAt, delayMinutes: 5, field: "priceAfter5m" });
    }

    const need15m = await db.signal.findMany({
      where: { priceAfter5m: { not: null }, priceAfter15m: null, detectedAt: { gte: maxAge, lte: fifteenMinAgo } },
      select: { id: true, tokenAddress: true, detectedAt: true },
      take: BATCH_SIZE,
    });
    for (const s of need15m) {
      results.push({ id: s.id, table: "signal", tokenAddress: s.tokenAddress, createdAt: s.detectedAt, delayMinutes: 15, field: "priceAfter15m" });
    }

    const need1h = await db.signal.findMany({
      where: { priceAfter15m: { not: null }, priceAfter1h: null, detectedAt: { gte: maxAge, lte: oneHourAgo } },
      select: { id: true, tokenAddress: true, detectedAt: true },
      take: BATCH_SIZE,
    });
    for (const s of need1h) {
      results.push({ id: s.id, table: "signal", tokenAddress: s.tokenAddress, createdAt: s.detectedAt, delayMinutes: 60, field: "priceAfter1h" });
    }

    return results;
  }

  private async backfillPositions(): Promise<void> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
    const maxAge = new Date(now.getTime() - config.outcomeTracker.maxPositionAgeHours * 60 * 60_000);

    const need1h = await db.position.findMany({
      where: { priceAfter1h: null, status: "CLOSED", closedAt: { gte: maxAge, lte: oneHourAgo } },
      select: { id: true, tokenAddress: true, closedAt: true },
      take: BATCH_SIZE,
    });

    if (need1h.length === 0) return;

    const addresses = [...new Set(need1h.map((p) => p.tokenAddress))];
    const prices = await this.birdeye.getMultiPrice(addresses, { purpose: "BACKFILL", essential: false, batchSize: addresses.length });

    const updates = need1h
      .filter((pos) => prices.get(pos.tokenAddress))
      .map((pos) => db.position.update({ where: { id: pos.id }, data: { priceAfter1h: prices.get(pos.tokenAddress)!.value } }));

    if (updates.length > 0) await db.$transaction(updates);
  }

  private async backfillWalletActivity(): Promise<void> {
    const now = new Date();
    const maxAge = new Date(now.getTime() - config.outcomeTracker.maxSignalAgeHours * 60 * 60_000);

    for (const delay of OUTCOME_DELAYS) {
      const cutoff = new Date(now.getTime() - delay.minutes * 60_000);
      const where: Record<string, unknown> = {
        [delay.field]: null,
        detectedAt: { gte: maxAge, lte: cutoff },
      };
      if (delay.prevField) {
        where[delay.prevField] = { not: null };
      }

      const pending = await db.walletActivity.findMany({
        where,
        select: { id: true, tokenAddress: true },
        take: BATCH_SIZE,
      });

      if (pending.length === 0) continue;

      const addresses = [...new Set(pending.map((p: { tokenAddress: string }) => p.tokenAddress))];
      const prices = await this.birdeye.getMultiPrice(addresses, { purpose: "BACKFILL", essential: false, batchSize: addresses.length });

      const updates = pending
        .filter((item) => prices.get(item.tokenAddress))
        .map((item) => db.walletActivity.update({
          where: { id: item.id },
          data: { [delay.field]: prices.get(item.tokenAddress)!.value },
        }));

      if (updates.length > 0) await db.$transaction(updates);
    }
  }

  private async backfillGraduationEvents(): Promise<void> {
    const now = new Date();
    const maxAge = new Date(now.getTime() - config.outcomeTracker.maxSignalAgeHours * 60 * 60_000);

    for (const delay of OUTCOME_DELAYS) {
      const cutoff = new Date(now.getTime() - delay.minutes * 60_000);
      const where: Record<string, unknown> = {
        [delay.field]: null,
        graduatedAt: { gte: maxAge, lte: cutoff },
      };
      if (delay.prevField) {
        where[delay.prevField] = { not: null };
      }

      const pending = await db.graduationEvent.findMany({
        where,
        select: { id: true, tokenAddress: true, priceAtGrad: true, graduatedAt: true },
        take: BATCH_SIZE,
      });

      if (pending.length === 0) continue;

      const addresses = [...new Set(pending.map((p: { tokenAddress: string }) => p.tokenAddress))];
      const prices = await this.birdeye.getMultiPrice(addresses, { purpose: "BACKFILL", essential: false, batchSize: addresses.length });

      const updates = [];
      for (const item of pending) {
        const price = prices.get(item.tokenAddress);
        if (!price) continue;

        const update: Record<string, unknown> = { [delay.field]: price.value };

        if (delay.field === "priceAfter1h" && item.priceAtGrad && price.value < Number(item.priceAtGrad) * config.outcomeTracker.rugThreshold) {
          update.rugDetected = true;
          update.rugTimeMinutes = Math.round((now.getTime() - item.graduatedAt.getTime()) / 60_000);
        }

        updates.push(db.graduationEvent.update({ where: { id: item.id }, data: update }));
      }

      if (updates.length > 0) await db.$transaction(updates);
    }
  }

  async backfillWouldHaveWon(): Promise<void> {
    if (this.wouldHaveWonInFlight) return;
    this.wouldHaveWonInFlight = true;
    try {
      const pending = await db.signal.findMany({
        where: {
          passed: false,
          wouldHaveWon: null,
          priceAfter1h: { not: null },
          priceAtSignal: { not: null },
        },
        select: { id: true, strategy: true, priceAtSignal: true, priceAfter1h: true },
        take: BATCH_SIZE * 5,
      });

      const updates = [];
      for (const signal of pending) {
        const entryPrice = Number(signal.priceAtSignal);
        const priceAfter = Number(signal.priceAfter1h);
        if (entryPrice <= 0) continue;

        const pnlPercent = ((priceAfter - entryPrice) / entryPrice) * 100;

        const winThreshold = config.outcomeTracker.wouldHaveWonPct[signal.strategy] ?? config.outcomeTracker.wouldHaveWonPct["S3_MOMENTUM"];

        updates.push(db.signal.update({
          where: { id: signal.id },
          data: { wouldHaveWon: pnlPercent >= winThreshold },
        }));
      }

      if (updates.length > 0) await db.$transaction(updates);

      if (pending.length > 0) {
        log.info({ count: pending.length }, "backfilled wouldHaveWon");
      }
    } finally {
      this.wouldHaveWonInFlight = false;
    }
  }
}
