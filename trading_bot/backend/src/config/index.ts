import "dotenv/config";
import { z } from "zod";
import { getBirdeyePlanProfile } from "./provider-plan.js";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  HELIUS_API_KEY: z.string(),
  HELIUS_RPC_URL: z.string(),
  HELIUS_WS_URL: z.string(),
  HELIUS_SENDER_URLS: z.string().default(""),
  HELIUS_SENDER_TIP_LAMPORTS: z.coerce.number().int().nonnegative().default(200_000),
  HELIUS_WEBHOOK_SECRET: z.string().default(""),
  BIRDEYE_API_KEY: z.string(),
  BIRDEYE_PLAN: z.enum(["LITE", "STARTER"]).default("LITE"),
  JUPITER_API_KEY: z.string().default(""),
  JUPITER_BASE_URL: z.string().default("https://api.jup.ag"),
  JUPITER_PRICE_PATH: z.string().default("/price/v3"),
  JUPITER_SWAP_PATH: z.string().default("/swap/v1"),
  S2_ENABLE_NEW_LISTING_FALLBACK: z.enum(["true", "false"]).default("false"),
  SOLANA_PRIVATE_KEY: z.string(),
  SOLANA_PUBLIC_KEY: z.string(),
  JITO_TIP_ACCOUNTS: z.string().default(""),
  JITO_TIP_ACCOUNT: z.string().default("96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5"),
  BOT_PORT: z.coerce.number().default(3001),
  DASHBOARD_PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  TRADE_MODE: z.enum(["LIVE", "DRY_RUN"]).default("DRY_RUN"),
  CONTROL_API_SECRET: z.string().min(16),
});

