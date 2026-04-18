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
  adaptiveModel: AdaptiveModelState;
  recentFailures: OperatorEvent[];
  recentActions: OperatorEvent[];
  positions?: PositionBookRow[];
};

export type AdaptiveModelState = {
  status: "inactive" | "active" | "stale" | "degraded";
  automationUsesAdaptive: boolean;
  enabled: boolean;
  sourceRunId: string | null;
  packId: string | null;
  packName: string | null;
  dominantMode: "graduated" | "pregrad" | null;
  dominantPresetId: "FIRST_MINUTE_POSTGRAD_CONTINUATION" | "LATE_CURVE_MIGRATION_SNIPE" | null;
  winnerCount: number;
  bandCount: number;
  calibrationConfidence: number | null;
  staleWarning: string | null;
  degradedWarning: string | null;
  warnings: string[];
  updatedAt: string | null;
};

export type AdaptiveTokenExplanation = {
  enabled: boolean;
  status: "inactive" | "matched" | "partial" | "unmatched";
  matchedBandId: string | null;
  matchedBandLabel: string | null;
  entryPosture: string | null;
  sizePosture: string | null;
  exitPosture: string | null;
  capitalModifierPercent: number | null;
  dominantMode: "graduated" | "pregrad" | null;
  entryScore: number | null;
  volume5mUsd: number | null;
  liquidityUsd: number | null;
  buySellRatio: number | null;
  graduationAgeMin: number | null;
  reasons: string[];
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
  adaptive: AdaptiveTokenExplanation;
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
  unrealizedPnlUsd: number;
  returnPct: number;
  exitReason: string | null;
  openedAt: string;
  closedAt: string | null;
  lastFillAt: string | null;
  latestExecutionLatencyMs: number | null;
  adaptive: AdaptiveTokenExplanation;
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

export type ActionResponse = {
  ok: boolean;
  action: string;
  shell: DeskShellPayload;
  home: DeskHomePayload;
};

export type TradingSessionSnapshot = {
  id: string;
  mode: "DRY_RUN" | "LIVE";
  packId: string | null;
  packName: string;
  packVersion: number | null;
  sourceRunId: string | null;
  previousPackId: string | null;
  previousPackName: string | null;
  previousPackVersion: number | null;
  startedConfigVersionId: number | null;
  stoppedConfigVersionId: number | null;
  startedAt: string;
  stoppedAt: string | null;
  stoppedReason: string | null;
  tradeCount: number;
  openPositionCount: number;
  closedPositionCount: number;
  realizedPnlUsd: number;
};

export type TradingSessionHistoryPayload = {
  currentSession: TradingSessionSnapshot | null;
  sessions: TradingSessionSnapshot[];
};

export type WorkbenchPackSummary = {
  id: string;
  name: string;
  description: string;
  kind: DiscoveryLabPackKind;
  thesis?: string | null;
  defaultProfile?: DiscoveryLabProfile | null;
  defaultSources?: string[];
  recipeCount?: number | null;
  thresholdOverrideCount?: number | null;
  updatedAt: string;
  sourceRunId?: string | null;
  sourcePath?: string | null;
  status?: "DRAFT" | "TESTING" | "GRADED" | "LIVE" | "RETIRED" | null;
  grade?: "A" | "B" | "C" | "D" | "F" | null;
  version?: number | null;
  publishedAt?: string | null;
  runCount?: number | null;
  completedRunCount?: number | null;
  winnerCount?: number | null;
  lastRunStartedAt?: string | null;
  lastRunAt?: string | null;
  lastRunStatus?: DiscoveryLabRunStatus | null;
  latestRunStatus?: DiscoveryLabRunStatus | null;
  latestAppliedAt?: string | null;
  currentSessionId?: string | null;
  isDeployed?: boolean;
};

export type WorkbenchPackListPayload = {
  packs: WorkbenchPackSummary[];
  currentSession?: TradingSessionSnapshot | null;
};

export type WorkbenchPackDetailPayload = {
  pack: DiscoveryLabPack;
  recentRuns?: WorkbenchRunSummary[];
  currentSession?: TradingSessionSnapshot | null;
};

export type WorkbenchRunSummary = {
  id: string;
  status: DiscoveryLabRunStatus;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  packId: string;
  packName: string;
  profile?: DiscoveryLabProfile | null;
  sources?: string[];
  winnerCount?: number | null;
  evaluationCount?: number | null;
  errorMessage?: string | null;
  appliedToLiveAt?: string | null;
  appliedConfigVersionId?: number | null;
  allowOverfiltered?: boolean;
  canApplyLive?: boolean;
  isCurrentSessionSource?: boolean;
};

export type WorkbenchPackRunsPayload = {
  pack: WorkbenchPackSummary | null;
  runs: WorkbenchRunSummary[];
};

export type WorkbenchRunListPayload = {
  runs: WorkbenchRunSummary[];
  currentSession?: TradingSessionSnapshot | null;
};

export type WorkbenchRunDetailPayload = {
  run: DiscoveryLabRunDetail;
  summary?: WorkbenchRunSummary;
  currentSession?: TradingSessionSnapshot | null;
};

export type WorkbenchCreateRunResponse = {
  id?: string;
  runId?: string;
  run?: {
    id?: string;
  };
};

export type WorkbenchApplyLiveResponse = {
  ok?: boolean;
  runId?: string;
  session?: TradingSessionSnapshot;
  strategy?: DiscoveryLabStrategyCalibration;
};

export type DiscoveryLabProfile = "runtime" | "high-value" | "scalp";
export type DiscoveryLabPackKind = "created" | "custom";
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
  maxGraduationAgeSeconds: number;
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

export type AdaptiveWinnerCohort = {
  id: string;
  key: string;
  label: string;
  tokenCount: number;
  winnerCount: number;
  avgWinnerScore: number | null;
  avgWinnerVolume5mUsd: number | null;
  avgWinnerAgeMin: number | null;
};

export type AdaptiveDecisionBand = {
  id: string;
  cohortKey: string;
  label: string;
  eligibility: string;
  entryPosture: string;
  sizePosture: string;
  exitPosture: string;
  confidence: string;
  support: string;
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
  winnerCohorts: AdaptiveWinnerCohort[];
  decisionBands: AdaptiveDecisionBand[];
  updatedAt: string | null;
};

export type DiscoveryLabRecipe = {
  name: string;
  mode: DiscoveryLabRecipeMode;
  description?: string;
  deepEvalLimit?: number;
  targetPnlBand?: {
    label: string;
    minPercent?: number;
    maxPercent?: number;
  };
  params: Record<string, string | number | boolean | null>;
};

export type DiscoveryLabPack = {
  id: string;
  kind: DiscoveryLabPackKind;
  name: string;
  description: string;
  thesis?: string;
  targetPnlBand?: {
    label: string;
    minPercent?: number;
    maxPercent?: number;
  };
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
  thesis?: string;
  targetPnlBand?: {
    label: string;
    minPercent?: number;
    maxPercent?: number;
  };
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
  appliedToLiveAt: string | null;
  appliedConfigVersionId: number | null;
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
    rejectCount: number;
    selectionRatePercent: number;
    passRatePercent: number;
    winnerHitRatePercent: number;
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
    pairAddress?: string | null;
    pairCreatedAt?: string | null;
    socials?: {
      website: string | null;
      twitter: string | null;
      telegram: string | null;
      count: number;
    } | null;
    tradeSetup?: {
      presetId: "FIRST_MINUTE_POSTGRAD_CONTINUATION" | "LATE_CURVE_MIGRATION_SNIPE";
      entryScore: number;
      confidenceScore: number;
      playScore: number | null;
      winnerScore: number | null;
      profile: "scalp" | "balanced" | "runner";
      suggestedCapitalUsd: number;
      entryPriceUsd: number | null;
      stopLossPercent: number;
      stopLossPriceUsd: number | null;
      tp1Percent: number;
      tp1PriceUsd: number | null;
      tp1SellFractionPercent: number;
      tp2Percent: number;
      tp2PriceUsd: number | null;
      tp2SellFractionPercent: number;
      postTp1RetracePercent: number;
      trailingStopPercent: number;
      timeStopMinutes: number;
      timeStopMinReturnPercent: number;
      timeLimitMinutes: number;
    } | null;
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
  adaptiveModel?: AdaptiveModelState;
  currentSession?: TradingSessionSnapshot | null;
};

export type DiscoveryLabTokenInsight = {
  mint: string;
  pairAddress: string | null;
  pairCreatedAt: string | null;
  symbol: string | null;
  name: string | null;
  source: string | null;
  creator: string | null;
  platformId: string | null;
  logoUri: string | null;
  description: string | null;
  socials: {
    website: string | null;
    twitter: string | null;
    telegram: string | null;
    discord: string | null;
  };
  toolLinks: {
    axiom: string;
    dexscreener: string;
    rugcheck: string;
    solscanToken: string;
    solscanCreator: string | null;
  };
  market: {
    priceUsd: number | null;
    liquidityUsd: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    holders: number | null;
    lastTradeAt: string | null;
    uniqueWallet5m: number | null;
    uniqueWallet1h: number | null;
    uniqueWallet24h: number | null;
    trade5m: number | null;
    trade1h: number | null;
    trade24h: number | null;
    buy5m: number | null;
    sell5m: number | null;
    volume5mUsd: number | null;
    volume1hUsd: number | null;
    volume24hUsd: number | null;
    priceChange5mPercent: number | null;
    priceChange30mPercent: number | null;
    priceChange1hPercent: number | null;
    priceChange24hPercent: number | null;
    volume5mChangePercent: number | null;
    volume1hChangePercent: number | null;
    volume24hChangePercent: number | null;
  };
  security: {
    creatorBalancePercent: number | null;
    ownerBalancePercent: number | null;
    updateAuthorityBalancePercent: number | null;
    top10HolderPercent: number | null;
    top10UserPercent: number | null;
    freezeable: boolean | null;
    mintAuthorityEnabled: boolean | null;
    mutableMetadata: boolean | null;
    transferFeeEnabled: boolean | null;
    transferFeePercent: number | null;
    trueToken: boolean | null;
    token2022: boolean | null;
    nonTransferable: boolean | null;
    honeypot: boolean | null;
    fakeToken: boolean | null;
  };
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
  session: TradingSessionSnapshot;
  strategy: DiscoveryLabStrategyCalibration;
};

export type DiscoveryLabMarketTokenRow = {
  mint: string;
  pairAddress: string | null;
  pairCreatedAt: string | null;
  symbol: string;
  name: string;
  source: string | null;
  primarySignal: string;
  graduationAgeMinutes: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  volume5mUsd: number | null;
  volume24hUsd: number | null;
  buys5m: number | null;
  sells5m: number | null;
  priceChange5mPercent: number | null;
  priceChange1hPercent: number | null;
  rugScore: number | null;
  rugScoreNormalized: number | null;
  rugRiskLevel: "danger" | "warning" | "info" | "unknown";
  topRiskName: string | null;
  lpLockedPercent: number | null;
  trackedPositionId: string | null;
  trackedPositionStatus: "OPEN" | "CLOSED" | null;
  socials: {
    website: string | null;
    twitter: string | null;
    telegram: string | null;
    count: number;
  };
  toolLinks: {
    dexscreener: string;
    rugcheck: string;
    axiom: string;
  };
};

export type DiscoveryLabMarketStatsPayload = {
  generatedAt: string;
  meta: {
    refreshMode: "manual";
    cacheState: "empty" | "ready" | "degraded";
    lastRefreshedAt: string | null;
    staleMinutes: number | null;
    warnings: string[];
    focusMint: string | null;
    focusTokenCachedAt: string | null;
    sources: Array<{
      key: string;
      label: string;
      tier: "paid" | "free" | "local";
      detail: string;
    }>;
  };
  tokenUniverseSize: number;
  marketPulse: {
    advancingSharePercent: number;
    cautionSharePercent: number;
    medianPriceChange5mPercent: number | null;
    medianLiquidityUsd: number | null;
    medianVolume24hUsd: number | null;
    medianRugScoreNormalized: number | null;
    trackedOpenPositions: number;
  };
  sourceMix: {
    birdeyeRecentCount: number;
    birdeyeMomentumCount: number;
    rugcheckRecentCount: number;
    rugcheckVerifiedCount: number;
  };
  tokens: DiscoveryLabMarketTokenRow[];
  focusToken: {
    insight: DiscoveryLabTokenInsight;
    rugcheck: {
      mint: string;
      score: number | null;
      scoreNormalized: number | null;
      lpLockedPercent: number | null;
      topRiskLevel: "danger" | "warning" | "info" | "unknown";
      topRiskName: string | null;
      riskCount: number;
      risks: Array<{
        name: string;
        level: string | null;
        score: number | null;
        description: string | null;
      }>;
    } | null;
    trackedPositionId: string | null;
    trackedPositionStatus: "OPEN" | "CLOSED" | null;
  } | null;
};

export type DiscoveryLabStrategySuggestionsPayload = {
  generatedAt: string;
  meta: {
    refreshMode: "manual";
    cacheState: "empty" | "ready" | "degraded";
    lastRefreshedAt: string | null;
    staleMinutes: number | null;
    warnings: string[];
    focusMint: string | null;
    focusTokenCachedAt: string | null;
    marketStatsRefreshedAt: string | null;
    sources: Array<{
      key: string;
      label: string;
      tier: "paid" | "free" | "local";
      detail: string;
    }>;
  };
  regime: "RISK_ON" | "CHOP" | "RISK_OFF";
  confidencePercent: number;
  marketSummary: {
    tokenUniverseSize: number;
    advancingSharePercent: number;
    cautionSharePercent: number;
    medianPriceChange5mPercent: number | null;
    medianLiquidityUsd: number | null;
    medianVolume24hUsd: number | null;
    medianRugScoreNormalized: number | null;
  };
  suggestions: Array<{
    id: string;
    title: string;
    summary: string;
    confidencePercent: number;
    recommendedSessionMinutes: number;
    posture: "aggressive" | "balanced" | "defensive";
    thresholdOverrides: DiscoveryLabThresholdOverrides;
    thresholdRanges: Array<{
      key: keyof DiscoveryLabThresholdOverrides;
      label: string;
      unit: "usd" | "percent" | "count" | "ratio";
      min: number;
      recommended: number;
      max: number;
    }>;
    discoveryFilters: Array<{ key: string; label: string; value: string }>;
    packDraft: DiscoveryLabPackDraft;
  }>;
};
