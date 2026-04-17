import type { BotState, Candidate, Fill, Position, TokenMetrics } from "@prisma/client";
import { db } from "../db/client.js";
import type { AdaptiveModelState, AdaptiveTokenExplanation, LiveStrategySettings } from "../types/domain.js";
import type { RiskEngine } from "../engine/risk-engine.js";
import type { RuntimeConfigService } from "./runtime-config.js";
import type { ProviderBudgetService } from "./provider-budget-service.js";
import { buildAdaptiveModelState, buildAdaptiveTokenExplanation } from "./adaptive-model.js";
import { listOperatorEvents } from "./operator-events.js";

const QUEUED_CANDIDATE_STATUSES = ["DISCOVERED", "SKIPPED", "ERROR"] as const;
const LIVE_STARTUP_PAUSE_REASON = "live mode is paused on startup; resume from the dashboard to begin trading";

export type DeskAction = {
  id: "pause" | "resume" | "discover-now" | "evaluate-now" | "exit-check-now";
  label: string;
  enabled: boolean;
  confirmation?: string;
};

export type DeskShellPayload = {
  mode: "DRY_RUN" | "LIVE";
  health: "healthy" | "warning" | "blocked";
  primaryBlocker: {
    label: string;
    detail: string | null;
    level: "info" | "warning" | "danger";
  } | null;
  lastSyncAt: string;
  unreadCriticalAlerts: number;
  availableActions: DeskAction[];
  statusSummary: {
    openPositions: number;
    maxOpenPositions: number;
    queuedCandidates: number;
  };
};

export type DeskHomePayload = {
  readiness: {
    allowed: boolean;
    summary: string;
    detail: string | null;
  };
  guardrails: Array<{
    id: string;
    label: string;
    status: "ok" | "warning" | "danger";
    value: string;
    detail: string;
  }>;
  exposure: {
    capitalUsd: number;
    cashUsd: number;
    realizedPnlUsd: number;
    openPositions: number;
    maxOpenPositions: number;
  };
  performance: {
    realizedPnlTodayUsd: number;
    realizedPnl7dUsd: number;
    winRate7d: number;
    avgReturnPct7d: number;
    avgHoldMinutes7d: number;
  };
  latency: {
    providerAvgLatencyMsToday: number;
    hotEndpointAvgLatencyMsToday: number;
    avgExecutionLatencyMs24h: number;
    p95ExecutionLatencyMs24h: number;
    avgExecutionSlippageBps24h: number;
  };
  runtime: {
    lastDiscoveryAt: string | null;
    lastEvaluationAt: string | null;
    lastExitCheckAt: string | null;
  };
  queue: {
    queuedCandidates: number;
    buckets: Array<{ bucket: CandidateDeskBucket; count: number; label: string }>;
  };
  providerPressure: {
    usedUnits: number;
    monthlyBudgetUnits: number;
    projectedMonthlyUnits: number;
    paceStatus: "ok" | "warning" | "danger";
    laneStatus: Array<{ lane: string; usedUnits: number; projectedMonthlyUnits: number; budgetUnits: number }>;
  };
  diagnostics: {
    status: "healthy" | "warning" | "danger";
    staleComponents: string[];
    issues: Array<{ id: string; label: string; detail: string; level: "warning" | "danger" }>;
  };
  adaptiveModel: AdaptiveModelState;
  recentFailures: OperatorEventPayload[];
  recentActions: OperatorEventPayload[];
  /** Lightweight open-position rows for the dashboard overview strip. */
  positions?: PositionBookRow[];
};

