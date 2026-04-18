import crypto from "node:crypto";
import { db } from "../../db/client.js";
import { env } from "../../config/env.js";
import { recordOperatorEvent } from "../operator-events.js";
import { SharedTokenFactsService } from "../shared-token-facts.js";
import { HeliusMigrationWatcher } from "../helius-migration-watcher.js";
import type { BotSettings } from "../../types/domain.js";

type HeliusWatchServiceDeps = {
  getSettings: () => Promise<BotSettings>;
  getPauseReason: () => Promise<string | null>;
  triggerDiscovery: () => Promise<void>;
};

type ParsedSmartWalletEvent = {
  walletAddress: string;
  mint: string;
  side: "BUY" | "SELL";
  amountUsd: number;
  slot: bigint | null;
  txSignature: string;
  metadata: Record<string, unknown>;
};

export type HeliusWatchSummary = {
  migrationWatcherEnabled: boolean;
  trackedWalletCount: number;
  recentSmartWalletEvents24h: number;
  recentSmartWalletSignals24h: number;
  lastSmartWalletSignalAt: string | null;
  lastMigrationSignalAt: string | null;
  webhookSecretConfigured: boolean;
};

export type SmartWalletMintActivity = {
  sellWalletCount90s: number;
  netAmountUsd90s: number;
  netAmountUsd15m: number;
  hasTrackedSell30m: boolean;
};

export class HeliusWatchService {
  private readonly sharedFacts = new SharedTokenFactsService();
  private readonly migrationWatcher = new HeliusMigrationWatcher(
    env.HELIUS_RPC_URL,
    env.HELIUS_MIGRATION_WATCH_PROGRAM_IDS,
    env.HELIUS_MIGRATION_WATCH_DEBOUNCE_MS,
    async ({ programId, signature }) => this.handleMigrationSignal(programId, signature),
  );

  constructor(private readonly deps: HeliusWatchServiceDeps) {}

  async start(): Promise<void> {
    await this.ensureTrackedWallets();
    await this.migrationWatcher.start();
  }

  async stop(): Promise<void> {
    await this.migrationWatcher.stop();
  }