const _parsed = envSchema.safeParse(process.env);
if (!_parsed.success) {
  console.error("Config validation failed:\n" + _parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}
const env = _parsed.data;
const birdeyePlan = getBirdeyePlanProfile(env.BIRDEYE_PLAN);
const senderUrls = parseListEnv(env.HELIUS_SENDER_URLS);
const configuredTipAccounts = parseListEnv(env.JITO_TIP_ACCOUNTS);
const tipAccounts = configuredTipAccounts.length > 0
  ? configuredTipAccounts
  : env.JITO_TIP_ACCOUNT
    ? [env.JITO_TIP_ACCOUNT]
    : [];

export const config = {
  env: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  tradeMode: env.TRADE_MODE as "LIVE" | "DRY_RUN",
  port: env.BOT_PORT,
  dashboardPort: env.DASHBOARD_PORT,

  db: {
    url: env.DATABASE_URL,
    idleTimeoutMs: 300_000,
  },

  redis: {
    url: env.REDIS_URL,
  },

  helius: {
    apiKey: env.HELIUS_API_KEY,
    rpcUrl: env.HELIUS_RPC_URL,
    wsUrl: env.HELIUS_WS_URL,
    senderUrls,
    senderTipLamports: env.HELIUS_SENDER_TIP_LAMPORTS,
    webhookSecret: env.HELIUS_WEBHOOK_SECRET,
    rateLimitRps: 30,
    rateLimitWindowMs: 60_000,
    txHistoryDefaultLimit: 100,
    assetsByOwnerPage: 1,
    assetsByOwnerLimit: 100,
    websocket: {
      heartbeatIntervalMs: 30_000,
      pongTimeoutMs: 35_000,
      reconnectMaxAttempts: 10,
      reconnectWarnThreshold: 3,
      reconnectBackoffBaseMs: 3_000,
      reconnectBackoffMaxMs: 60_000,
      longRecoveryDelayMs: 300_000,
      subscriptionTimeoutMs: 5_000,
      waitForOpenTimeoutMs: 5_000,
      lastSlotCacheSize: 1_000,
    },
  },

  birdeye: {
    apiKey: env.BIRDEYE_API_KEY,
    plan: birdeyePlan.name,
    baseUrl: "https://public-api.birdeye.so",
    rateLimit: birdeyePlan.rateLimitRps,
    websocketAccess: birdeyePlan.websocketAccess,
    s2CatchupIntervalMs: birdeyePlan.s2CatchupIntervalMs,
    maxRetries: 3,
  },

  jupiter: {
    apiKey: env.JUPITER_API_KEY,
    baseUrl: env.JUPITER_BASE_URL,
    pricePath: env.JUPITER_PRICE_PATH,
    swapPath: env.JUPITER_SWAP_PATH,
    tokensPath: "/tokens/v2",
  },

  marketRouter: {
    priceSlowPathRefreshMs: birdeyePlan.priceSlowPathRefreshMs,
  },

  solana: {
    privateKey: env.SOLANA_PRIVATE_KEY,
    publicKey: env.SOLANA_PUBLIC_KEY,
  },

  jito: {
    tipAccount: tipAccounts[0] ?? "",
    tipAccounts,
    blockEngineUrl: "https://mainnet.block-engine.jito.wtf",
  },

  capital: {
    startingUsd: 200,
    startingSol: 2.2,
    gasReserve: 0.1,
    gasFee: 0.000005,
    maxOpenPositions: 5,
    rollingWindowSize: 20,
    dailyLossPercent: 0.05,
    weeklyLossPercent: 0.10,
  },

  strategies: {
    s1: {
      name: "S1_COPY" as const,
      enabled: false,
      maxPositions: 2,
      positionSizeSol: 0.2,
      stopLossPercent: 20,
      tp1Percent: 30,
      tp2Percent: 60,
      trailingStopPercent: 20,
      timeStopMinutes: 120,
      minLiquidity: 50_000,
      maxMarketCap: 5_000_000,
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 15,
      minBuyPressure: 55,
      minUniqueBuyers5m: 25,
      minBuySellRatio: 1.2,
      maxSlippageBps: 500,
      walletCount: 5,
      scoringPoolSize: 500,
      washTradingThreshold: 0.1,
      maxSourceTxAgeSeconds: 30,
      requireTradeDataInLive: true,
      recentSignatureCacheSize: 2_000,
      walletActivityFetchLimit: 5,
      eliteWalletLoadMultiplier: 10,
      candidatePoolMultiplier: 10,
      topTraderSeedCount: 6,
      topTraderConcurrency: 3,
    },
    s2: {
      name: "S2_GRADUATION" as const,
      enabled: true,
      maxPositions: 2,
      positionSizeSol: 0.2,
      stopLossPercent: 25,
      tp1Multiplier: 1.6,
      tp2Multiplier: 2.4,
      trailingStopPercent: 25,
      timeStopMinutes: 15,
      timeLimitMinutes: 120,
      entryDelayMinutes: 1,
      minLiquidity: 10_000,
      maxMarketCap: 150_000,
      minUniqueHolders: 200,
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 15,
      minUniqueBuyers5m: 50,
      minBuySellRatio: 2,
      maxGraduationAgeAtEntrySeconds: 180,
      requireTradeDataInLive: true,
      maxBotTxs60s: 100,
      maxSerialDeploys7d: 5,
      maxSlippageBps: 1000,
      scanIntervalMs: 20_000,
      nearGradPercent: 70,
      graduationPendingExpiryMs: 600_000,
      memeListLimit: 10,
      justGraduatedLookbackSeconds: 300,
      fallbackScanIntervalMs: 300_000,
      fallbackListingsBatchSize: 20,
      fallbackScanConcurrency: 3,
      enableNewListingFallback: env.S2_ENABLE_NEW_LISTING_FALLBACK === "true",
      tokenSignatureLimit: 200,
      creatorSignatureLimit: 100,
      serialDeployLookbackSeconds: 604_800,
    },
    s3: {
      name: "S3_MOMENTUM" as const,
      enabled: true,
      maxPositions: 3,
      positionSizeSol: 0.1,
      tranche1Percent: 60,
      tranche2Percent: 40,
      tranche2DelayMs: 120_000,
      stopLossPercent: 10,
      tp1Percent: 20,
      tp2Percent: 40,
      trailingStopPercent: 15,
      timeStopMinutes: 5,
      timeLimitMinutes: 30,
      minVolume5m: 30_000,
      minLiquidity: 30_000,
      maxMarketCap: 500_000,
      minHolders: 150,
      volumeSpikeMultiplier: 3,
      minBuyPressure: 55,
      washTradingThreshold: 0.1,
      alreadyPumpedPercent: 50,
      maxSlippageBps: 500,
      scanIntervalMs: 20_000,
      maxCandidatesPerScan: 5,
      tranche2MinHolderRatio: 0.5,
      tranche2MinVolumeRetention: 0.8,
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 25,
    },
  },

  scaling: [
    { capital: 200, s1s2Size: 0.2, s3Size: 0.1, gasReserve: 0.1 },
    { capital: 400, s1s2Size: 0.35, s3Size: 0.15, gasReserve: 0.15 },
    { capital: 700, s1s2Size: 0.5, s3Size: 0.25, gasReserve: 0.2 },
    { capital: 1000, s1s2Size: 0.7, s3Size: 0.35, gasReserve: 0.25 },
    { capital: 2000, s1s2Size: 1.0, s3Size: 0.5, gasReserve: 0.4 },
  ],

  apiBudgets: {
    softLimitPct: 70,
    hardLimitPct: 100,
    reservePct: 0.2,
    syncIntervalMs: 3_600_000,
    persistIntervalMs: 60_000,
    helius: {
      monthly: 10_000_000,
      credits: {
        default: 1,
        getSignaturesForAddress: 10,
        getTransaction: 10,
        getTransactionsForAddress: 100,
        getAssetsByOwner: 10,
        getAssetBatch: 10,
        parseTransaction: 100,
        walletFundingSource: 100,
      },
    },
    birdeye: { monthly: birdeyePlan.monthlyCu, rps: birdeyePlan.rateLimitRps },
  },

  regime: {
    riskOffChange5mPct: -3,
    riskOffChange1hPct: -7,
    choppyMaxTrending: 3,
    choppyMaxWinRate: 0.25,
    hotMinTrending: 5,
    hotMinChange5mPct: 0,
    historyWindowMs: 3_600_000,
    evalIntervalMs: 60_000,
    fiveMinWindowMs: 300_000,
    fiveMinToleranceMs: 10_000,
    trendingSampleSize: 10,
  },

  exitMonitor: {
    batchIntervalMs: 5_000,
    tradeDataSlowPathRefreshMs: birdeyePlan.tradeDataSlowPathRefreshMs,
    timeStopPnlS3Pct: 5,
    timeStopPnlDefaultPct: 10,
    fadeVolumeRatioS3: 1.2,
    fadeVolumeRatioDefault: 0.5,
    exitFractions: {
      s1: { tp1: 0.5, tp2: 0.5 },
      s2: { tp1: 0.5, tp2: 0.25 },
      s3: { tp1: 0.5, tp2: 0.5 },
    },
  },

  outcomeTracker: {
    backfillIntervalMs: 60_000,
    batchSize: 100,
    maxSignalAgeHours: 2,
    maxPositionAgeHours: 25,
    rugThreshold: 0.1,
    wouldHaveWonPct: {
      S1_COPY: 30,
      S2_GRADUATION: 100,
      S3_MOMENTUM: 20,
    } as Record<string, number>,
  },

  walletScorer: {
    txFetchLimit: 100,
    minTxCount: 10,
    consistencyMultiplier: 0.8,
    weights: { winRate: 0.30, maxLoss: 0.25, consistency: 0.20, frequency: 0.10, diversity: 0.10, age: 0.05 },
    freqMin: 5,
    freqMax: 30,
    diversityMin: 10,
    ageMinDays: 30,
    archetypeSniper: { minWinRate: 0.6, minFreq: 20 },
    archetypeSwingMaxFreq: 10,
    workerPoolSize: 4,
  },

  main: {
    walletScoringIntervalMs: 86_400_000,
    statsAggregationIntervalMs: 3_600_000,
    outcomeBackfillIntervalMs: 600_000,
    dailyResetCheckIntervalMs: 60_000,
    riskSaveIntervalMs: 30_000,
    weeklyPeriodMs: 604_800_000,
    walletReconcileIntervalMs: 60_000,
  },

  marketTick: {
    intervalMs: 300_000,
  },

  circuitBreaker: {
    heliusRpc:      { failureThreshold: 3, windowMs: 10_000,  cooldownMs: 30_000,  halfOpenMax: 1 },
    heliusWebhook:  { failureThreshold: 5, windowMs: 60_000,  cooldownMs: 120_000, halfOpenMax: 1 },
    birdeye:        { failureThreshold: 5, windowMs: 30_000,  cooldownMs: 60_000,  halfOpenMax: 2 },
    jupiterQuote:   { failureThreshold: 3, windowMs: 10_000,  cooldownMs: 20_000,  halfOpenMax: 1 },
    jupiterExecute: { failureThreshold: 2, windowMs: 10_000,  cooldownMs: 60_000,  halfOpenMax: 1 },
  } as const,

  api: {
    stateCacheTtlMs: 10_000,
    heartbeatCacheTtlMs: 5_000,
    controlConfigCacheTtlMs: 30_000,
    laneActivityTtlMs: 10_000,
    laneSummaryTtlMs: 10_000,
    responseCacheMaxEntries: 200,
    controlRateLimitWindowMs: 60_000,
    controlRateLimitMax: 20,
    streamIntervalMs: 5_000,
    apiCallBufferFlushIntervalMs: 5_000,
    birdeyeCacheTtlMs: 30_000,
    birdeyeTimeoutMs: 10_000,
    birdeyeWalletRpmLimit: 30,
    birdeyeWalletWindowMs: 60_000,
    heliusTimeoutMs: 10_000,
    jupiterTimeoutMs: 10_000,
    jupiterSolPriceCacheTtlMs: 10_000,
    heliusConfirmTimeoutMs: 30_000,
    heliusConfirmPollMs: 2_000,
    heliusPriorityFeeFallback: 10_000,
    heliusMaxRetries: 3,
    heliusFastMaxRetries: 0,
    controlSecret: env.CONTROL_API_SECRET,
  },
} as const;

export type Config = typeof config;

function parseListEnv(value: string): string[] {
  return value
    .split(/[\n,\r]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