export type OperatorEventPayload = {
  id: string;
  kind: string;
  level: "info" | "warning" | "danger";
  title: string;
  detail: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

export type CandidateDeskBucket = "ready" | "risk" | "provider" | "data";

export type CandidateQueuePayload = {
  bucket: CandidateDeskBucket;
  buckets: Array<{ bucket: CandidateDeskBucket; label: string; count: number }>;
  rows: CandidateQueueRow[];
};

export type CandidateQueueRow = {
  id: string;
  mint: string;
  symbol: string;
  source: string;
  status: string;
  primaryBlocker: string;
  secondaryReasons: string[];
  liquidityUsd: number | null;
  volume5mUsd: number | null;
  buySellRatio: number | null;
  top10HolderPercent: number | null;
  discoveredAt: string;
  lastEvaluatedAt: string | null;
  adaptive: AdaptiveTokenExplanation;
};

export type CandidateDetailPayload = {
  summary: CandidateQueueRow & {
    name: string;
    rejectReason: string | null;
    metadata: Record<string, unknown>;
    filterState: Record<string, unknown>;
  };
  snapshots: Array<Record<string, unknown>>;
  payloads: Array<Record<string, unknown>>;
};

export type PositionBookPayload = {
  book: "open" | "closed";
  rows: PositionBookRow[];
  totals: {
    openCount: number;
    closedCount: number;
    realizedPnlUsd: number;
  };
};

export type PositionBookRow = {
  id: string;
  mint: string;
  symbol: string;
  status: string;
  interventionPriority: number;
  interventionLabel: string;
  entryPriceUsd: number;
  currentPriceUsd: number;
  remainingToken: number;
  unrealizedPnlUsd: number;
  returnPct: number;
  exitReason: string | null;
  openedAt: string;
  closedAt: string | null;
  lastFillAt: string | null;
  latestExecutionLatencyMs: number | null;
  adaptive: AdaptiveTokenExplanation;
};

export type PositionDetailPayload = {
  summary: PositionBookRow & {
    amountUsd: number;
    amountToken: number;
    peakPriceUsd: number;
    stopLossPriceUsd: number;
    tp1Done: boolean;
    tp2Done: boolean;
    metadata: Record<string, unknown>;
  };
  fills: Array<Record<string, unknown>>;
  executionSummary: {
    fillCount: number;
    avgExecutionLatencyMs: number | null;
    p95ExecutionLatencyMs: number | null;
    avgExecutionSlippageBps: number | null;
    lastExecutionLatencyMs: number | null;
  };
  snapshots: Array<Record<string, unknown>>;
  linkedCandidate: Record<string, unknown> | null;
};

export type DiagnosticsPayload = {
  summary: {
    providerErrors: number;
    totalCalls: number;
    totalUnits: number;
    latestPayloadFailures: number;
  };
  providerRows: Array<Record<string, unknown>>;
  endpointRows: Array<Record<string, unknown>>;
  staleComponents: string[];
  issues: Array<{ id: string; label: string; detail: string; level: "warning" | "danger" }>;
};

export class OperatorDeskService {
  constructor(
    private readonly config: RuntimeConfigService,
    private readonly risk: RiskEngine,
    private readonly providerBudget: ProviderBudgetService,
  ) {}

  async getShell(): Promise<DeskShellPayload> {
    const [settings, botState, gate, openPositions, queuedCandidates, events] = await Promise.all([
      this.config.getSettings(),
      this.risk.getSnapshot(),
      this.risk.canOpenPosition(),
      db.position.count({ where: { status: "OPEN" } }),
      db.candidate.count({ where: { status: { in: [...QUEUED_CANDIDATE_STATUSES] } } }),
      listOperatorEvents(10),
    ]);

    const primaryBlocker = this.buildPrimaryBlocker(botState, gate);
    const unreadCriticalAlerts = events.filter((event) => event.level === "danger").length;

    return {
      mode: settings.tradeMode,
      health: primaryBlocker?.level === "danger" ? "blocked" : unreadCriticalAlerts > 0 ? "warning" : "healthy",
      primaryBlocker,
      lastSyncAt: new Date().toISOString(),
      unreadCriticalAlerts,
      availableActions: [
        {
          id: botState.pauseReason ? "resume" : "pause",
          label: botState.pauseReason === LIVE_STARTUP_PAUSE_REASON ? "Start Auto Live Bot" : botState.pauseReason ? "Resume" : "Pause",
          enabled: true,
          confirmation: botState.pauseReason === LIVE_STARTUP_PAUSE_REASON
            ? "Start full automated live bot now?"
            : botState.pauseReason
              ? "Resume runtime loops and monitoring?"
              : "Pause runtime loops and monitoring?",
        },
        {
          id: "discover-now",
          label: "Discover",
          enabled: true,
          confirmation: "Run discovery now?",
        },
        {
          id: "evaluate-now",
          label: "Evaluate",
          enabled: true,
          confirmation: "Run evaluation now?",
        },
        {
          id: "exit-check-now",
          label: "Exit Check",
          enabled: true,
          confirmation: "Run exit checks now?",
        },
      ],
      statusSummary: {
        openPositions,
        maxOpenPositions: settings.capital.maxOpenPositions,
        queuedCandidates,
      },
    };
  }

  async getHome(): Promise<DeskHomePayload> {
    const [settings, botState, gate, openPositionsCount, openPositionRows, candidates, budget, events, latestPayloadFailures, kpis] = await Promise.all([
      this.config.getSettings(),
      this.risk.getSnapshot(),
      this.risk.canOpenPosition(),
      db.position.count({ where: { status: "OPEN" } }),
      db.position.findMany({
        where: { status: "OPEN" },
        take: 6,
        orderBy: { openedAt: "desc" },
      }),
      db.candidate.findMany({
        take: 120,
        orderBy: { discoveredAt: "desc" },
      }),
      this.providerBudget.getBirdeyeBudgetSnapshot(),
      listOperatorEvents(25),
      db.rawApiPayload.count({
        where: {
          success: false,
          capturedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
      }),
      this.getDeskKpis(),
    ]);

    const positionIds = openPositionRows.map((r) => r.id);
    const [latestMetricsRows, latestFillsRows] = await Promise.all([
      db.tokenMetrics.findMany({
        where: {
          OR: [
            { positionId: { in: positionIds } },
            { mint: { in: openPositionRows.map((r) => r.mint) } },
          ],
        },
        orderBy: { capturedAt: "desc" },
      }),
      db.fill.findMany({
        where: { positionId: { in: positionIds } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const latestMetricsMap = new Map<string, { capturedAt: Date }>();
    for (const metric of latestMetricsRows) {
      const key = metric.positionId ?? metric.mint;
      if (!latestMetricsMap.has(key)) {
        latestMetricsMap.set(key, metric);
      }
    }

    const latestFillMap = new Map<string, { createdAt: Date; metadata: unknown }>();
    for (const fill of latestFillsRows) {
      if (!latestFillMap.has(fill.positionId)) {
        latestFillMap.set(fill.positionId, fill);
      }
    }

    const buckets = this.buildCandidateBucketCounts(candidates);
    const diagnostics = this.buildDiagnostics(botState, budget, latestPayloadFailures);

    return {
      readiness: {
        allowed: gate.allowed,
        summary: gate.allowed ? "Desk armed" : "Desk blocked",
        detail: gate.allowed ? "No global blocker is active." : gate.reason ?? null,
      },
      guardrails: [
        {
          id: "pause",
          label: "Pause state",
          status: botState.pauseReason ? "warning" : "ok",
          value: botState.pauseReason ? "Paused" : "Active",
          detail: botState.pauseReason ?? "No manual pause is active.",
        },
        {
          id: "daily-loss",
          label: "Daily loss guard",
          status: (gate.dailyRealizedPnlUsd ?? 0) < 0 ? "warning" : "ok",
          value: `${(gate.dailyRealizedPnlUsd ?? 0).toFixed(2)} USD`,
          detail: `${gate.consecutiveLosses} consecutive losses recorded today.`,
        },
        {
          id: "capacity",
          label: "Open-cap guard",
          status: openPositionsCount >= settings.capital.maxOpenPositions ? "danger" : "ok",
          value: `${openPositionsCount}/${settings.capital.maxOpenPositions}`,
          detail: openPositionsCount >= settings.capital.maxOpenPositions
            ? "No additional positions can open until exposure drops."
            : "Open-position cap still has room.",
        },
      ],
      exposure: {
        capitalUsd: Number(botState.capitalUsd),
        cashUsd: Number(botState.cashUsd),
        realizedPnlUsd: Number(botState.realizedPnlUsd),
        openPositions: openPositionsCount,
        maxOpenPositions: settings.capital.maxOpenPositions,
      },
      performance: kpis.performance,
      latency: kpis.latency,
      runtime: {
        lastDiscoveryAt: botState.lastDiscoveryAt?.toISOString() ?? null,
        lastEvaluationAt: botState.lastEvaluationAt?.toISOString() ?? null,
        lastExitCheckAt: botState.lastExitCheckAt?.toISOString() ?? null,
      },
      queue: {
        queuedCandidates: candidates.filter((candidate) => QUEUED_CANDIDATE_STATUSES.includes(candidate.status as typeof QUEUED_CANDIDATE_STATUSES[number])).length,
        buckets,
      },
      providerPressure: {
        usedUnits: budget.totalUsedUnits,
        monthlyBudgetUnits: budget.monthlyBudgetUnits,
        projectedMonthlyUnits: budget.projectedMonthlyUnits,
        paceStatus: budget.projectedMonthlyUnits >= budget.monthlyBudgetUnits
          ? "danger"
          : budget.projectedMonthlyUnits >= budget.monthlyBudgetUnits * 0.85
            ? "warning"
            : "ok",
        laneStatus: Object.values(budget.lanes).map((lane) => ({
          lane: lane.lane,
          usedUnits: lane.usedUnits,
          projectedMonthlyUnits: lane.projectedMonthlyUnits,
          budgetUnits: lane.budgetUnits,
        })),
      },
      diagnostics,
      adaptiveModel: buildAdaptiveModelState(settings),
      recentFailures: events.filter((event) => event.level !== "info").slice(0, 6).map((event) => this.toEventPayload(event)),
      recentActions: events.filter((event) => event.level === "info").slice(0, 6).map((event) => this.toEventPayload(event)),
      positions: openPositionRows.map((row) => this.toPositionBookRowWithPrefetchedData(
        row,
        settings.strategy.liveStrategy,
        latestMetricsMap.get(row.id)?.capturedAt ?? latestMetricsMap.get(row.mint)?.capturedAt ?? null,
        latestFillMap.get(row.id) ?? null,
      )),
    };
  }

  async getEvents(limit = 20): Promise<OperatorEventPayload[]> {
    const events = await listOperatorEvents(limit);
    return events.map((event) => this.toEventPayload(event));
  }

  async getCandidateQueue(bucket: CandidateDeskBucket): Promise<CandidateQueuePayload> {
    const [settings, rows] = await Promise.all([
      this.config.getSettings(),
      db.candidate.findMany({
        take: 150,
        orderBy: { discoveredAt: "desc" },
        include: { latestMetrics: true },
      }),
    ]);

    const mapped = rows.map((row) => this.toCandidateQueueRow(row, settings.strategy.liveStrategy));

    return {
      bucket,
      buckets: this.buildCandidateBucketCounts(rows),
      rows: mapped.filter((row) => row.bucket === bucket).map(({ bucket: _bucket, ...rest }) => rest),
    };
  }

  async getCandidateDetail(candidateId: string): Promise<CandidateDetailPayload | null> {
    const [settings, candidate] = await Promise.all([
      this.config.getSettings(),
      db.candidate.findUnique({ where: { id: candidateId } }),
    ]);
    if (!candidate) return null;

    const [snapshots, payloads] = await Promise.all([
      db.tokenMetrics.findMany({
        where: { OR: [{ candidateId }, { mint: candidate.mint }] },
        orderBy: { capturedAt: "desc" },
        take: 40,
      }),
      db.rawApiPayload.findMany({
        where: { entityKey: candidate.mint },
        orderBy: { capturedAt: "desc" },
        take: 25,
      }),
    ]);

    const summary = this.toCandidateQueueRow(candidate, settings.strategy.liveStrategy);
    return {
      summary: {
        ...summary,
        name: candidate.name,
        rejectReason: candidate.rejectReason,
        metadata: asRecord(candidate.metadata),
        filterState: this.snapshotRecord(candidate),
      },
      snapshots: snapshots.map((snapshot) => this.snapshotRecord(snapshot)),
      payloads: payloads.map((payload) => ({
        provider: payload.provider,
        endpoint: payload.endpoint,
        success: payload.success,
        statusCode: payload.statusCode,
        errorMessage: payload.errorMessage,
        capturedAt: payload.capturedAt.toISOString(),
        entityKey: payload.entityKey,
        requestParams: payload.requestParams,
        responseBody: payload.responseBody,
      })),
    };
  }

  async getPositionBook(book: "open" | "closed"): Promise<PositionBookPayload> {
    const where = { status: book === "open" ? "OPEN" : "CLOSED" } as const;
    const [settings, rows] = await Promise.all([
      this.config.getSettings(),
      db.position.findMany({
        where,
        take: 120,
        orderBy: book === "open" ? { openedAt: "desc" } : { closedAt: "desc" },
      }),
    ]);

    const positionIds = rows.map((r) => r.id);
    const mints = rows.map((r) => r.mint);

    const [latestMetricsRows, latestFillsRows] = await Promise.all([
      db.tokenMetrics.findMany({
        where: {
          OR: [
            { positionId: { in: positionIds } },
            { mint: { in: mints } },
          ],
        },
        orderBy: { capturedAt: "desc" },
      }),
      db.fill.findMany({
        where: { positionId: { in: positionIds } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const latestMetricsMap = new Map<string, { capturedAt: Date }>();
    for (const metric of latestMetricsRows) {
      const key = metric.positionId ?? metric.mint;
      if (!latestMetricsMap.has(key)) {
        latestMetricsMap.set(key, metric);
      }
    }

    const latestFillMap = new Map<string, { createdAt: Date; metadata: unknown }>();
    for (const fill of latestFillsRows) {
      if (!latestFillMap.has(fill.positionId)) {
        latestFillMap.set(fill.positionId, fill);
      }
    }

    const mapped = rows.map((row) => this.toPositionBookRowWithPrefetchedData(
      row,
      settings.strategy.liveStrategy,
      latestMetricsMap.get(row.id)?.capturedAt ?? latestMetricsMap.get(row.mint)?.capturedAt ?? null,
      latestFillMap.get(row.id) ?? null,
    ));
    mapped.sort((left, right) => book === "open"
      ? right.interventionPriority - left.interventionPriority
      : Date.parse(right.closedAt ?? right.openedAt) - Date.parse(left.closedAt ?? left.openedAt));

    const realized = await db.fill.aggregate({
      _sum: { pnlUsd: true },
      where: { side: "SELL" },
    });
    const [openCount, closedCount] = await Promise.all([
      db.position.count({ where: { status: "OPEN" } }),
      db.position.count({ where: { status: "CLOSED" } }),
    ]);

    return {
      book,
      rows: mapped,
      totals: {
        openCount,
        closedCount,
        realizedPnlUsd: Number(realized._sum.pnlUsd ?? 0),
      },
    };
  }

  async getPositionDetail(positionId: string): Promise<PositionDetailPayload | null> {
    const [settings, position] = await Promise.all([
      this.config.getSettings(),
      db.position.findUnique({
        where: { id: positionId },
        include: {
          fills: { orderBy: { createdAt: "asc" } },
          candidates: { orderBy: { discoveredAt: "desc" }, take: 1 },
        },
      }),
    ]);
    if (!position) return null;

    const snapshots = await db.tokenMetrics.findMany({
      where: { OR: [{ positionId }, { mint: position.mint }] },
      orderBy: { capturedAt: "desc" },
      take: 40,
    });

    const latestFill = position.fills.length > 0
      ? position.fills.reduce((latest, fill) => fill.createdAt > latest.createdAt ? fill : latest)
      : null;
    const row = this.toPositionBookRowWithPrefetchedData(
      position,
      settings.strategy.liveStrategy,
      snapshots[0]?.capturedAt ?? null,
      latestFill ? { createdAt: latestFill.createdAt, metadata: latestFill.metadata } : null,
    );

    const fillRecords = position.fills.map((fill) => this.fillRecord(fill));

    return {
      summary: {
        ...row,
        amountUsd: Number(position.amountUsd),
        amountToken: Number(position.amountToken),
        peakPriceUsd: Number(position.peakPriceUsd),
        stopLossPriceUsd: Number(position.stopLossPriceUsd),
        tp1Done: position.tp1Done,
        tp2Done: position.tp2Done,
        metadata: asRecord(position.metadata),
      },
      fills: fillRecords,
      executionSummary: this.buildExecutionSummary(fillRecords),
      snapshots: snapshots.map((snapshot) => this.snapshotRecord(snapshot)),
      linkedCandidate: position.candidates[0] ? this.snapshotRecord(position.candidates[0]) : null,
    };
  }

  async getDiagnostics(): Promise<DiagnosticsPayload> {
    const [providerRows, endpointRows, latestPayloadFailures, botState, budget] = await Promise.all([
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT provider, total_calls, total_units, avg_latency_ms, error_count
        FROM v_api_provider_daily
        WHERE session_date = CURRENT_DATE
        ORDER BY provider
      `),
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT provider, endpoint, total_calls, total_units, avg_latency_ms, error_count, last_called_at
        FROM v_api_endpoint_efficiency
        ORDER BY total_units DESC, total_calls DESC
        LIMIT 12
      `),
      db.rawApiPayload.count({
        where: {
          success: false,
          capturedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
      }),
      this.risk.getSnapshot(),
      this.providerBudget.getBirdeyeBudgetSnapshot(),
    ]);

    const diagnostics = this.buildDiagnostics(botState, budget, latestPayloadFailures);

    return {
      summary: {
        providerErrors: providerRows.reduce((sum, row) => sum + Number(row.error_count ?? 0), 0),
        totalCalls: providerRows.reduce((sum, row) => sum + Number(row.total_calls ?? 0), 0),
        totalUnits: providerRows.reduce((sum, row) => sum + Number(row.total_units ?? 0), 0),
        latestPayloadFailures,
      },
      providerRows,
      endpointRows,
      staleComponents: diagnostics.staleComponents,
      issues: diagnostics.issues,
    };
  }

  private buildPrimaryBlocker(botState: BotState, gate: Awaited<ReturnType<RiskEngine["canOpenPosition"]>>) {
    if (botState.pauseReason) {
      return {
        label: botState.pauseReason === LIVE_STARTUP_PAUSE_REASON ? "Live startup hold" : "Manual pause",
        detail: botState.pauseReason,
        level: "warning" as const,
      };
    }

    if (!gate.allowed) {
      return {
        label: "Entry blocked",
        detail: gate.reason ?? null,
        level: gate.retryable ? "warning" as const : "danger" as const,
      };
    }

    return null;
  }

  private buildDiagnostics(
    botState: BotState,
    budget: Awaited<ReturnType<ProviderBudgetService["getBirdeyeBudgetSnapshot"]>>,
    latestPayloadFailures = 0,
  ) {
    const staleComponents: string[] = [];
    const issues: Array<{ id: string; label: string; detail: string; level: "warning" | "danger" }> = [];
    const now = Date.now();

    if (!botState.lastDiscoveryAt || now - botState.lastDiscoveryAt.getTime() > 30 * 60 * 1000) {
      staleComponents.push("discovery");
      issues.push({
        id: "discovery-stale",
        label: "Discovery stale",
        detail: botState.lastDiscoveryAt
          ? `Last discovery ran at ${botState.lastDiscoveryAt.toISOString()}.`
          : "Discovery has not run yet.",
        level: "warning",
      });
    }

    if (!botState.lastEvaluationAt || now - botState.lastEvaluationAt.getTime() > 20 * 60 * 1000) {
      staleComponents.push("evaluation");
      issues.push({
        id: "evaluation-stale",
        label: "Evaluation stale",
        detail: botState.lastEvaluationAt
          ? `Last evaluation ran at ${botState.lastEvaluationAt.toISOString()}.`
          : "Evaluation has not run yet.",
        level: "warning",
      });
    }

    if (budget.projectedMonthlyUnits >= budget.monthlyBudgetUnits) {
      issues.push({
        id: "budget-hot",
        label: "Birdeye pace above cap",
        detail: `${budget.projectedMonthlyUnits}/${budget.monthlyBudgetUnits} projected monthly units.`,
        level: "danger",
      });
    } else if (budget.projectedMonthlyUnits >= budget.monthlyBudgetUnits * 0.85) {
      issues.push({
        id: "budget-warning",
        label: "Birdeye pace elevated",
        detail: `${budget.projectedMonthlyUnits}/${budget.monthlyBudgetUnits} projected monthly units.`,
        level: "warning",
      });
    }

    if (latestPayloadFailures > 0) {
      issues.push({
        id: "payload-failures",
        label: "Recent payload failures",
        detail: `${latestPayloadFailures} provider payload failures recorded in the last six hours.`,
        level: latestPayloadFailures >= 5 ? "danger" : "warning",
      });
    }

    const status: "healthy" | "warning" | "danger" = issues.some((issue) => issue.level === "danger")
      ? "danger"
      : issues.length > 0
        ? "warning"
        : "healthy";

    return { status, staleComponents, issues };
  }

  private buildCandidateBucketCounts(rows: Candidate[]) {
    const counts = new Map<CandidateDeskBucket, number>([
      ["ready", 0],
      ["risk", 0],
      ["provider", 0],
      ["data", 0],
    ]);

    for (const row of rows) {
      const bucket = this.getCandidateBucket(row);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    return ([
      ["ready", "Ready or queued"],
      ["risk", "Blocked by risk"],
      ["provider", "Blocked by provider"],
      ["data", "Blocked by data quality"],
    ] as const).map(([bucket, label]) => ({
      bucket,
      label,
      count: counts.get(bucket) ?? 0,
    }));
  }

  private toCandidateQueueRow(row: Candidate & { latestMetrics?: TokenMetrics | null }, liveStrategy: LiveStrategySettings) {
    const secondaryReasons = this.getCandidateSecondaryReasons(row);
    const filterState = this.snapshotRecord(row);
    return {
      id: row.id,
      mint: row.mint,
      symbol: row.symbol,
      source: row.source,
      status: row.status,
      bucket: this.getCandidateBucket(row),
      primaryBlocker: secondaryReasons[0] ?? this.getCandidateBucketLabel(this.getCandidateBucket(row)),
      secondaryReasons: secondaryReasons.slice(1),
      liquidityUsd: maybeNumber(row.latestMetrics?.liquidityUsd),
      volume5mUsd: maybeNumber(row.latestMetrics?.volume1mUsd),
      buySellRatio: maybeNumber(row.latestMetrics?.metadata ? (asRecord(row.latestMetrics.metadata).buySellRatio5m ?? (asRecord(row.latestMetrics.metadata).buySellRatio)) : null),
      top10HolderPercent: maybeNumber(row.latestMetrics?.top10HolderPct),
      discoveredAt: row.discoveredAt.toISOString(),
      lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
      adaptive: buildAdaptiveTokenExplanation({
        liveStrategy,
        filterState,
        metrics: asRecord(row.latestMetrics?.metadata ?? row.metadata),
      }),
    };
  }

  private getCandidateBucket(row: Candidate): CandidateDeskBucket {
    if (row.status === "ERROR") return "provider";
    if (row.status === "SKIPPED") return "risk";
    if (row.status === "DISCOVERED" || row.status === "ACCEPTED" || row.status === "BOUGHT") return "ready";

    const reason = `${row.rejectReason ?? ""} ${JSON.stringify(asRecord(row.metadata))}`.toLowerCase();
    if (/provider|birdeye|helius|timeout|429|upstream|payload|response|fetch/.test(reason)) {
      return "provider";
    }
    if (/pause|max .*open|daily loss|consecutive loss|quote capital|capital|slot/.test(reason)) {
      return "risk";
    }
    return "data";
  }

  private getCandidateSecondaryReasons(row: Candidate): string[] {
    const reasons = new Set<string>();
    if (row.rejectReason) reasons.add(row.rejectReason);
    const metadata = asRecord(row.metadata);
    if (typeof metadata.deferReason === "string" && metadata.deferReason.trim()) reasons.add(metadata.deferReason);
    if (typeof metadata.error === "string" && metadata.error.trim()) reasons.add(metadata.error);
    if (typeof metadata.liveTradable === "boolean" && metadata.liveTradable === false) reasons.add("not live tradable");
    return [...reasons];
  }

  private getCandidateBucketLabel(bucket: CandidateDeskBucket): string {
    switch (bucket) {
      case "ready":
        return "Ready or queued";
      case "risk":
        return "Risk or capacity blocker";
      case "provider":
        return "Provider or runtime blocker";
      case "data":
        return "Data-quality blocker";
    }
  }

  private toPositionBookRowWithPrefetchedData(
    row: Position,
    liveStrategy: LiveStrategySettings,
    latestSnapshotAt: Date | null,
    latestFill: { createdAt: Date; metadata: unknown } | null,
  ) {
    const priority = this.getInterventionPriority(row, latestSnapshotAt);
    const metadata = asRecord(row.metadata);
    const metrics = asRecord(metadata.metrics);
    const entryPriceUsd = Number(row.entryPriceUsd);
    const currentPriceUsd = Number(row.currentPriceUsd);
    const remainingToken = Number(row.remainingToken);
    const unrealizedPnlUsd = row.status === "OPEN"
      ? (currentPriceUsd - entryPriceUsd) * remainingToken
      : 0;
    const returnPct = entryPriceUsd > 0
      ? ((currentPriceUsd - entryPriceUsd) / entryPriceUsd) * 100
      : 0;
    const latestFillMetadata = latestFill ? asRecord(latestFill.metadata) : {};
    const latestFillLive = asRecord(latestFillMetadata.live);
    const latestFillTiming = asRecord(latestFillLive.timing);

    return {
      id: row.id,
      mint: row.mint,
      symbol: row.symbol,
      status: row.status,
      interventionPriority: priority.score,
      interventionLabel: priority.label,
      entryPriceUsd,
      currentPriceUsd,
      remainingToken,
      unrealizedPnlUsd,
      returnPct,
      exitReason: row.exitReason,
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      lastFillAt: latestFill?.createdAt.toISOString() ?? null,
      latestExecutionLatencyMs: maybeNumber(latestFillTiming.totalMs),
      adaptive: buildAdaptiveTokenExplanation({
        liveStrategy,
        filterState: asRecord(metadata.filterState),
        metrics: {
          ...metrics,
          entryScore: maybeNumber(metadata.entryScore) ?? maybeNumber(metrics.entryScore),
        },
      }),
    };
  }

  private getInterventionPriority(row: Position, latestSnapshotAt: Date | null) {
    if (row.status === "CLOSED") {
      return {
        score: 0,
        label: row.exitReason ?? "Closed",
      };
    }

    const entry = Number(row.entryPriceUsd);
    const current = Number(row.currentPriceUsd);
    const stop = Number(row.stopLossPriceUsd);
    const stopDistancePct = current > 0 ? ((current - stop) / current) * 100 : 999;
    const returnPct = entry > 0 ? ((current - entry) / entry) * 100 : 0;
    const staleMinutes = latestSnapshotAt ? (Date.now() - latestSnapshotAt.getTime()) / 60_000 : 999;
    let score = 0;

    if (stopDistancePct <= 2) score += 60;
    else if (stopDistancePct <= 5) score += 35;
    if (returnPct <= -8) score += 25;
    else if (returnPct <= -3) score += 10;
    if (staleMinutes >= 20) score += 35;
    else if (staleMinutes >= 10) score += 15;
    if (!row.tp1Done) score += 8;
    if (row.tp1Done && !row.tp2Done) score += 12;

    const label = staleMinutes >= 20
      ? "Stale price follow-up"
      : stopDistancePct <= 2
        ? "Near stop"
        : returnPct <= -8
          ? "Loss pressure"
          : row.tp1Done && !row.tp2Done
            ? "Post-TP1 management"
            : "Monitor";

    return { score, label };
  }

  private toEventPayload(event: Awaited<ReturnType<typeof listOperatorEvents>>[number]): OperatorEventPayload {
    return {
      id: event.id,
      kind: event.kind,
      level: normalizeEventLevel(event.level),
      title: event.title,
      detail: event.detail,
      entityType: event.entityType,
      entityId: event.entityId,
      createdAt: event.createdAt.toISOString(),
    };
  }

  private snapshotRecord(row: Candidate | Position | TokenMetrics) {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : maybeNumber(value) ?? value,
      ]),
    );
  }

  private fillRecord(fill: Fill) {
    const metadata = asRecord(fill.metadata);
    const live = asRecord(metadata.live);
    const timing = asRecord(live.timing);
    const executionReason = fill.executionReason ?? (typeof metadata.reason === "string" ? metadata.reason : null);
    const entryOrigin = fill.entryOrigin ?? (typeof metadata.entryOrigin === "string" ? metadata.entryOrigin : null);

    return {
      id: fill.id,
      side: fill.side,
      executionReason,
      entryOrigin,
      priceUsd: Number(fill.priceUsd),
      amountUsd: Number(fill.amountUsd),
      amountToken: Number(fill.amountToken),
      pnlUsd: fill.pnlUsd == null ? null : Number(fill.pnlUsd),
      txSignature: fill.txSignature,
      totalLatencyMs: maybeNumber(fill.totalLatencyMs) ?? maybeNumber(timing.totalMs),
      quoteLatencyMs: maybeNumber(fill.quoteLatencyMs) ?? maybeNumber(timing.quoteMs),
      swapBuildLatencyMs: maybeNumber(fill.swapBuildLatencyMs) ?? maybeNumber(timing.swapBuildMs),
      senderBuildLatencyMs: maybeNumber(fill.senderBuildLatencyMs) ?? maybeNumber(timing.senderBuildMs),
      broadcastConfirmLatencyMs: maybeNumber(fill.broadcastConfirmLatencyMs) ?? maybeNumber(timing.broadcastAndConfirmMs),
      settlementReadLatencyMs: maybeNumber(fill.settlementReadLatencyMs) ?? maybeNumber(timing.settlementReadMs),
      executionSlippageBps: maybeNumber(fill.executionSlippageBps) ?? maybeNumber(live.executionSlippageBps),
      quotedOutAmountUsd: maybeNumber(fill.quotedOutAmountUsd) ?? maybeNumber(live.quotedOutAmountUsd),
      actualOutAmountUsd: maybeNumber(fill.actualOutAmountUsd) ?? maybeNumber(live.actualOutAmountUsd),
      quotedOutAmountToken: maybeNumber(fill.quotedOutAmountToken) ?? maybeNumber(live.quotedOutAmountToken),
      actualOutAmountToken: maybeNumber(fill.actualOutAmountToken) ?? maybeNumber(live.actualOutAmountToken),
      discoveryLabReportAgeMsAtEntry: maybeNumber(metadata.discoveryLabReportAgeMsAtEntry),
      discoveryLabRunAgeMsAtEntry: maybeNumber(metadata.discoveryLabRunAgeMsAtEntry),
      discoveryLabCompletionLagMsAtEntry: maybeNumber(metadata.discoveryLabCompletionLagMsAtEntry),
      metadata: fill.metadata,
      createdAt: fill.createdAt.toISOString(),
    };
  }

  private async getDeskKpis() {
    const [performanceRows, providerLatencyRows, hotEndpointRows, executionLatencyRows] = await Promise.all([
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT
          COALESCE(SUM(CASE WHEN session_date = CURRENT_DATE THEN realized_pnl_usd ELSE 0 END), 0)::numeric AS realized_pnl_today_usd,
          COALESCE(SUM(realized_pnl_usd), 0)::numeric AS realized_pnl_7d_usd,
          CASE
            WHEN SUM(closed_count) > 0 THEN SUM(win_rate * closed_count)::numeric / SUM(closed_count)::numeric
            ELSE 0
          END::numeric(12, 4) AS win_rate_7d,
          CASE
            WHEN SUM(closed_count) > 0 THEN SUM(avg_return_pct * closed_count)::numeric / SUM(closed_count)::numeric
            ELSE 0
          END::numeric(12, 4) AS avg_return_pct_7d,
          CASE
            WHEN SUM(closed_count) > 0 THEN SUM(avg_hold_minutes * closed_count)::numeric / SUM(closed_count)::numeric
            ELSE 0
          END::numeric(12, 2) AS avg_hold_minutes_7d
        FROM v_position_pnl_daily
        WHERE session_date >= CURRENT_DATE - INTERVAL '6 days'
      `),
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT
          CASE
            WHEN SUM(total_calls) > 0 THEN SUM(avg_latency_ms * total_calls)::numeric / SUM(total_calls)::numeric
            ELSE 0
          END::numeric(12, 2) AS provider_avg_latency_ms_today
        FROM v_api_provider_daily
        WHERE session_date = CURRENT_DATE
      `),
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT COALESCE(avg_latency_ms, 0)::numeric(12, 2) AS hot_endpoint_avg_latency_ms_today
        FROM v_api_endpoint_efficiency
        WHERE last_called_at >= CURRENT_DATE
        ORDER BY total_calls DESC, total_units DESC, avg_latency_ms DESC
        LIMIT 1
      `),
      db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        WITH execution_fills AS (
          SELECT
            (metadata -> 'live' -> 'timing' ->> 'totalMs')::numeric AS total_latency_ms,
            CASE
              WHEN COALESCE(metadata -> 'live' ->> 'executionSlippageBps', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                THEN (metadata -> 'live' ->> 'executionSlippageBps')::numeric
              ELSE NULL
            END AS execution_slippage_bps
          FROM "Fill"
          WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
            AND COALESCE(metadata -> 'live' -> 'timing' ->> 'totalMs', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
        )
        SELECT
          COALESCE(AVG(total_latency_ms), 0)::numeric(12, 2) AS avg_execution_latency_ms_24h,
          COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms), 0)::numeric(12, 2) AS p95_execution_latency_ms_24h,
          COALESCE(AVG(execution_slippage_bps), 0)::numeric(12, 4) AS avg_execution_slippage_bps_24h
        FROM execution_fills
      `),
    ]);

    const performance = performanceRows[0] ?? {};
    const providerLatency = providerLatencyRows[0] ?? {};
    const hotEndpoint = hotEndpointRows[0] ?? {};
    const executionLatency = executionLatencyRows[0] ?? {};

    return {
      performance: {
        realizedPnlTodayUsd: maybeNumber(performance.realized_pnl_today_usd) ?? 0,
        realizedPnl7dUsd: maybeNumber(performance.realized_pnl_7d_usd) ?? 0,
        winRate7d: maybeNumber(performance.win_rate_7d) ?? 0,
        avgReturnPct7d: maybeNumber(performance.avg_return_pct_7d) ?? 0,
        avgHoldMinutes7d: maybeNumber(performance.avg_hold_minutes_7d) ?? 0,
      },
      latency: {
        providerAvgLatencyMsToday: maybeNumber(providerLatency.provider_avg_latency_ms_today) ?? 0,
        hotEndpointAvgLatencyMsToday: maybeNumber(hotEndpoint.hot_endpoint_avg_latency_ms_today) ?? 0,
        avgExecutionLatencyMs24h: maybeNumber(executionLatency.avg_execution_latency_ms_24h) ?? 0,
        p95ExecutionLatencyMs24h: maybeNumber(executionLatency.p95_execution_latency_ms_24h) ?? 0,
        avgExecutionSlippageBps24h: maybeNumber(executionLatency.avg_execution_slippage_bps_24h) ?? 0,
      },
    };
  }

  private buildExecutionSummary(fills: Array<Record<string, unknown>>) {
    const latencyValues = fills
      .map((fill) => maybeNumber(fill.totalLatencyMs))
      .filter((value): value is number => value != null)
      .sort((left, right) => left - right);
    const slippageValues = fills
      .map((fill) => maybeNumber(fill.executionSlippageBps))
      .filter((value): value is number => value != null);

    return {
      fillCount: fills.length,
      avgExecutionLatencyMs: latencyValues.length > 0
        ? latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length
        : null,
      p95ExecutionLatencyMs: percentile(latencyValues, 0.95),
      avgExecutionSlippageBps: slippageValues.length > 0
        ? slippageValues.reduce((sum, value) => sum + value, 0) / slippageValues.length
        : null,
      lastExecutionLatencyMs: fills.length > 0 ? maybeNumber(fills[fills.length - 1]?.totalLatencyMs) : null,
    };
  }
}

function normalizeEventLevel(level: string): "info" | "warning" | "danger" {
  if (level === "warning" || level === "danger") return level;
  return "info";
}

function maybeNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value && "toString" in value) {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function percentile(sortedValues: number[], quantile: number): number | null {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower] ?? null;
  const lowerValue = sortedValues[lower] ?? sortedValues[0];
  const upperValue = sortedValues[upper] ?? sortedValues[sortedValues.length - 1];
  const weight = index - lower;
  return lowerValue + (upperValue - lowerValue) * weight;
}