  verifySignature(rawBody: string, signature: string | undefined): void {
    if (!env.HELIUS_WEBHOOK_SECRET) {
      throw new Error("HELIUS_WEBHOOK_SECRET is required for Helius webhook ingestion");
    }
    if (!signature) {
      throw new Error("x-helius-signature is required");
    }
    const expected = crypto
      .createHmac("sha256", env.HELIUS_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    const actual = signature.trim().toLowerCase();
    if (expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
      throw new Error("invalid helius webhook signature");
    }
  }

  async ingestSmartWalletWebhook(body: unknown, rawBody: string, signature: string | undefined): Promise<{ ok: true; inserted: number }> {
    this.verifySignature(rawBody, signature);
    const parsed = this.parseSmartWalletEvents(body);
    if (parsed.length === 0) {
      return { ok: true, inserted: 0 };
    }

    await this.ensureWalletRows(parsed.map((event) => event.walletAddress));
    await db.smartWalletEvent.createMany({
      data: parsed.map((event) => ({
        walletAddress: event.walletAddress,
        mint: event.mint,
        side: event.side,
        amountUsd: event.amountUsd,
        slot: event.slot,
        txSignature: event.txSignature,
        metadata: event.metadata,
      })),
      skipDuplicates: true,
    });

    const touchedMints = [...new Set(parsed.map((event) => event.mint))];
    await Promise.all(touchedMints.map((mint) => this.maybeRecordSmartMoneySignal(mint)));
    return { ok: true, inserted: parsed.length };
  }

  async ingestLpWebhook(body: unknown, rawBody: string, signature: string | undefined): Promise<{ ok: true }> {
    this.verifySignature(rawBody, signature);
    const event = asRecord(body);
    const mint = readString(event, "mint") ?? readString(event, "tokenMint") ?? "unknown";
    const removed = readBoolean(event, "removed")
      ?? (readNumber(event, "reserveAfter") ?? 1) <= 0;
    if (removed) {
      await recordOperatorEvent({
        kind: "lp_removed",
        level: "warning",
        title: "LP removal signal",
        detail: `Helius webhook flagged LP removal pressure for ${mint}.`,
        metadata: event,
      });
    }
    return { ok: true };
  }

  async ingestHoldersWebhook(body: unknown, rawBody: string, signature: string | undefined): Promise<{ ok: true }> {
    this.verifySignature(rawBody, signature);
    const event = asRecord(body);
    const mint = readString(event, "mint") ?? "unknown";
    const deltaPercent = readNumber(event, "holderDeltaPercent")
      ?? readHolderDeltaPercent(event);
    if (deltaPercent != null && deltaPercent <= -20) {
      await recordOperatorEvent({
        kind: "holder_dump",
        level: "warning",
        title: "Holder dump signal",
        detail: `Tracked holder flow for ${mint} dropped ${Math.abs(deltaPercent).toFixed(1)}%.`,
        metadata: event,
      });
    }
    return { ok: true };
  }

  async getSummary(): Promise<HeliusWatchSummary> {
    const since24h = new Date(Date.now() - (24 * 60 * 60 * 1000));
    const [walletCount, eventCount, signalCount, lastSignal, lastMigration] = await Promise.all([
      db.smartWallet.count({ where: { active: true } }),
      db.smartWalletEvent.count({ where: { receivedAt: { gte: since24h } } }),
      db.operatorEvent.count({
        where: {
          kind: "smart_money_signal",
          createdAt: { gte: since24h },
        },
      }),
      db.operatorEvent.findFirst({
        where: { kind: "smart_money_signal" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      db.sharedTokenFactMigrationSignal.findFirst({
        orderBy: { observedAt: "desc" },
        select: { observedAt: true },
      }),
    ]);
    return {
      migrationWatcherEnabled: env.HELIUS_MIGRATION_WATCHER_ENABLED,
      trackedWalletCount: walletCount,
      recentSmartWalletEvents24h: eventCount,
      recentSmartWalletSignals24h: signalCount,
      lastSmartWalletSignalAt: lastSignal?.createdAt.toISOString() ?? null,
      lastMigrationSignalAt: lastMigration?.observedAt.toISOString() ?? null,
      webhookSecretConfigured: Boolean(env.HELIUS_WEBHOOK_SECRET),
    };
  }

  async getMintActivityMap(mints: string[]): Promise<Map<string, SmartWalletMintActivity>> {
    const uniqueMints = [...new Set(mints.filter((value) => value.trim().length > 0))];
    const result = new Map<string, SmartWalletMintActivity>();
    if (uniqueMints.length === 0) {
      return result;
    }

    const since30m = new Date(Date.now() - (30 * 60 * 1000));
    const rows = await db.smartWalletEvent.findMany({
      where: {
        mint: { in: uniqueMints },
        receivedAt: { gte: since30m },
      },
      select: {
        mint: true,
        side: true,
        amountUsd: true,
        walletAddress: true,
        receivedAt: true,
      },
    });

    for (const mint of uniqueMints) {
      const mintRows = rows.filter((row) => row.mint === mint);
      const since15m = Date.now() - (15 * 60 * 1000);
      const since90s = Date.now() - 90_000;
      const ninetySecondSells = mintRows.filter((row) => row.side === "SELL" && row.receivedAt.getTime() >= since90s);
      const fifteenMinuteRows = mintRows.filter((row) => row.receivedAt.getTime() >= since15m);
      result.set(mint, {
        sellWalletCount90s: new Set(ninetySecondSells.map((row) => row.walletAddress)).size,
        netAmountUsd90s: sumNetUsd(ninetySecondSells),
        netAmountUsd15m: sumNetUsd(fifteenMinuteRows),
        hasTrackedSell30m: mintRows.some((row) => row.side === "SELL"),
      });
    }

    return result;
  }

  private async handleMigrationSignal(programId: string, signature: string): Promise<void> {
    await this.sharedFacts.rememberMigrationSignal({ programId, signature });

    const [settings, pauseReason] = await Promise.all([
      this.deps.getSettings(),
      this.deps.getPauseReason(),
    ]);
    if (
      settings.tradeMode !== "LIVE"
      || pauseReason
      || !settings.strategy.heliusWatcherEnabled
    ) {
      return;
    }

    await recordOperatorEvent({
      kind: "provider_signal",
      title: "Helius migration signal",
      detail: `Observed watched migration program ${programId}; triggering an immediate discovery sweep.`,
      metadata: { programId, signature },
    });
    await this.deps.triggerDiscovery();
  }

  private async ensureTrackedWallets(): Promise<void> {
    if (env.HELIUS_SMART_WALLET_ADDRESSES.length === 0) {
      return;
    }
    await this.ensureWalletRows(env.HELIUS_SMART_WALLET_ADDRESSES);
  }

  private async ensureWalletRows(addresses: string[]): Promise<void> {
    const unique = [...new Set(addresses.map((value) => value.trim()).filter(Boolean))];
    if (unique.length === 0) {
      return;
    }
    await Promise.all(unique.map((address) => db.smartWallet.upsert({
      where: { address },
      update: {
        active: true,
        refreshedAt: new Date(),
        source: "helius_webhook",
      },
      create: {
        address,
        label: shortWalletLabel(address),
        active: true,
        refreshedAt: new Date(),
        source: "helius_webhook",
      },
    })));
  }

  private parseSmartWalletEvents(payload: unknown): ParsedSmartWalletEvent[] {
    const records = normalizePayloadRecords(payload);
    return records.flatMap((record) => {
      const walletAddress = readString(record, "walletAddress")
        ?? readString(record, "wallet")
        ?? readString(record, "owner")
        ?? readString(record, "signer");
      const mint = readString(record, "mint")
        ?? readNestedString(record, ["token", "mint"])
        ?? readNestedString(record, ["swap", "mint"]);
      const side = normalizeSide(readString(record, "side") ?? readString(record, "type"));
      const amountUsd = readNumber(record, "amountUsd")
        ?? readNumber(record, "usdValue")
        ?? readNestedNumber(record, ["swap", "amountUsd"]);
      const txSignature = readString(record, "txSignature")
        ?? readString(record, "signature")
        ?? readString(record, "txnSignature");
      if (!walletAddress || !mint || !side || amountUsd == null || !txSignature) {
        return [];
      }
      return [{
        walletAddress,
        mint,
        side,
        amountUsd,
        slot: readBigInt(record, "slot"),
        txSignature,
        metadata: record,
      }];
    });
  }

  private async maybeRecordSmartMoneySignal(mint: string): Promise<void> {
    const since15m = new Date(Date.now() - (15 * 60 * 1000));
    const since30m = new Date(Date.now() - (30 * 60 * 1000));
    const [recentBuys, recentSells] = await Promise.all([
      db.smartWalletEvent.findMany({
        where: {
          mint,
          side: "BUY",
          receivedAt: { gte: since15m },
        },
        select: {
          walletAddress: true,
          amountUsd: true,
        },
      }),
      db.smartWalletEvent.count({
        where: {
          mint,
          side: "SELL",
          receivedAt: { gte: since30m },
        },
      }),
    ]);
    const distinctWallets = new Set(recentBuys.map((row) => row.walletAddress));
    const netBuyUsd = recentBuys.reduce((sum, row) => sum + Number(row.amountUsd), 0);
    if (distinctWallets.size < 2 || netBuyUsd < 3_000 || recentSells > 0) {
      return;
    }

    const latest = await db.operatorEvent.findFirst({
      where: {
        kind: "smart_money_signal",
        entityId: mint,
        createdAt: { gte: since15m },
      },
      select: { id: true },
    });
    if (latest) {
      return;
    }

    await recordOperatorEvent({
      kind: "smart_money_signal",
      level: "warning",
      title: "Smart money signal",
      detail: `${distinctWallets.size} tracked wallets bought ${mint} for ${netBuyUsd.toFixed(0)} USD net in 15m.`,
      entityType: "mint",
      entityId: mint,
      metadata: {
        mint,
        walletCount: distinctWallets.size,
        netBuyUsd,
      },
    });
  }
}

function shortWalletLabel(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function normalizePayloadRecords(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  const events = payload.events;
  if (Array.isArray(events)) {
    return events.filter(isRecord);
  }
  const transactions = payload.transactions;
  if (Array.isArray(transactions)) {
    return transactions.filter(isRecord);
  }
  return [payload];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBigInt(record: Record<string, unknown>, key: string): bigint | null {
  const value = record[key];
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }
  return null;
}

function readNestedString(record: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function readNestedNumber(record: Record<string, unknown>, path: string[]): number | null {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function normalizeSide(value: string | null): "BUY" | "SELL" | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized.includes("BUY")) {
    return "BUY";
  }
  if (normalized.includes("SELL")) {
    return "SELL";
  }
  return null;
}

function readHolderDeltaPercent(record: Record<string, unknown>): number | null {
  const before = readNumber(record, "balanceBefore");
  const after = readNumber(record, "balanceAfter");
  if (before == null || before <= 0 || after == null) {
    return null;
  }
  return ((after - before) / before) * 100;
}

function sumNetUsd(rows: Array<{ side: "BUY" | "SELL"; amountUsd: number | { toString(): string } }>): number {
  return rows.reduce((sum, row) => {
    const amountUsd = Number(row.amountUsd);
    return sum + (row.side === "BUY" ? amountUsd : -amountUsd);
  }, 0);
}
