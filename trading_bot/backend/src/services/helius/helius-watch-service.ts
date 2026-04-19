import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../../db/client.js";
import { env } from "../../config/env.js";
import { recordOperatorEvent } from "../operator-events.js";
import { ProviderBudgetService } from "../provider-budget-service.js";
import { SharedTokenFactsService } from "../shared-token-facts.js";
import {
  HeliusMigrationWatcher,
  type HeliusMigrationWatcherTelemetryEvent,
} from "../helius-migration-watcher.js";
import type { BotSettings } from "../../types/domain.js";

type HeliusWatchServiceDeps = {
  getSettings: () => Promise<BotSettings>;
  getPauseReason: () => Promise<string | null>;
  triggerDiscovery: () => Promise<void>;
  dbClient?: HeliusWatchDb;
  migrationWatcher?: HeliusMigrationWatcher;
  nowMs?: () => number;
  providerBudget?: ProviderBudgetService;
  recordEvent?: typeof recordOperatorEvent;
  sharedFacts?: SharedTokenFactsService;
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
  migrationWatcherStarted: boolean;
  configuredProgramCount: number;
  activeSubscriptionCount: number;
  observedLogCountSinceBoot: number;
  trackedWalletCount: number;
  recentSmartWalletEvents24h: number;
  recentSmartWalletSignals24h: number;
  lastSmartWalletSignalAt: string | null;
  lastMigrationSignalAt: string | null;
  lastObservedLogAt: string | null;
  lastWebhookAt: string | null;
  lastDuplicateEventAt: string | null;
  lastReplayEventAt: string | null;
  duplicateEventsSinceBoot: number;
  replayedEventsSinceBoot: number;
  trackedWalletReconciledAt: string | null;
  webhookSecretConfigured: boolean;
  smartWalletFundingStatus: "dead_schema";
};

export type SmartWalletMintActivity = {
  sellWalletCount90s: number;
  netAmountUsd90s: number;
  netAmountUsd15m: number;
  hasTrackedSell30m: boolean;
};

export class HeliusWatchService {
  private readonly dbClient: HeliusWatchDb;
  private readonly nowMs: () => number;
  private readonly providerBudget: ProviderBudgetService;
  private readonly recordEvent: typeof recordOperatorEvent;
  private readonly sharedFacts: SharedTokenFactsService;
  private readonly migrationWatcher: HeliusMigrationWatcher;
  private readonly recentWebhookDigests = new Map<string, number>();
  private pendingStreamBytes = 0;
  private lastWebhookAtMs = 0;
  private lastDuplicateEventAtMs = 0;
  private lastReplayEventAtMs = 0;
  private duplicateEventsSinceBoot = 0;
  private replayedEventsSinceBoot = 0;
  private trackedWalletReconciledAtMs = 0;

  constructor(private readonly deps: HeliusWatchServiceDeps) {
    this.dbClient = deps.dbClient ?? db;
    this.nowMs = deps.nowMs ?? Date.now;
    this.providerBudget = deps.providerBudget ?? new ProviderBudgetService();
    this.recordEvent = deps.recordEvent ?? recordOperatorEvent;
    this.sharedFacts = deps.sharedFacts ?? new SharedTokenFactsService();
    this.migrationWatcher = deps.migrationWatcher ?? new HeliusMigrationWatcher(
      env.HELIUS_RPC_URL,
      env.HELIUS_MIGRATION_WATCH_PROGRAM_IDS,
      env.HELIUS_MIGRATION_WATCH_DEBOUNCE_MS,
      async ({ programId, signature }) => this.handleMigrationSignal(programId, signature),
      (event) => {
        void this.handleMigrationTelemetry(event);
      },
    );
  }

  async start(): Promise<void> {
    await this.reconcileTrackedWallets();
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
    this.recordWebhookIngest("smart-wallet", body);
    if (this.wasRecentWebhookReplay("smart-wallet", rawBody)) {
      return { ok: true, inserted: 0 };
    }

    const parsed = this.parseSmartWalletEvents(body);
    if (parsed.length === 0) {
      return { ok: true, inserted: 0 };
    }

    const deduped = dedupeSmartWalletEvents(parsed);
    const duplicatedInPayload = parsed.length - deduped.length;
    if (duplicatedInPayload > 0) {
      this.noteDuplicateEvents(duplicatedInPayload);
    }

    await this.ensureWalletRows(deduped.map((event) => event.walletAddress));
    const inserted = deduped.length > 0
      ? (await this.dbClient.smartWalletEvent.createMany({
        data: deduped.map((event) => ({
          walletAddress: event.walletAddress,
          mint: event.mint,
          side: event.side,
          amountUsd: event.amountUsd,
          slot: event.slot,
          txSignature: event.txSignature,
          metadata: event.metadata,
        })),
        skipDuplicates: true,
      })).count
      : 0;

    const replayedEvents = deduped.length - inserted;
    if (replayedEvents > 0) {
      this.noteReplayEvents(replayedEvents);
    }

    const touchedMints = [...new Set(deduped.map((event) => event.mint))];
    await Promise.all(touchedMints.map((mint) => this.maybeRecordSmartMoneySignal(mint)));
    return { ok: true, inserted };
  }

