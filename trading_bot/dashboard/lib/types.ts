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
};
