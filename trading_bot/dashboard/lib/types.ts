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
    id: "pause" | "resume" | "discover-now" | "evaluate-now" | "exit-check-now";
    label: string;
    enabled: boolean;
    confirmation?: string;
  }>;
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

export type DiscoveryLabProfile = "runtime" | "high-value" | "scalp";
export type DiscoveryLabPackKind = "builtin" | "custom";
export type DiscoveryLabRunStatus = "RUNNING" | "COMPLETED" | "FAILED" | "INTERRUPTED";
export type DiscoveryLabRecipeMode = "graduated" | "pregrad";

export type DiscoveryLabThresholdOverrides = Partial<{
  minLiquidityUsd: number;
  maxMarketCapUsd: number;
  minHolders: number;
  minVolume5mUsd: number;
  minUniqueBuyers5m: number;
  minBuySellRatio: number;
  maxTop10HolderPercent: number;
  maxSingleHolderPercent: number;
  maxNegativePriceChange5mPercent: number;
}>;

export type StrategyRecipeMode = "graduated" | "pregrad";
export type StrategyRecipeParamValue = string | number | boolean | null;

export type StrategyPackRecipe = {
  name: string;
  mode: StrategyRecipeMode;
  description?: string;
  deepEvalLimit?: number;
  params: Record<string, StrategyRecipeParamValue>;
};

export type StrategyThresholdOverrides = Partial<{
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
}>;

export type StrategyExitOverrides = Partial<{
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
}>;

export type LiveStrategyCalibrationSummary = {
  winnerCount: number;
  avgWinnerScore: number | null;
  avgWinnerVolume5mUsd: number | null;
  avgWinnerMarketCapUsd: number | null;
  avgWinnerTimeSinceGraduationMin: number | null;
  avgRecipeOverlap: number | null;
  volumeStrength: number | null;
  graduationFreshness: number | null;
  calibrationConfidence: number | null;
  dominantMode: StrategyRecipeMode | null;
  derivedProfile: "scalp" | "balanced" | "runner" | null;
};

export type LiveStrategySettings = {
  enabled: boolean;
  sourceRunId: string | null;
  packId: string | null;
  packName: string | null;
  sources: string[];
  recipes: StrategyPackRecipe[];
  thresholdOverrides: StrategyThresholdOverrides;
  exitOverrides: StrategyExitOverrides;
  capitalModifierPercent: number;
  dominantMode: StrategyRecipeMode | null;
  dominantPresetId: "FIRST_MINUTE_POSTGRAD_CONTINUATION" | "LATE_CURVE_MIGRATION_SNIPE" | null;
  calibrationSummary: LiveStrategyCalibrationSummary | null;
  updatedAt: string | null;
};

export type DiscoveryLabRecipe = {
  name: string;
  mode: DiscoveryLabRecipeMode;
  description?: string;
  deepEvalLimit?: number;
  params: Record<string, string | number | boolean | null>;
};

export type DiscoveryLabPack = {
  id: string;
  kind: DiscoveryLabPackKind;
  name: string;
  description: string;
  defaultSources: string[];
  defaultProfile: DiscoveryLabProfile;
  thresholdOverrides: DiscoveryLabThresholdOverrides;
  recipes: DiscoveryLabRecipe[];
  updatedAt: string;
  sourcePath: string;
};

export type DiscoveryLabPackDraft = {
  id?: string;
  name: string;
  description?: string;
  defaultSources?: string[];
  defaultProfile?: DiscoveryLabProfile;
  thresholdOverrides?: DiscoveryLabThresholdOverrides;
  recipes: DiscoveryLabRecipe[];
};

export type DiscoveryLabValidationIssue = {
  path: string;
  message: string;
  level: "error" | "warning";
};

export type DiscoveryLabValidationResponse = {
  ok: boolean;
  issues: DiscoveryLabValidationIssue[];
  pack: DiscoveryLabPackDraft;
};

export type DiscoveryLabRunSummary = {
  id: string;
  status: DiscoveryLabRunStatus;
  createdAt: string;
  startedAt: string;
  completedAt: string | null;
  packId: string;
  packName: string;
  packKind: DiscoveryLabPackKind;
  profile: DiscoveryLabProfile;
  sources: string[];
  allowOverfiltered: boolean;
  queryCount: number | null;
  winnerCount: number | null;
  evaluationCount: number | null;
  errorMessage: string | null;
};

