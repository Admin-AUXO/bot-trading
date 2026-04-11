export type ViewRow = Record<string, string | number | null>;

export type OperatorEvent = {
  id: string;
  kind: string;
  level: "info" | "warning" | "danger";
  title: string;
  detail: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
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
  availableActions: Array<{
    id: "pause" | "resume" | "discover-now" | "evaluate-now" | "exit-check-now" | "run-research-dry-run";
    label: string;
    enabled: boolean;
    confirmation?: string;
  }>;
  statusSummary: {
    openPositions: number;
    maxOpenPositions: number;
    queuedCandidates: number;
    activeResearchRun: boolean;
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
  queue: {
    queuedCandidates: number;
    buckets: Array<{ bucket: CandidateBucket; count: number; label: string }>;
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
  recentFailures: OperatorEvent[];
  recentActions: OperatorEvent[];
};

export type CandidateBucket = "ready" | "risk" | "provider" | "data";

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
};

export type CandidateQueuePayload = {
  bucket: CandidateBucket;
  buckets: Array<{ bucket: CandidateBucket; label: string; count: number }>;
  rows: CandidateQueueRow[];
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
  exitReason: string | null;
  openedAt: string;
  closedAt: string | null;
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

export type SettingsValidationIssue = {
  path: string;
  message: string;
};

export type SettingsDryRunSummary = {
  ranAt: string;
  basedOnUpdatedAt: string;
  changedPaths: string[];
  liveAffectingPaths: string[];
  currentGate: {
    allowed: boolean;
    reason: string | null;
  };
  draftGate: {
    allowed: boolean;
    reason: string | null;
  };
  openPositions: number;
  queuedCandidates: number;
  noNewBlocker: boolean;
  safeToPromote: boolean;
};

export type SettingsControlState = {
  active: BotSettings;
  draft: BotSettings | null;
  dirty: boolean;
  changedPaths: string[];
  liveAffectingPaths: string[];
  validation: {
    ok: boolean;
    issues: SettingsValidationIssue[];
  };
  dryRun: SettingsDryRunSummary | null;
  activeUpdatedAt: string;
  basedOnUpdatedAt: string | null;
  sections: Array<{
    id: "capital" | "strategy" | "entry" | "exit" | "research" | "advanced";
    label: string;
    editable: boolean;
    paths: string[];
  }>;
};

export type ActionResponse = {
  ok: boolean;
  action: string;
  shell: DeskShellPayload;
  home: DeskHomePayload;
};

export type ResearchRunComparison = {
  previousRunId: string;
  realizedPnlUsdDelta: number;
  strategyPassRateDeltaPercent: number;
  mockWinRateDeltaPercent: number;
  averageHoldMinutesDelta: number;
  openedCountDelta: number;
};

export type ResearchRunSummary = {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  startedAt: string;
  completedAt: string | null;
  lastPolledAt: string | null;
  pollIntervalMs: number;
  maxDurationMs: number;
  discoveryLimit: number;
  fullEvaluationLimit: number;
  maxMockPositions: number;
  fixedPositionSizeUsd: number;
  birdeyeUnitCap: number;
  heliusUnitCap: number;
  totalDiscovered: number;
  totalShortlisted: number;
  totalEvaluated: number;
  totalStrategyPassed: number;
  totalMockOpened: number;
  totalMockClosed: number;
  liveTradablePassed: number;
  researchTradablePassed: number;
  birdeyeCalls: number;
  birdeyeUnitsUsed: number;
  heliusCalls: number;
  heliusUnitsUsed: number;
  realizedPnlUsd: number;
  winRatePercent: number | null;
  averageHoldMinutes: number | null;
  errorMessage: string | null;
  comparison: ResearchRunComparison | null;
  configSnapshot: BotSettings;
};

export type BotSettings = {
  tradeMode: "DRY_RUN" | "LIVE";
  cadence: {
    discoveryIntervalMs: number;
    offHoursDiscoveryIntervalMs: number;
    evaluationIntervalMs: number;
    idleEvaluationIntervalMs: number;
    exitIntervalMs: number;
    entryDelayMs: number;
    evaluationConcurrency: number;
  };
  strategy: {
    livePresetId: "FIRST_MINUTE_POSTGRAD_CONTINUATION" | "LATE_CURVE_MIGRATION_SNIPE";
    dryRunPresetId: "FIRST_MINUTE_POSTGRAD_CONTINUATION" | "LATE_CURVE_MIGRATION_SNIPE";
    heliusWatcherEnabled: boolean;
  };
  capital: {
    capitalUsd: number;
    positionSizeUsd: number;
    maxOpenPositions: number;
  };
  filters: {
    minLiquidityUsd: number;
    maxMarketCapUsd: number;
    minHolders: number;
    minUniqueBuyers5m: number;
    minBuySellRatio: number;
    maxTop10HolderPercent: number;
    maxSingleHolderPercent: number;
    maxGraduationAgeSeconds: number;
    minVolume5mUsd: number;
    maxNegativePriceChange5mPercent: number;
    securityCheckMinLiquidityUsd: number;
    securityCheckVolumeMultiplier: number;
    maxTransferFeePercent: number;
  };
  exits: {
    stopLossPercent: number;
    tp1Multiplier: number;
    tp2Multiplier: number;
    tp1SellFraction: number;
    tp2SellFraction: number;
    postTp1RetracePercent: number;
    trailingStopPercent: number;
    timeStopMinutes: number;
    timeStopMinReturnPercent: number;
    timeLimitMinutes: number;
  };
  research: {
    discoveryLimit: number;
    fullEvaluationLimit: number;
    maxMockPositions: number;
    fixedPositionSizeUsd: number;
    pollIntervalMs: number;
    maxRunDurationMs: number;
    birdeyeUnitCap: number;
    heliusUnitCap: number;
  };
};
