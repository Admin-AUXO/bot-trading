import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

type ProviderName = "BIRDEYE" | "HELIUS";
type SectionName = "providers" | "timing" | "all";

interface CliOptions {
  section: SectionName;
  provider: ProviderName | "all";
  token?: string;
  graduationToken?: string;
  wallet?: string;
  signature?: string;
  pair?: string;
  full: boolean;
  json: boolean;
}

interface HistoryStats {
  totalCalls: number;
  totalCredits: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  cacheRate: number | null;
  errorRate: number | null;
}

interface AuditContext {
  primaryToken: string | null;
  graduationToken: string | null;
  wallet: string | null;
  signature: string | null;
  pairAddress: string | null;
}

interface LoggedApiCall {
  service: ProviderName;
  endpoint: string;
  credits: number;
  requestedCredits?: number;
  cacheHit?: boolean;
  batchSize?: number;
  statusCode?: number;
  latencyMs?: number;
  success?: boolean;
}

interface ProbeRunResult {
  status: "ok" | "skipped" | "error";
  reason?: string;
  coldLatencyMs?: number;
  warmLatencyMs?: number | null;
  loggedCalls: LoggedApiCall[];
  sample?: Record<string, unknown>;
  fieldCoverage?: {
    present: string[];
    missing: string[];
  };
}

interface ProbeDescriptor {
  id: string;
  provider: ProviderName;
  endpoint: string;
  label: string;
  fullOnly?: boolean;
  needs?: Array<keyof AuditContext>;
  warmCache?: boolean;
  runtimeConsumers: string[];
  usedFields?: string[];
  dormantNote?: string;
  call: (context: AuditContext) => Promise<unknown>;
  summarize: (value: unknown) => Record<string, unknown> | null;
  recommendation: (args: { history: HistoryStats; run: ProbeRunResult }) => string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    section: "all",
    provider: "all",
    full: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    const readValue = (): string | undefined => {
      if (arg.includes("=")) return arg.split("=", 2)[1];
      if (next && !next.startsWith("--")) {
        index += 1;
        return next;
      }
      return undefined;
    };