export type DiscoveryLabRunReport = {
  generatedAt: string;
  profile: DiscoveryLabProfile;
  thresholds: Record<string, string | number>;
  recipePath: string;
  sources: string[];
  queryCount: number;
  querySummaries: Array<{
    key: string;
    source: string;
    recipeName: string;
    recipeMode: DiscoveryLabRecipeMode;
    filterCount: number;
    returnedCount: number;
    selectedCount: number;
    goodCount: number;
    avgGoodPlayScore: number;
    avgGoodEntryScore: number;
    avgSelectedPlayScore: number;
    avgSelectedEntryScore: number;
    estimatedCu: number;
    goodMints: string[];
    topSelectedTokens: Array<{ symbol: string; mint: string; grade: string; playScore: number; rejectReason: string | null }>;
    topGoodTokens: Array<{ symbol: string; mint: string; grade: string; playScore: number; rejectReason: string | null }>;
  }>;
  sourceSummaries: Array<{
    source: string;
    recipesRun: number;
    totalReturned: number;
    totalGoodTokens: number;
    uniqueGoodTokens: number;
    bestByGoodCount: string | null;
    bestByAverageScore: string | null;
    bestByEfficiency: string | null;
    bestByQuality: string | null;
  }>;
  winners: Array<{
    tokenName: string;
    address: string;
    timeSinceGraduationMin: number | null;
    timeSinceCreationMin: number | null;
    priceUsd: number | null;
    liquidityUsd: number | null;
    holders: number | null;
    volume1mUsd: number | null;
    volume5mUsd: number | null;
    volumeChange1mPercent: number | null;
    volumeChange5mPercent: number | null;
    priceChange1mPercent: number | null;
    priceChange5mPercent: number | null;
    trades1m: number | null;
    trades5m: number | null;
    uniqueWallets5m: number | null;
    uniqueWallets24h: number | null;
    buySellRatio: number | null;
    marketCapUsd: number | null;
    mintAuth: string | null;
    top10HolderPercent: number | null;
    maxSingleHolderPercent: number | null;
    score: number;
    whichRecipes: string[];
  }>;
  deepEvaluations: Array<{
    planKey: string;
    recipeName: string;
    mode: DiscoveryLabRecipeMode;
    mint: string;
    symbol: string;
    source: string;
    playScore: number;
    entryScore: number;
    grade: string;
    pass: boolean;
    rejectReason: string | null;
    priceUsd: number | null;
    liquidityUsd: number | null;
    marketCapUsd: number | null;
    holders: number | null;
    volume5mUsd: number | null;
    volume30mUsd: number | null;
    uniqueWallets5m: number | null;
    buySellRatio: number | null;
    priceChange5mPercent: number | null;
    priceChange30mPercent: number | null;
    top10HolderPercent: number | null;
    largestHolderPercent: number | null;
    timeSinceGraduationMin: number | null;
    timeSinceCreationMin: number | null;
    softIssues: string[];
    notes: string[];
  }>;
};

export type DiscoveryLabRunDetail = DiscoveryLabRunSummary & {
  packSnapshot: DiscoveryLabPack;
  thresholdOverrides: DiscoveryLabThresholdOverrides;
  stdout: string;
  stderr: string;
  report: DiscoveryLabRunReport | null;
  strategyCalibration: LiveStrategySettings | null;
};

export type DiscoveryLabCatalog = {
  packs: DiscoveryLabPack[];
  activeRun: DiscoveryLabRunSummary | null;
  recentRuns: DiscoveryLabRunSummary[];
  profiles: DiscoveryLabProfile[];
  knownSources: string[];
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
    liveStrategy: LiveStrategySettings;
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

export type DiscoveryLabRuntimeSnapshot = {
  botState: {
    tradeMode: "DRY_RUN" | "LIVE";
    capitalUsd: number;
    cashUsd: number;
    realizedPnlUsd: number;
    pauseReason: string | null;
  };
  openPositions: number;
  settings: BotSettings;
};

export type DiscoveryLabManualEntryResponse = {
  candidateId: string;
  positionId: string;
  symbol: string;
  entryPriceUsd: number;
  strategyPresetId: "FIRST_MINUTE_POSTGRAD_CONTINUATION" | "LATE_CURVE_MIGRATION_SNIPE";
};

export type DiscoveryLabStrategyCalibration = LiveStrategySettings;

export type DiscoveryLabApplyLiveStrategyResponse = {
  ok: true;
  strategy: DiscoveryLabStrategyCalibration;
};
