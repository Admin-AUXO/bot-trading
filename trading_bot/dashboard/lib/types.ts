export type ViewRow = Record<string, string | number | null>;

export type StatusPayload = {
  botState: {
    tradeMode: string;
    capitalUsd: number;
    cashUsd: number;
    realizedPnlUsd: number;
    pauseReason: string | null;
    lastDiscoveryAt: string | null;
    lastEvaluationAt: string | null;
    lastExitCheckAt: string | null;
  };
  entryGate: {
    allowed: boolean;
    reason: string | null;
    retryable: boolean;
    dailyRealizedPnlUsd: number;
    consecutiveLosses: number;
  };
  settings: BotSettings;
  openPositions: number;
  queuedCandidates: number;
  latestCandidates: Array<Record<string, unknown>>;
  latestFills: Array<Record<string, unknown>>;
  providerSummary?: Array<Record<string, unknown>>;
  providerBudget?: Record<string, unknown>;
  research?: {
    activeRun: ResearchRunSummary | null;
    latestCompletedRun: ResearchRunSummary | null;
    previousCompletedRun: ResearchRunSummary | null;
  };
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