    switch (true) {
      case arg.startsWith("--section"):
        options.section = (readValue() as SectionName | undefined) ?? options.section;
        break;
      case arg.startsWith("--provider"):
        options.provider = (readValue() as ProviderName | "all" | undefined) ?? options.provider;
        break;
      case arg.startsWith("--token"):
        options.token = readValue();
        break;
      case arg.startsWith("--graduation-token"):
        options.graduationToken = readValue();
        break;
      case arg.startsWith("--wallet"):
        options.wallet = readValue();
        break;
      case arg.startsWith("--signature"):
        options.signature = readValue();
        break;
      case arg.startsWith("--pair"):
        options.pair = readValue();
        break;
      case arg === "--full":
        options.full = true;
        break;
      case arg === "--json":
        options.json = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function percentile(values: number[], pct: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index];
}

function formatMs(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value)}ms`;
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function compactObject(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value) return null;
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ""),
  );
}

function readPath(source: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function buildFieldCoverage(source: Record<string, unknown> | null, usedFields: string[] | undefined) {
  if (!source || !usedFields || usedFields.length === 0) return undefined;
  const present: string[] = [];
  const missing: string[] = [];

  for (const field of usedFields) {
    const value = readPath(source, field);
    if (value === null || value === undefined || value === "") {
      missing.push(field);
      continue;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      missing.push(field);
      continue;
    }
    present.push(field);
  }

  return { present, missing };
}

function printHeader(title: string): void {
  process.stdout.write(`\n${title}\n`);
}

function printLine(line: string = ""): void {
  process.stdout.write(`${line}\n`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, "..");

function loadBackendEnv(): string | null {
  const candidates = [".env", ".env.local", ".env.docker"];
  for (const candidate of candidates) {
    const resolved = path.join(backendDir, candidate);
    if (!fs.existsSync(resolved)) continue;
    loadDotenv({ path: resolved, override: false });
    return resolved;
  }
  return null;
}

const envPath = loadBackendEnv();
const cli = parseArgs(process.argv.slice(2));

const [
  { db },
  { config },
  { ApiBudgetManager },
  { BirdeyeService },
  { HeliusService },
] = await Promise.all([
  import("../src/db/client.js"),
  import("../src/config/index.js"),
  import("../src/core/api-budget-manager.js"),
  import("../src/services/birdeye.js"),
  import("../src/services/helius.js"),
]);

class MemoryApiCallBuffer {
  calls: LoggedApiCall[] = [];

  log(call: LoggedApiCall): void {
    this.calls.push(call);
  }

  stop(): void {}
}

async function getHistoryStats(service: ProviderName, endpoint: string): Promise<HistoryStats> {
  const [aggregate, recent] = await Promise.all([
    db.apiCall.aggregate({
      where: { service, endpoint },
      _count: { _all: true },
      _sum: { credits: true },
      _avg: { latencyMs: true },
    }),
    db.apiCall.findMany({
      where: { service, endpoint },
      orderBy: { calledAt: "desc" },
      take: 1000,
      select: {
        latencyMs: true,
        cacheHit: true,
        success: true,
      },
    }),
  ]);

  const latencies = recent
    .map((row) => (typeof row.latencyMs === "number" ? row.latencyMs : null))
    .filter((value): value is number => value !== null);
  const cached = recent.filter((row) => row.cacheHit).length;
  const failed = recent.filter((row) => row.success === false).length;

  return {
    totalCalls: aggregate._count._all ?? 0,
    totalCredits: Number(aggregate._sum.credits ?? 0),
    avgLatencyMs: typeof aggregate._avg.latencyMs === "number" ? aggregate._avg.latencyMs : null,
    p95LatencyMs: percentile(latencies, 95),
    cacheRate: recent.length > 0 ? cached / recent.length : null,
    errorRate: recent.length > 0 ? failed / recent.length : null,
  };
}

async function resolveContext(): Promise<AuditContext> {
  const [signals, s2Signals, graduationEvent, eliteWallet, walletActivity, recentTrade] = await Promise.all([
    db.signal.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        tokenAddress: true,
        filterResults: true,
      },
    }),
    db.signal.findFirst({
      where: { strategy: "S2_GRADUATION" },
      orderBy: { createdAt: "desc" },
      select: { tokenAddress: true },
    }),
    db.graduationEvent.findFirst({
      orderBy: { graduatedAt: "desc" },
      select: { tokenAddress: true },
    }),
    db.walletScore.findFirst({
      where: { isElite: true },
      orderBy: { scoredAt: "desc" },
      select: { walletAddress: true },
    }),
    db.walletActivity.findFirst({
      orderBy: { detectedAt: "desc" },
      select: { walletAddress: true, txSignature: true },
    }),
    db.trade.findFirst({
      orderBy: { executedAt: "desc" },
      select: { txSignature: true },
    }),
  ]);

  const pairAddress = cli.pair ?? signals
    .map((signal) => signal.filterResults as Record<string, unknown> | null)
    .find((filterResults) => typeof filterResults?.pairAddress === "string")
    ?.pairAddress as string | undefined;

  return {
    primaryToken: cli.token ?? signals.find((signal) => !!signal.tokenAddress)?.tokenAddress ?? null,
    graduationToken: cli.graduationToken ?? s2Signals?.tokenAddress ?? graduationEvent?.tokenAddress ?? cli.token ?? null,
    wallet: cli.wallet ?? eliteWallet?.walletAddress ?? walletActivity?.walletAddress ?? config.solana.publicKey ?? null,
    signature: cli.signature ?? walletActivity?.txSignature ?? recentTrade?.txSignature ?? null,
    pairAddress: pairAddress ?? null,
  };
}

function summaryFromArray(items: unknown[], itemPreviewKeys: string[]): Record<string, unknown> {
  const first = items[0];
  const preview = first && typeof first === "object"
    ? Object.fromEntries(
        itemPreviewKeys
          .map((key) => [key, (first as Record<string, unknown>)[key]])
          .filter(([, value]) => value !== undefined),
      )
    : null;

  return compactObject({
    count: items.length,
    first: preview,
  }) ?? {};
}

async function main(): Promise<void> {
  const buffer = new MemoryApiCallBuffer();
  const budgetManager = new ApiBudgetManager(buffer as never);
  let dbAvailable = true;
  let dbError: string | null = null;
  try {
    await budgetManager.loadState();
  } catch (error) {
    dbAvailable = false;
    dbError = error instanceof Error ? error.message : String(error);
  }

  const birdeye = new BirdeyeService(budgetManager);
  const helius = new HeliusService(budgetManager);
  const context = dbAvailable
    ? await resolveContext()
    : {
        primaryToken: cli.token ?? null,
        graduationToken: cli.graduationToken ?? cli.token ?? null,
        wallet: cli.wallet ?? config.solana.publicKey ?? null,
        signature: cli.signature ?? null,
        pairAddress: cli.pair ?? null,
      };

  const meta = {
    mode: config.tradeMode,
    configProfile: "default",
    purpose: "ANALYTICS" as const,
    essential: false,
  };

  const descriptors: ProbeDescriptor[] = [
    {
      id: "birdeye-credits",
      provider: "BIRDEYE",
      endpoint: "/utils/v1/credits",
      label: "Birdeye credits usage",
      warmCache: true,
      runtimeConsumers: ["quota sync in runtime intervals"],
      usedFields: ["used", "remaining", "cycleStart", "cycleEnd"],
      call: () => birdeye.getCreditsUsage(meta),
      summarize: (value) => compactObject(value as Record<string, unknown> | null),
      recommendation: ({ history, run }) => {
        if (run.status !== "ok") return "Keep, but live probe was skipped or failed.";
        return history.totalCalls > 0
          ? "Keep. This endpoint is cheap and is the only direct provider-side quota sanity check."
          : "Keep. Low-cost probe with direct quota value.";
      },
    },
    {
      id: "birdeye-meme-list",
      provider: "BIRDEYE",
      endpoint: "/defi/v3/token/meme/list",
      label: "Birdeye meme list",
      warmCache: true,
      runtimeConsumers: ["S2 catch-up scan"],
      usedFields: ["count", "first.address", "first.symbol", "first.progressPercent", "first.graduated", "first.creator"],
      call: () => birdeye.getMemeTokenList({ graduated: true, limit: 5 }, { ...meta, batchSize: 5 }),
      summarize: (value) => summaryFromArray(Array.isArray(value) ? value : [], ["address", "symbol", "progressPercent", "graduated", "creator"]),
      recommendation: ({ history }) => history.totalCredits > 0
        ? "Keep, but only on catch-up paths. At 100 CU a call, this should stay off the hot loop."
        : "Keep behind catch-up only. This is discovery coverage, not a hot-path scorer.",
    },
    {
      id: "birdeye-meme-detail",
      provider: "BIRDEYE",
      endpoint: "/defi/v3/token/meme/detail/single",
      label: "Birdeye meme detail",
      needs: ["graduationToken"],
      warmCache: true,
      runtimeConsumers: ["S2 recent-seed detail checks", "S2 pending graduation rechecks"],
      usedFields: ["address", "symbol", "source", "progressPercent", "graduated", "realSolReserves", "creator"],
      call: (auditContext) => birdeye.getMemeTokenDetail(auditContext.graduationToken!, meta),
      summarize: (value) => compactObject(value as Record<string, unknown> | null),
      recommendation: ({ history, run }) => {
        if (run.fieldCoverage?.missing.length) {
          return "Keep, but verify parser coverage. Missing expected fields make this spend weaker.";
        }
        return history.totalCredits > 0
          ? "Keep. This is the cheapest way S2 confirms a recent seed is worth any later paid scoring."
          : "Keep for S2 gatekeeping.";
      },
    },
    {
      id: "birdeye-overview",
      provider: "BIRDEYE",
      endpoint: "/defi/token_overview",
      label: "Birdeye token overview",
      needs: ["primaryToken"],
      warmCache: true,
      runtimeConsumers: ["S1 filters", "S2 delayed entry", "S3 entry filters"],
      usedFields: ["address", "symbol", "price", "volume5m", "volume1h", "liquidity", "marketCap", "holder", "buyPercent", "priceChange1h"],
      call: (auditContext) => birdeye.getTokenOverview(auditContext.primaryToken!, meta),
      summarize: (value) => compactObject(value as Record<string, unknown> | null),
      recommendation: ({ history }) => history.avgLatencyMs && history.avgLatencyMs > 500
        ? "Keep, but only after cheap DEX prefilters. This endpoint is broadly useful but historically slow."
        : "Keep. High-value core scorer for every active entry strategy.",
    },
    {
      id: "birdeye-trade-data",
      provider: "BIRDEYE",
      endpoint: "/defi/v3/token/trade-data/single",
      label: "Birdeye trade data",
      needs: ["primaryToken"],
      warmCache: true,
      runtimeConsumers: ["S1 filters", "S2 delayed entry", "S3 entry filters", "S3 fade exits slow path"],
      usedFields: ["volume5m", "volumeHistory5m", "volumeBuy5m", "trade5m", "buy5m", "uniqueWallet5m"],
      call: (auditContext) => birdeye.getTradeData(auditContext.primaryToken!, meta),
      summarize: (value) => compactObject(value as Record<string, unknown> | null),
      recommendation: ({ history }) => history.avgLatencyMs && history.avgLatencyMs > 500
        ? "Keep, but ration it. This is decision-grade data with a non-trivial latency bill."
        : "Keep. This endpoint carries the live participation and buy-pressure checks the strategies actually use.",
    },
    {
      id: "birdeye-security",
      provider: "BIRDEYE",
      endpoint: "/defi/token_security",
      label: "Birdeye token security",
      needs: ["primaryToken"],
      warmCache: true,
      runtimeConsumers: ["S1 token safety", "S3 token safety"],
      usedFields: ["top10HolderPercent", "freezeable", "mintAuthority", "transferFeeEnable", "mutableMetadata", "totalSupply"],
      call: (auditContext) => birdeye.getTokenSecurity(auditContext.primaryToken!, meta),
      summarize: (value) => compactObject(value as Record<string, unknown> | null),
      recommendation: ({ history }) => history.totalCredits > 0
        ? "Keep. Safety checks are worth the spend, but keep them behind DEX and liquidity prefilters."
        : "Keep for safety gating.",
    },
    {
      id: "birdeye-holders",
      provider: "BIRDEYE",
      endpoint: "/defi/v3/token/holder",
      label: "Birdeye top holders",
      needs: ["primaryToken"],
      warmCache: true,
      runtimeConsumers: ["S1 top-holder check", "S3 top-holder check"],
      usedFields: ["count", "first.address", "first.percent", "first.balanceUi"],
      call: (auditContext) => birdeye.getTokenHolders(auditContext.primaryToken!, 5, { ...meta, batchSize: 5 }),
      summarize: (value) => summaryFromArray(Array.isArray(value) ? value : [], ["address", "percent", "balanceUi"]),
      recommendation: ({ history }) => history.totalCredits > 0
        ? "Keep, but stay at low limits. The strategy only needs concentration checks, not a full holder census."
        : "Keep with tiny batch sizes only.",
    },
    {
      id: "birdeye-new-listings",
      provider: "BIRDEYE",
      endpoint: "/defi/v2/tokens/new_listing",
      label: "Birdeye new listings",
      fullOnly: true,
      warmCache: true,
      runtimeConsumers: ["S2 fallback scan when feature-flagged on"],
      dormantNote: "Feature-flagged fallback, disabled by default.",
      usedFields: ["count", "first.address", "first.symbol"],
      call: () => birdeye.getNewListings(meta),
      summarize: (value) => summaryFromArray(Array.isArray(value) ? value : [], ["address", "symbol", "source"]),
      recommendation: () => "Only use when recent-seed discovery is failing. This is expensive fallback coverage, not a normal lane.",
    },
    {
      id: "helius-signatures",
      provider: "HELIUS",
      endpoint: "getSignaturesForAddress",
      label: "Helius signatures for address",
      needs: ["wallet"],
      runtimeConsumers: ["S1 wallet activity discovery", "S1 waterline priming"],
      usedFields: ["count", "first.signature", "first.slot", "first.blockTime"],
      call: async (auditContext) => {
        const rows = await helius.getSignaturesForAddressIncremental(auditContext.wallet!, 5, { ...meta, batchSize: 5 });
        const firstSignature = (rows[0] as Record<string, unknown> | undefined)?.signature;
        if (!context.signature && typeof firstSignature === "string") {
          context.signature = firstSignature;
        }
        return rows;
      },
      summarize: (value) => summaryFromArray(Array.isArray(value) ? value : [], ["signature", "slot", "blockTime"]),
      recommendation: ({ history }) => history.totalCredits > 0
        ? "Keep. This is the cheapest Helius primitive on the S1 detection path."
        : "Keep for S1 discovery.",
    },
    {
      id: "helius-transaction",
      provider: "HELIUS",
      endpoint: "getTransaction",
      label: "Helius transaction decode",
      needs: ["signature"],
      runtimeConsumers: ["S1 wallet trade reconstruction", "buy fill reconciliation", "sell fill reconciliation"],
      usedFields: ["slot", "blockTime", "meta.fee", "transaction.message"],
      call: (auditContext) => helius.getTransaction(auditContext.signature!, meta),
      summarize: (value) => {
        const record = value as Record<string, unknown> | null;
        if (!record) return null;
        return compactObject({
          slot: record.slot,
          blockTime: record.blockTime,
          fee: (record.meta as Record<string, unknown> | undefined)?.fee,
          accountKeyCount: Array.isArray(((record.transaction as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.accountKeys)
            ? ((((record.transaction as Record<string, unknown>).message as Record<string, unknown>).accountKeys as unknown[]).length)
            : null,
        });
      },
      recommendation: ({ history }) => history.totalCredits > 0
        ? "Keep. This one endpoint powers both wallet-trade parsing and post-trade fill reconciliation."
        : "Keep for fill and wallet-trade decoding.",
    },
    {
      id: "helius-transactions-for-address",
      provider: "HELIUS",
      endpoint: "getTransactionsForAddress",
      label: "Helius transactions for address",
      needs: ["wallet"],
      runtimeConsumers: ["S1 wallet scoring"],
      usedFields: ["count", "first.signature", "first.blockTime", "first.tokenTransfers", "first.nativeTransfers"],
      call: (auditContext) => helius.getTransactionsForAddress(
        auditContext.wallet!,
        { limit: Math.min(config.walletScorer.txFetchLimit, 25), tokenAccounts: "balanceChanged" },
        meta,
      ),
      summarize: (value) => summaryFromArray(Array.isArray(value) ? value : [], ["signature", "blockTime", "tokenTransfers", "nativeTransfers"]),
      recommendation: ({ history }) => history.totalCredits > 0
        ? "Keep, but protect it aggressively. This is the single priciest Helius scorer in the current stack."
        : "Keep only for wallet scoring; nowhere else should touch it.",
    },
    {
      id: "helius-balance",
      provider: "HELIUS",
      endpoint: "getBalance",
      label: "Helius wallet balance",
      needs: ["wallet"],
      runtimeConsumers: ["wallet reconciliation", "runtime capital snapshot"],
      usedFields: ["value"],
      call: (auditContext) => helius.getWalletBalanceSol(auditContext.wallet!, meta),
      summarize: (value) => compactObject({ value }),
      recommendation: () => "Keep. Cheap, direct runtime truth for wallet-backed capital.",
    },
    {
      id: "helius-blockhash",
      provider: "HELIUS",
      endpoint: "getLatestBlockhash",
      label: "Helius latest blockhash",
      runtimeConsumers: ["buy execution", "sell execution"],
      usedFields: ["blockhash", "lastValidBlockHeight"],
      call: () => helius.getLatestBlockhash(meta),
      summarize: (value) => compactObject(value as Record<string, unknown> | null),
      recommendation: () => "Keep. Execution-critical and cheap.",
    },
    {
      id: "helius-priority-fee",
      provider: "HELIUS",
      endpoint: "getPriorityFeeEstimate",
      label: "Helius priority fee estimate",
      runtimeConsumers: ["buy execution", "sell execution"],
      usedFields: ["value"],
      call: () => helius.getPriorityFeeEstimate(meta),
      summarize: (value) => compactObject({ value }),
      recommendation: () => "Keep. Execution-critical and cheap.",
    },
    {
      id: "helius-assets-by-owner",
      provider: "HELIUS",
      endpoint: "getAssetsByOwner",
      label: "Helius assets by owner",
      fullOnly: true,
      needs: ["wallet"],
      runtimeConsumers: [],
      dormantNote: "No active strategy or runtime path consumes this today.",
      usedFields: ["count"],
      call: (auditContext) => helius.getAssetsByOwner(auditContext.wallet!, meta),
      summarize: (value) => summaryFromArray(Array.isArray(value) ? value : [], ["id", "interface"]),
      recommendation: () => "Not wired into live trading. Leave it dormant unless a new feature actually needs it.",
    },
    {
      id: "helius-parse-transaction",
      provider: "HELIUS",
      endpoint: "parseTransaction",
      label: "Helius parsed transaction API",
      fullOnly: true,
      needs: ["signature"],
      runtimeConsumers: [],
      dormantNote: "No active strategy or runtime path consumes this today.",
      usedFields: ["type", "signature", "events"],
      call: (auditContext) => helius.parseTransaction(auditContext.signature!, meta),
      summarize: (value) => {
        const record = value as Record<string, unknown> | null;
        return compactObject(record ? {
          type: record.type,
          signature: record.signature,
          hasEvents: typeof record.events === "object" && record.events !== null,
        } : null);
      },
      recommendation: () => "Not wired into current trading decisions. Expensive unless it replaces cheaper decode paths.",
    },
  ];

  async function runProbe(descriptor: ProbeDescriptor): Promise<{ descriptor: ProbeDescriptor; history: HistoryStats; run: ProbeRunResult }> {
    const history = dbAvailable
      ? await getHistoryStats(descriptor.provider, descriptor.endpoint)
      : { totalCalls: 0, totalCredits: 0, avgLatencyMs: null, p95LatencyMs: null, cacheRate: null, errorRate: null };
    const missingContext = (descriptor.needs ?? []).find((key) => !context[key]);
    if (missingContext) {
      return {
        descriptor,
        history,
        run: { status: "skipped", reason: `missing ${missingContext}` , loggedCalls: [] },
      };
    }

    if (!budgetManager.shouldRunNonEssential(descriptor.provider)) {
      return {
        descriptor,
        history,
        run: { status: "skipped", reason: "provider quota reserved for essential traffic", loggedCalls: [] },
      };
    }

    const startIndex = buffer.calls.length;
    const startedAt = Date.now();
    try {
      const value = await descriptor.call(context);
      const coldLatencyMs = Date.now() - startedAt;
      const sample = descriptor.summarize(value);
      let warmLatencyMs: number | null = null;
      if (descriptor.warmCache) {
        const warmStartedAt = Date.now();
        await descriptor.call(context);
        warmLatencyMs = Date.now() - warmStartedAt;
      }
      return {
        descriptor,
        history,
        run: {
          status: "ok",
          coldLatencyMs,
          warmLatencyMs,
          loggedCalls: buffer.calls.slice(startIndex),
          sample: sample ?? undefined,
          fieldCoverage: buildFieldCoverage(sample, descriptor.usedFields),
        },
      };
    } catch (error) {
      return {
        descriptor,
        history,
        run: {
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
          loggedCalls: buffer.calls.slice(startIndex),
        },
      };
    }
  }

  const selectedDescriptors = descriptors.filter((descriptor) => {
    if (!cli.full && descriptor.fullOnly) return false;
    if (cli.provider !== "all" && descriptor.provider !== cli.provider) return false;
    return true;
  });

  const providerResults: Array<{ descriptor: ProbeDescriptor; history: HistoryStats; run: ProbeRunResult }> = [];
  if (cli.section !== "timing") {
    for (const descriptor of selectedDescriptors) {
      providerResults.push(await runProbe(descriptor));
    }
  }

  const descriptorHistory = new Map(
    providerResults.map((result) => [`${result.descriptor.provider}:${result.descriptor.endpoint}`, result.history]),
  );

  async function collectTimingReport() {
    if (!dbAvailable) {
      return {
        runtimeCadenceMs: {
          s2ScanIntervalMs: config.strategies.s2.scanIntervalMs,
          s2CatchupIntervalMs: config.birdeye.s2CatchupIntervalMs,
          s2EntryDelayMs: config.strategies.s2.entryDelayMinutes * 60_000,
          s3ScanIntervalMs: config.strategies.s3.scanIntervalMs,
          s3Tranche2DelayMs: config.strategies.s3.tranche2DelayMs,
          exitMonitorBatchIntervalMs: config.exitMonitor.batchIntervalMs,
          tradeDataSlowPathRefreshMs: config.exitMonitor.tradeDataSlowPathRefreshMs,
        },
        configuredWindows: {
          S1_COPY: {
            estimatedSignalAvgMs: 0,
            estimatedSignalP95Ms: 0,
          },
          S2_GRADUATION: {
            estimatedSignalAvgMs: config.strategies.s2.entryDelayMinutes * 60_000,
            estimatedSignalP95Ms: config.strategies.s2.entryDelayMinutes * 60_000,
            discoveryWaitMs: config.strategies.s2.scanIntervalMs,
            catchupWaitMs: config.birdeye.s2CatchupIntervalMs,
          },
          S3_MOMENTUM: {
            estimatedSignalAvgMs: config.strategies.s3.scanIntervalMs,
            estimatedSignalP95Ms: config.strategies.s3.scanIntervalMs,
          },
          EXECUTION: {
            estimatedExecutionAvgMs: 0,
            estimatedExecutionP95Ms: 0,
          },
          EXITS: {
            maxStopLossDecisionWaitMs: config.exitMonitor.batchIntervalMs,
            fadeExitWeakReadConfirmMs: config.exitMonitor.batchIntervalMs * 2,
            fadeExitSlowPathRefreshMs: config.exitMonitor.tradeDataSlowPathRefreshMs,
          },
        },
        measured: {
          signalLatency: {},
          entryLatency: {},
          sellLatency: {},
        },
      };
    }

    const requiredHistoryKeys: Array<[ProviderName, string]> = [
      ["HELIUS", "getSignaturesForAddress"],
      ["HELIUS", "getTransaction"],
      ["HELIUS", "getPriorityFeeEstimate"],
      ["HELIUS", "getLatestBlockhash"],
      ["HELIUS", "simulateTransaction"],
      ["HELIUS", "sendTransaction"],
      ["BIRDEYE", "/defi/token_overview"],
      ["BIRDEYE", "/defi/token_security"],
      ["BIRDEYE", "/defi/v3/token/holder"],
      ["BIRDEYE", "/defi/v3/token/trade-data/single"],
    ];
    const historyCache = new Map<string, HistoryStats>(
      await Promise.all(
        requiredHistoryKeys.map(async ([provider, endpoint]) => [
          `${provider}:${endpoint}`,
          descriptorHistory.get(`${provider}:${endpoint}`) ?? await getHistoryStats(provider, endpoint),
        ] as const),
      ),
    );
    const [signalRows, positionRows, tradeRows] = await Promise.all([
      db.signal.findMany({
        orderBy: { createdAt: "desc" },
        take: 250,
        select: {
          strategy: true,
          detectedAt: true,
          createdAt: true,
          metadata: true,
        },
      }),
      db.position.findMany({
        orderBy: { openedAt: "desc" },
        take: 250,
        select: {
          strategy: true,
          entryLatencyMs: true,
        },
      }),
      db.trade.findMany({
        orderBy: { executedAt: "desc" },
        take: 250,
        select: {
          strategy: true,
          side: true,
          metadata: true,
        },
      }),
    ]);

    const signalLatencyByStrategy = new Map<string, number[]>();
    for (const row of signalRows) {
      const metadata = row.metadata as Record<string, unknown> | null;
      const metadataLatency = metadata && typeof metadata.detectionToSignalMs === "number"
        ? metadata.detectionToSignalMs
        : null;
      const diffLatency = row.createdAt.getTime() - row.detectedAt.getTime();
      const latency = metadataLatency ?? (diffLatency > 0 ? diffLatency : null);
      if (latency == null || latency <= 0) continue;
      const bucket = signalLatencyByStrategy.get(row.strategy) ?? [];
      bucket.push(latency);
      signalLatencyByStrategy.set(row.strategy, bucket);
    }

    const entryLatencyByStrategy = new Map<string, number[]>();
    for (const row of positionRows) {
      if (typeof row.entryLatencyMs !== "number" || row.entryLatencyMs <= 0) continue;
      const bucket = entryLatencyByStrategy.get(row.strategy) ?? [];
      bucket.push(row.entryLatencyMs);
      entryLatencyByStrategy.set(row.strategy, bucket);
    }

    const sellLatencyByStrategy = new Map<string, number[]>();
    for (const row of tradeRows) {
      if (row.side !== "SELL") continue;
      const metadata = row.metadata as Record<string, unknown> | null;
      const latency = metadata && typeof metadata.executionLatencyMs === "number"
        ? metadata.executionLatencyMs
        : null;
      if (latency == null || latency <= 0) continue;
      const bucket = sellLatencyByStrategy.get(row.strategy) ?? [];
      bucket.push(latency);
      sellLatencyByStrategy.set(row.strategy, bucket);
    }

    const historyFor = (provider: ProviderName, endpoint: string) =>
      historyCache.get(`${provider}:${endpoint}`) ?? { totalCalls: 0, totalCredits: 0, avgLatencyMs: null, p95LatencyMs: null, cacheRate: null, errorRate: null };
    const avgLatency = (provider: ProviderName, endpoint: string, fallback: number = 0) =>
      historyFor(provider, endpoint).avgLatencyMs ?? fallback;
    const p95Latency = (provider: ProviderName, endpoint: string, fallback: number = 0) =>
      historyFor(provider, endpoint).p95LatencyMs ?? fallback;

    const s1SignalAvg = avgLatency("HELIUS", "getSignaturesForAddress")
      + avgLatency("HELIUS", "getTransaction")
      + avgLatency("BIRDEYE", "/defi/token_overview")
      + avgLatency("BIRDEYE", "/defi/token_security")
      + avgLatency("BIRDEYE", "/defi/v3/token/holder")
      + avgLatency("BIRDEYE", "/defi/v3/token/trade-data/single");
    const s1SignalP95 = p95Latency("HELIUS", "getSignaturesForAddress")
      + p95Latency("HELIUS", "getTransaction")
      + p95Latency("BIRDEYE", "/defi/token_overview")
      + p95Latency("BIRDEYE", "/defi/token_security")
      + p95Latency("BIRDEYE", "/defi/v3/token/holder")
      + p95Latency("BIRDEYE", "/defi/v3/token/trade-data/single");

    const s2SignalAvg = avgLatency("BIRDEYE", "/defi/token_overview")
      + (config.strategies.s2.entryDelayMinutes * 60_000)
      + avgLatency("BIRDEYE", "/defi/token_overview")
      + avgLatency("BIRDEYE", "/defi/v3/token/trade-data/single");
    const s2SignalP95 = p95Latency("BIRDEYE", "/defi/token_overview")
      + (config.strategies.s2.entryDelayMinutes * 60_000)
      + p95Latency("BIRDEYE", "/defi/token_overview")
      + p95Latency("BIRDEYE", "/defi/v3/token/trade-data/single");

    const s3SignalAvg = config.strategies.s3.scanIntervalMs
      + avgLatency("BIRDEYE", "/defi/token_overview")
      + avgLatency("BIRDEYE", "/defi/v3/token/trade-data/single")
      + avgLatency("BIRDEYE", "/defi/token_security")
      + avgLatency("BIRDEYE", "/defi/v3/token/holder");
    const s3SignalP95 = config.strategies.s3.scanIntervalMs
      + p95Latency("BIRDEYE", "/defi/token_overview")
      + p95Latency("BIRDEYE", "/defi/v3/token/trade-data/single")
      + p95Latency("BIRDEYE", "/defi/token_security")
      + p95Latency("BIRDEYE", "/defi/v3/token/holder");

    const executionAvg = avgLatency("HELIUS", "getPriorityFeeEstimate")
      + avgLatency("HELIUS", "getLatestBlockhash")
      + avgLatency("HELIUS", "simulateTransaction")
      + avgLatency("HELIUS", "sendTransaction")
      + avgLatency("HELIUS", "getTransaction");
    const executionP95 = p95Latency("HELIUS", "getPriorityFeeEstimate")
      + p95Latency("HELIUS", "getLatestBlockhash")
      + p95Latency("HELIUS", "simulateTransaction")
      + p95Latency("HELIUS", "sendTransaction")
      + p95Latency("HELIUS", "getTransaction");

    const summarizeSeries = (series: number[] | undefined) => ({
      avgMs: series && series.length > 0 ? series.reduce((sum, value) => sum + value, 0) / series.length : null,
      p95Ms: series && series.length > 0 ? percentile(series, 95) : null,
      count: series?.length ?? 0,
    });

    return {
      runtimeCadenceMs: {
        s2ScanIntervalMs: config.strategies.s2.scanIntervalMs,
        s2CatchupIntervalMs: config.birdeye.s2CatchupIntervalMs,
        s2EntryDelayMs: config.strategies.s2.entryDelayMinutes * 60_000,
        s3ScanIntervalMs: config.strategies.s3.scanIntervalMs,
        s3Tranche2DelayMs: config.strategies.s3.tranche2DelayMs,
        exitMonitorBatchIntervalMs: config.exitMonitor.batchIntervalMs,
        tradeDataSlowPathRefreshMs: config.exitMonitor.tradeDataSlowPathRefreshMs,
      },
      configuredWindows: {
        S1_COPY: {
          estimatedSignalAvgMs: Math.round(s1SignalAvg),
          estimatedSignalP95Ms: Math.round(s1SignalP95),
        },
        S2_GRADUATION: {
          estimatedSignalAvgMs: Math.round(s2SignalAvg),
          estimatedSignalP95Ms: Math.round(s2SignalP95),
          discoveryWaitMs: config.strategies.s2.scanIntervalMs,
          catchupWaitMs: config.birdeye.s2CatchupIntervalMs,
        },
        S3_MOMENTUM: {
          estimatedSignalAvgMs: Math.round(s3SignalAvg),
          estimatedSignalP95Ms: Math.round(s3SignalP95),
        },
        EXECUTION: {
          estimatedExecutionAvgMs: Math.round(executionAvg),
          estimatedExecutionP95Ms: Math.round(executionP95),
        },
        EXITS: {
          maxStopLossDecisionWaitMs: config.exitMonitor.batchIntervalMs,
          fadeExitWeakReadConfirmMs: config.exitMonitor.batchIntervalMs * 2,
          fadeExitSlowPathRefreshMs: config.exitMonitor.tradeDataSlowPathRefreshMs,
        },
      },
      measured: {
        signalLatency: Object.fromEntries(
          [...signalLatencyByStrategy.entries()].map(([strategy, series]) => [strategy, summarizeSeries(series)]),
        ),
        entryLatency: Object.fromEntries(
          [...entryLatencyByStrategy.entries()].map(([strategy, series]) => [strategy, summarizeSeries(series)]),
        ),
        sellLatency: Object.fromEntries(
          [...sellLatencyByStrategy.entries()].map(([strategy, series]) => [strategy, summarizeSeries(series)]),
        ),
      },
    };
  }

  const timingReport = cli.section === "providers" ? null : await collectTimingReport();

  if (cli.json) {
    const output = {
      envPath,
      context,
      quota: budgetManager.getSnapshots(),
      providerResults: providerResults.map((result) => ({
        provider: result.descriptor.provider,
        endpoint: result.descriptor.endpoint,
        label: result.descriptor.label,
        runtimeConsumers: result.descriptor.runtimeConsumers,
        dormantNote: result.descriptor.dormantNote ?? null,
        history: result.history,
        run: result.run,
        recommendation: result.descriptor.recommendation(result),
      })),
      derivedHeliusMethods: [
        "getWalletTradeFromSignature reuses getTransaction; no separate paid endpoint.",
        "getWalletTradeFillFromSignature reuses getTransaction; no separate paid endpoint.",
      ],
      timingReport,
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  printHeader("Paid API Audit");
  printLine(`env: ${envPath ?? "none loaded"}`);
  printLine(`db: ${dbAvailable ? "connected" : `unavailable (${dbError ?? "unknown error"})`}`);
  printLine(`context token: ${context.primaryToken ?? "n/a"}`);
  printLine(`context graduation token: ${context.graduationToken ?? "n/a"}`);
  printLine(`context wallet: ${context.wallet ?? "n/a"}`);
  printLine(`context signature: ${context.signature ?? "n/a"}`);

  if (cli.section !== "timing") {
    printHeader("Quota");
    for (const snapshot of budgetManager.getSnapshots()) {
      printLine(
        `${snapshot.service}: ${snapshot.quotaStatus} | daily ${snapshot.dailyUsed}/${snapshot.dailyBudget} | monthly ${snapshot.monthlyUsed}/${snapshot.budgetTotal} | reserve ${snapshot.pauseReason ?? "none"}`,
      );
    }

    printHeader("Provider Probes");
    for (const result of providerResults) {
      printLine(`[${result.descriptor.provider}] ${result.descriptor.endpoint} | ${result.descriptor.label}`);
      printLine(`  run: ${result.run.status}${result.run.reason ? ` (${result.run.reason})` : ""}`);
      if (result.descriptor.dormantNote) {
        printLine(`  note: ${result.descriptor.dormantNote}`);
      }
      if (result.run.status === "ok") {
        printLine(`  live: cold ${formatMs(result.run.coldLatencyMs)}, warm ${formatMs(result.run.warmLatencyMs)}`);
        if (result.run.loggedCalls.length > 0) {
          const credits = result.run.loggedCalls.reduce((sum, call) => sum + (call.credits ?? 0), 0);
          const cacheHits = result.run.loggedCalls.filter((call) => call.cacheHit).length;
          printLine(`  logged calls: ${result.run.loggedCalls.length}, credits ${credits}, cache hits ${cacheHits}`);
        }
        if (result.run.sample) {
          printLine(`  sample: ${JSON.stringify(result.run.sample)}`);
        }
        if (result.run.fieldCoverage) {
          printLine(`  used fields present: ${result.run.fieldCoverage.present.join(", ") || "none"}`);
          printLine(`  used fields missing: ${result.run.fieldCoverage.missing.join(", ") || "none"}`);
        }
      }
      printLine(
        `  history: ${result.history.totalCalls} calls, ${result.history.totalCredits} credits, avg ${formatMs(result.history.avgLatencyMs)}, p95 ${formatMs(result.history.p95LatencyMs)}, cache ${formatPct(result.history.cacheRate)}, errors ${formatPct(result.history.errorRate)}`,
      );
      printLine(`  consumers: ${result.descriptor.runtimeConsumers.join("; ") || "none"}`);
      printLine(`  recommendation: ${result.descriptor.recommendation(result)}`);
    }

    printHeader("Derived Helius Methods");
    printLine("getWalletTradeFromSignature: uses getTransaction data; no extra paid endpoint beyond transaction fetch.");
    printLine("getWalletTradeFillFromSignature: uses getTransaction data; no extra paid endpoint beyond transaction fetch.");
  }

  if (timingReport) {
    printHeader("Timing Audit");
    printLine(`S2 scan cadence: ${formatMs(timingReport.runtimeCadenceMs.s2ScanIntervalMs)}`);
    printLine(`S2 catch-up cadence: ${formatMs(timingReport.runtimeCadenceMs.s2CatchupIntervalMs)}`);
    printLine(`S2 intentional entry delay: ${formatMs(timingReport.runtimeCadenceMs.s2EntryDelayMs)}`);
    printLine(`S3 scan cadence: ${formatMs(timingReport.runtimeCadenceMs.s3ScanIntervalMs)}`);
    printLine(`S3 tranche 2 delay: ${formatMs(timingReport.runtimeCadenceMs.s3Tranche2DelayMs)}`);
    printLine(`Exit monitor batch interval: ${formatMs(timingReport.runtimeCadenceMs.exitMonitorBatchIntervalMs)}`);
    printLine(`Fade slow-path refresh: ${formatMs(timingReport.runtimeCadenceMs.tradeDataSlowPathRefreshMs)}`);

    printLine(`S1 signal estimate: avg ${formatMs(timingReport.configuredWindows.S1_COPY.estimatedSignalAvgMs)}, p95 ${formatMs(timingReport.configuredWindows.S1_COPY.estimatedSignalP95Ms)}`);
    printLine(`S2 signal estimate: avg ${formatMs(timingReport.configuredWindows.S2_GRADUATION.estimatedSignalAvgMs)}, p95 ${formatMs(timingReport.configuredWindows.S2_GRADUATION.estimatedSignalP95Ms)}`);
    printLine(`S3 signal estimate: avg ${formatMs(timingReport.configuredWindows.S3_MOMENTUM.estimatedSignalAvgMs)}, p95 ${formatMs(timingReport.configuredWindows.S3_MOMENTUM.estimatedSignalP95Ms)}`);
    printLine(`Execution estimate: avg ${formatMs(timingReport.configuredWindows.EXECUTION.estimatedExecutionAvgMs)}, p95 ${formatMs(timingReport.configuredWindows.EXECUTION.estimatedExecutionP95Ms)}`);
    printLine(`Exit stop-loss/TP decision wait: <= ${formatMs(timingReport.configuredWindows.EXITS.maxStopLossDecisionWaitMs)}`);
    printLine(`Fade exit confirmation wait: >= ${formatMs(timingReport.configuredWindows.EXITS.fadeExitWeakReadConfirmMs)} plus up to ${formatMs(timingReport.configuredWindows.EXITS.fadeExitSlowPathRefreshMs)} for slow-path trade data`);

    printLine(`Measured signal latency rows: ${JSON.stringify(timingReport.measured.signalLatency)}`);
    printLine(`Measured buy execution rows: ${JSON.stringify(timingReport.measured.entryLatency)}`);
    printLine(`Measured sell execution rows: ${JSON.stringify(timingReport.measured.sellLatency)}`);
  }
}

try {
  await main();
} finally {
  await db.$disconnect();
}