  async ingestLpWebhook(body: unknown, rawBody: string, signature: string | undefined): Promise<{ ok: true }> {
    this.verifySignature(rawBody, signature);
    this.recordWebhookIngest("lp", body);
    if (this.wasRecentWebhookReplay("lp", rawBody)) {
      return { ok: true };
    }
    const event = asRecord(body);
    const mint = readString(event, "mint") ?? readString(event, "tokenMint") ?? "unknown";
    const removed = readBoolean(event, "removed")
      ?? (readNumber(event, "reserveAfter") ?? 1) <= 0;
    if (removed) {
      await this.recordEvent({
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
    this.recordWebhookIngest("holders", body);
    if (this.wasRecentWebhookReplay("holders", rawBody)) {
      return { ok: true };
    }
    const event = asRecord(body);
    const mint = readString(event, "mint") ?? "unknown";
    const deltaPercent = readNumber(event, "holderDeltaPercent")
      ?? readHolderDeltaPercent(event);
    if (deltaPercent != null && deltaPercent <= -20) {
      await this.recordEvent({
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
    const migrationStatus = this.migrationWatcher.getStatus();
    const since24h = new Date(Date.now() - (24 * 60 * 60 * 1000));
    const [walletCount, eventCount, signalCount, lastSignal, lastMigration] = await Promise.all([
      this.dbClient.smartWallet.count({ where: { active: true } }),
      this.dbClient.smartWalletEvent.count({ where: { receivedAt: { gte: since24h } } }),
      this.dbClient.operatorEvent.count({
        where: {
          kind: "smart_money_signal",
          createdAt: { gte: since24h },
        },
      }),
      this.dbClient.operatorEvent.findFirst({
        where: { kind: "smart_money_signal" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      this.dbClient.sharedTokenFactMigrationSignal.findFirst({
        orderBy: { observedAt: "desc" },
        select: { observedAt: true },
      }),
    ]);
    return {
      migrationWatcherEnabled: env.HELIUS_MIGRATION_WATCHER_ENABLED,
      migrationWatcherStarted: migrationStatus.started,
      configuredProgramCount: migrationStatus.configuredProgramCount,
      activeSubscriptionCount: migrationStatus.activeSubscriptionCount,
      observedLogCountSinceBoot: migrationStatus.observedLogCount,
      trackedWalletCount: walletCount,
      recentSmartWalletEvents24h: eventCount,
      recentSmartWalletSignals24h: signalCount,
      lastSmartWalletSignalAt: lastSignal?.createdAt.toISOString() ?? null,
      lastMigrationSignalAt: lastMigration?.observedAt.toISOString() ?? null,
      lastObservedLogAt: migrationStatus.lastObservedLogAt,
      lastWebhookAt: toIsoString(this.lastWebhookAtMs),
      lastDuplicateEventAt: toIsoString(this.lastDuplicateEventAtMs),
      lastReplayEventAt: toIsoString(this.lastReplayEventAtMs),
      duplicateEventsSinceBoot: this.duplicateEventsSinceBoot,
      replayedEventsSinceBoot: this.replayedEventsSinceBoot,
      trackedWalletReconciledAt: toIsoString(this.trackedWalletReconciledAtMs),
      webhookSecretConfigured: Boolean(env.HELIUS_WEBHOOK_SECRET),
      smartWalletFundingStatus: "dead_schema",
    };
  }

  async getMintActivityMap(mints: string[]): Promise<Map<string, SmartWalletMintActivity>> {
    const uniqueMints = [...new Set(mints.filter((value) => value.trim().length > 0))];
    const result = new Map<string, SmartWalletMintActivity>();
    if (uniqueMints.length === 0) {
      return result;
    }

    const since30m = new Date(Date.now() - (30 * 60 * 1000));
    const rows = await this.dbClient.smartWalletEvent.findMany({
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
    try {
      await this.sharedFacts.rememberMigrationSignal({ programId, signature });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        this.noteReplayEvents(1);
        return;
      }
      throw error;
    }

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

    await this.recordEvent({
      kind: "provider_signal",
      title: "Helius migration signal",
      detail: `Observed watched migration program ${programId}; triggering an immediate discovery sweep.`,
      metadata: { programId, signature },
    });
    await this.deps.triggerDiscovery();
  }

  private async reconcileTrackedWallets(): Promise<void> {
    const addresses = [...new Set(env.HELIUS_SMART_WALLET_ADDRESSES.map((value) => value.trim()).filter(Boolean))];
    await this.ensureWalletRows(addresses);
    await this.dbClient.smartWallet.updateMany({
      where: {
        source: "helius_webhook",
        active: true,
        ...(addresses.length > 0 ? { address: { notIn: addresses } } : {}),
      },
      data: {
        active: false,
        refreshedAt: new Date(this.nowMs()),
      },
    });
    this.trackedWalletReconciledAtMs = this.nowMs();
  }

  private async ensureWalletRows(addresses: string[]): Promise<void> {
    const unique = [...new Set(addresses.map((value) => value.trim()).filter(Boolean))];
    if (unique.length === 0) {
      return;
    }
    await Promise.all(unique.map((address) => this.dbClient.smartWallet.upsert({
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
      this.dbClient.smartWalletEvent.findMany({
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
      this.dbClient.smartWalletEvent.count({
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

    const latest = await this.dbClient.operatorEvent.findFirst({
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

    await this.recordEvent({
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

  private recordWebhookIngest(kind: "smart-wallet" | "lp" | "holders", body: unknown): void {
    this.lastWebhookAtMs = this.nowMs();
    const creditsUsed = normalizePayloadRecords(body).length;
    if (creditsUsed <= 0) {
      return;
    }
    this.recordHeliusUsage("WEBHOOK", `webhook:${kind}`, creditsUsed);
  }

  private wasRecentWebhookReplay(kind: "smart-wallet" | "lp" | "holders", rawBody: string): boolean {
    const now = this.nowMs();
    this.trimWebhookDigests(now);
    const digest = crypto.createHash("sha1").update(`${kind}:${rawBody}`).digest("hex");
    const seenAt = this.recentWebhookDigests.get(digest);
    this.recentWebhookDigests.set(digest, now);
    if (seenAt != null) {
      this.noteReplayEvents(1);
      return true;
    }
    return false;
  }

  private trimWebhookDigests(now: number): void {
    const ttlMs = 15 * 60 * 1000;
    for (const [digest, seenAt] of this.recentWebhookDigests.entries()) {
      if (now - seenAt > ttlMs) {
        this.recentWebhookDigests.delete(digest);
      }
    }
  }

  private noteDuplicateEvents(count: number): void {
    this.duplicateEventsSinceBoot += count;
    this.lastDuplicateEventAtMs = this.nowMs();
  }

  private noteReplayEvents(count: number): void {
    this.replayedEventsSinceBoot += count;
    this.lastReplayEventAtMs = this.nowMs();
  }

  private recordHeliusUsage(
    purpose: "DISCOVERY" | "WEBHOOK",
    endpoint: string,
    creditsUsed: number,
    mint?: string,
  ): void {
    if (creditsUsed <= 0) {
      return;
    }
    const slot = this.providerBudget.requestSlot("HELIUS", purpose, {
      endpoint,
      mint,
    });
    this.providerBudget.releaseSlot(slot.id, {
      endpoint,
      creditsUsed,
      httpStatus: 200,
      latencyMs: 0,
    });
  }

  private async handleMigrationTelemetry(event: HeliusMigrationWatcherTelemetryEvent): Promise<void> {
    if (event.type === "subscription_opened") {
      this.recordHeliusUsage("DISCOVERY", "logsSubscribe", 1);
      return;
    }

    if (event.type !== "log_observed" || event.payloadBytes <= 0) {
      return;
    }

    this.pendingStreamBytes += event.payloadBytes;
    const fullChunks = Math.floor(this.pendingStreamBytes / 100_000);
    if (fullChunks <= 0) {
      return;
    }
    this.pendingStreamBytes -= fullChunks * 100_000;
    this.recordHeliusUsage("DISCOVERY", "logsStream", fullChunks * 2);
  }
}

type HeliusWatchDb = Pick<
  typeof db,
  "operatorEvent" | "sharedTokenFactMigrationSignal" | "smartWallet" | "smartWalletEvent"
>;

function dedupeSmartWalletEvents(events: ParsedSmartWalletEvent[]): ParsedSmartWalletEvent[] {
  const deduped = new Map<string, ParsedSmartWalletEvent>();
  for (const event of events) {
    const key = `${event.walletAddress}:${event.txSignature}:${event.side}`;
    if (!deduped.has(key)) {
      deduped.set(key, event);
    }
  }
  return [...deduped.values()];
}

function toIsoString(valueMs: number): string | null {
  return valueMs > 0 ? new Date(valueMs).toISOString() : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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
