import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { env } from "../src/config/env.js";
import type {
  DiscoveryToken,
  HolderConcentration,
  MintAuthoritySnapshot,
  TradeDataSnapshot,
} from "../src/types/domain.js";

type Scalar = string | number | boolean;
type RecipeMode = "graduated" | "pregrad";
type QueryValue = Scalar | null | undefined;

type LabRecipe = {
  name: string;
  mode: RecipeMode;
  description?: string;
  deepEvalLimit?: number;
  params: Record<string, QueryValue>;
};

type ResolvedPlan = {
  key: string;
  source: string;
  recipe: LabRecipe;
  params: Record<string, Scalar>;
  filterCount: number;
};

type LabThresholds = {
  profileName: "runtime" | "high-value";
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
};

type DeepEvaluation = {
  mint: string;
  mode: RecipeMode;
  pass: boolean;
  grade: string;
  preScore: number;
  entryScore: number;
  playScore: number;
  rejectReason: string | null;
  softIssues: string[];
  notes: string[];
  tradeData: TradeDataSnapshot | null;
  mintAuthorities: MintAuthoritySnapshot | null;
  holderConcentration: HolderConcentration | null;
};

type CacheEntry = {
  fetchedAt: number;
  value: MintResearch;
};

type RankedToken = {
  token: DiscoveryToken;
  preScore: number;
};

type MintResearch = {
  tradeData: TradeDataSnapshot | null;
  mintAuthorities: MintAuthoritySnapshot | null;
  holderConcentration: HolderConcentration | null;
  errorMessage: string | null;
};

type QueryOutcome = {
  plan: ResolvedPlan;
  returnedCount: number;
  selectedCount: number;
  queryCu: number;
  durationMs: number;
  status: "ok" | "skipped" | "error";
  skipReason?: string;
  errorMessage?: string;
  selectedTokens: RankedToken[];
  topReturned: Array<{
    symbol: string;
    mint: string;
    preScore: number;
    liquidityUsd: number;
    volume5mUsd: number;
    volume1hUsd: number;
    progressPercent: number;
  }>;
};

type QuerySummary = {
  key: string;
  source: string;
  recipeName: string;
  recipeMode: RecipeMode;
  filterCount: number;
  returnedCount: number;
  selectedCount: number;
  goodCount: number;
  avgGoodPlayScore: number;
  avgGoodEntryScore: number;
  avgSelectedPlayScore: number;
  avgSelectedEntryScore: number;
  estimatedCu: number;
  topSelectedTokens: Array<{
    symbol: string;
    mint: string;
    grade: string;
    playScore: number;
    rejectReason: string | null;
  }>;
  topGoodTokens: Array<{
    symbol: string;
    mint: string;
    grade: string;
    playScore: number;
    rejectReason: string | null;
  }>;
};

type SourceSummary = {
  source: string;
  recipesRun: number;
  totalReturned: number;
  totalGoodTokens: number;
  uniqueGoodTokens: number;
  bestByGoodCount: string | null;
  bestByAverageScore: string | null;
  bestByEfficiency: string | null;
  bestByQuality: string | null;
};

const DEFAULT_SOURCES = [
  "pump_dot_fun",
  "moonshot",
  "raydium_launchlab",
  "meteora_dynamic_bonding_curve",
];

const FILTER_KEYS = new Set([
  "source",
  "creator",
  "platform_id",
  "graduated",
  "min_progress_percent",
  "max_progress_percent",
  "min_graduated_time",
  "max_graduated_time",
  "min_creation_time",
  "max_creation_time",
  "min_recent_listing_time",
  "max_recent_listing_time",
  "min_last_trade_unix_time",
  "max_last_trade_unix_time",
  "min_liquidity",
  "max_liquidity",
  "min_market_cap",
  "max_market_cap",
  "min_fdv",
  "max_fdv",
  "min_holder",
  "min_volume_1m_usd",
  "min_volume_5m_usd",
  "min_volume_30m_usd",
  "min_volume_1h_usd",
  "min_volume_2h_usd",
  "min_volume_4h_usd",
  "min_volume_8h_usd",
  "min_volume_24h_usd",
  "min_volume_7d_usd",
  "min_volume_30d_usd",
  "min_volume_1m_change_percent",
  "min_volume_5m_change_percent",
  "min_volume_30m_change_percent",
  "min_volume_1h_change_percent",
  "min_volume_2h_change_percent",
  "min_volume_4h_change_percent",
  "min_volume_8h_change_percent",
  "min_volume_24h_change_percent",
  "min_volume_7d_change_percent",
  "min_volume_30d_change_percent",
  "min_price_change_1m_percent",
  "min_price_change_5m_percent",
  "min_price_change_30m_percent",
  "min_price_change_1h_percent",
  "min_price_change_2h_percent",
  "min_price_change_4h_percent",
  "min_price_change_8h_percent",
  "min_price_change_24h_percent",
  "min_price_change_7d_percent",
  "min_price_change_30d_percent",
  "min_trade_1m_count",
  "min_trade_5m_count",
  "min_trade_30m_count",
  "min_trade_1h_count",
  "min_trade_2h_count",
  "min_trade_4h_count",
  "min_trade_8h_count",
  "min_trade_24h_count",
  "min_trade_7d_count",
  "min_trade_30d_count",
]);

const queryValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const recipeSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["graduated", "pregrad"]),
  description: z.string().optional(),
  deepEvalLimit: z.number().int().positive().max(25).optional(),
  params: z.record(z.string(), queryValueSchema),
});

const recipeFileSchema = z.object({
  description: z.string().optional(),
  recipes: z.array(recipeSchema).min(1),
});

function printHelp() {
  console.log(`
Discovery lab for Birdeye meme/list + Helius structural grading.

Usage:
  npm run lab:discovery -- [options]

Options:
  --sources <csv>             Sources to test. Default: ${DEFAULT_SOURCES.join(",")}
  --recipes <path>            Recipe JSON file. Default: scripts/discovery-lab.recipes.json
  --recipe-names <csv>        Run only specific recipe names
  --profile <runtime|high-value>
                              Scoring profile. Default: high-value
  --deep-eval-limit <n>       Override per-recipe deep evaluation cap. Default: recipe or 6
  --query-concurrency <n>     Concurrent meme/list requests. Default: 2
  --deep-concurrency <n>      Concurrent deep eval requests. Default: 4
  --cache-ttl-seconds <n>     Deep-eval cache TTL. Default: 300
  --cache-file <path>         Deep-eval cache path. Default: OS temp dir
  --min-liquidity-usd <n>     Override grading floor for liquidity
  --max-market-cap-usd <n>    Override grading ceiling for market cap
  --min-holders <n>           Override grading floor for holders
  --min-volume-5m-usd <n>     Override grading floor for 5m volume
  --min-unique-buyers-5m <n>  Override grading floor for unique 5m buyers
  --min-buy-sell-ratio <n>    Override grading floor for buy/sell ratio
  --max-top10-holder-percent <n>
                              Override grading ceiling for top10 concentration
  --max-single-holder-percent <n>
                              Override grading ceiling for the largest holder
  --max-negative-price-change-5m-percent <n>
                              Override max allowed 5m drawdown before rejection
  --out <path>                Write JSON report to a file
  --allow-overfiltered        Do not skip recipes with more than 5 API filters
  --help                      Show help

Examples:
  npm run lab:discovery -- --profile high-value
  npm run lab:discovery -- --sources pump_dot_fun,moonshot --recipe-names grad_60m_last_trade,pregrad_95_progress
  npm run lab:discovery -- --out /tmp/discovery-lab.json
`);
}

function parseArgs(argv: string[]) {
  const parsed: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[rawKey] = true;
      continue;
    }

    parsed[rawKey] = next;
    index += 1;
  }

  return parsed;
}

function csv(value: string | boolean | undefined, fallback: string[] = []) {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function asInt(value: string | boolean | undefined, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNumberArg(value: string | boolean | undefined, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: string | boolean | undefined, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getByPath(source: Record<string, unknown>, pathKey: string): unknown {
  let current: unknown = source;
  for (const segment of pathKey.split(".")) {
    const record = asRecord(current);
    if (!record || !(segment in record)) return undefined;
    current = record[segment];
  }
  return current;
}

function pickNumber(source: Record<string, unknown>, ...paths: string[]) {
  for (const pathKey of paths) {
    const picked = asNumber(getByPath(source, pathKey));
    if (picked !== null) return picked;
  }
  return null;
}

function pickString(source: Record<string, unknown>, ...paths: string[]) {
  for (const pathKey of paths) {
    const picked = asText(getByPath(source, pathKey));
    if (picked) return picked;
  }
  return null;
}

function pickBoolean(source: Record<string, unknown>, ...paths: string[]) {
  for (const pathKey of paths) {
    const value = getByPath(source, pathKey);
    if (typeof value === "boolean") return value;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logScore(value: number, floor: number) {
  const normalized = Math.log1p(Math.max(value, 0)) / Math.log1p(Math.max(floor * 6, 1));
  return clamp(normalized, 0, 1);
}

function gradeFromScore(score: number, pass: boolean) {
  if (!pass) return "REJECT";
  if (score >= 0.92) return "A";
  if (score >= 0.84) return "A-";
  if (score >= 0.76) return "B+";
  if (score >= 0.68) return "B";
  if (score >= 0.6) return "B-";
  return "C";
}

function buildThresholds(profileName: "runtime" | "high-value"): LabThresholds {
  if (profileName === "runtime") {
    return {
      profileName,
      minLiquidityUsd: env.MIN_LIQUIDITY_USD,
      maxMarketCapUsd: env.MAX_MARKET_CAP_USD,
      minHolders: env.MIN_HOLDERS,
      minUniqueBuyers5m: env.MIN_UNIQUE_BUYERS_5M,
      minBuySellRatio: env.MIN_BUY_SELL_RATIO,
      maxTop10HolderPercent: env.MAX_TOP10_HOLDER_PERCENT,
      maxSingleHolderPercent: env.MAX_SINGLE_HOLDER_PERCENT,
      maxGraduationAgeSeconds: env.MAX_GRADUATION_AGE_SECONDS,
      minVolume5mUsd: env.MIN_VOLUME_5M_USD,
      maxNegativePriceChange5mPercent: env.MAX_NEGATIVE_PRICE_CHANGE_5M_PERCENT,
    };
  }

  return {
    profileName,
    minLiquidityUsd: Math.max(env.MIN_LIQUIDITY_USD, 20_000),
    maxMarketCapUsd: Math.max(env.MAX_MARKET_CAP_USD, 2_500_000),
    minHolders: Math.max(env.MIN_HOLDERS, 150),
    minUniqueBuyers5m: Math.max(env.MIN_UNIQUE_BUYERS_5M, 30),
    minBuySellRatio: Math.max(env.MIN_BUY_SELL_RATIO, 1.2),
    maxTop10HolderPercent: Math.min(env.MAX_TOP10_HOLDER_PERCENT, 25),
    maxSingleHolderPercent: Math.min(env.MAX_SINGLE_HOLDER_PERCENT, 10),
    maxGraduationAgeSeconds: Math.min(Math.max(env.MAX_GRADUATION_AGE_SECONDS, 14_400), 14_400),
    minVolume5mUsd: Math.max(env.MIN_VOLUME_5M_USD, 5_000),
    maxNegativePriceChange5mPercent: Math.max(env.MAX_NEGATIVE_PRICE_CHANGE_5M_PERCENT, 15),
  };
}

function applyThresholdOverrides(
  thresholds: LabThresholds,
  args: Record<string, string | boolean>,
): LabThresholds {
  return {
    ...thresholds,
    minLiquidityUsd: asNumberArg(args["min-liquidity-usd"], thresholds.minLiquidityUsd),
    maxMarketCapUsd: asNumberArg(args["max-market-cap-usd"], thresholds.maxMarketCapUsd),
    minHolders: asInt(args["min-holders"], thresholds.minHolders),
    minVolume5mUsd: asNumberArg(args["min-volume-5m-usd"], thresholds.minVolume5mUsd),
    minUniqueBuyers5m: asInt(args["min-unique-buyers-5m"], thresholds.minUniqueBuyers5m),
    minBuySellRatio: asNumberArg(args["min-buy-sell-ratio"], thresholds.minBuySellRatio),
    maxTop10HolderPercent: asNumberArg(args["max-top10-holder-percent"], thresholds.maxTop10HolderPercent),
    maxSingleHolderPercent: asNumberArg(args["max-single-holder-percent"], thresholds.maxSingleHolderPercent),
    maxNegativePriceChange5mPercent: asNumberArg(
      args["max-negative-price-change-5m-percent"],
      thresholds.maxNegativePriceChange5mPercent,
    ),
  };
}

function resolveRelativeNumber(value: QueryValue, nowUnix: number): Scalar | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value === "now") return nowUnix;
  if (/^now-\d+$/.test(value)) {
    return nowUnix - Number.parseInt(value.slice(4), 10);
  }
  if (/^now\+\d+$/.test(value)) {
    return nowUnix + Number.parseInt(value.slice(4), 10);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function countActiveFilters(params: Record<string, Scalar>) {
  return Object.entries(params)
    .filter(([key]) => FILTER_KEYS.has(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .length;
}

function recipeWindowSeconds(recipe: LabRecipe, nowUnix: number) {
  const minGraduated = resolveRelativeNumber(recipe.params.min_graduated_time, nowUnix);
  const minCreation = resolveRelativeNumber(recipe.params.min_creation_time, nowUnix);
  const minRecentListing = resolveRelativeNumber(recipe.params.min_recent_listing_time, nowUnix);
  const mins = [minGraduated, minCreation, minRecentListing]
    .filter((value): value is number => typeof value === "number");

  if (mins.length === 0) {
    return recipe.mode === "graduated" ? 3_600 : 7_200;
  }

  return Math.max(60, nowUnix - Math.max(...mins));
}

function parseDiscoveryToken(row: Record<string, unknown>): DiscoveryToken {
  return {
    mint: pickString(row, "address") ?? "",
    symbol: pickString(row, "symbol") ?? "",
    name: pickString(row, "name") ?? "",
    source: pickString(row, "meme_info.source", "source") ?? "",
    creator: pickString(row, "meme_info.creator", "creator"),
    platformId: pickString(row, "meme_info.platform_id"),
    graduated: pickBoolean(row, "meme_info.graduated", "graduated") === true,
    graduatedAt: pickNumber(row, "meme_info.graduated_time", "graduated_time"),
    creationAt: pickNumber(row, "meme_info.creation_time"),
    recentListingAt: pickNumber(row, "recent_listing_time"),
    lastTradeAt: pickNumber(row, "last_trade_unix_time"),
    decimals: pickNumber(row, "decimals"),
    progressPercent: pickNumber(row, "meme_info.progress_percent", "progress_percent") ?? 0,
    priceUsd: pickNumber(row, "price", "price_usd"),
    liquidityUsd: pickNumber(row, "liquidity", "liquidity_usd"),
    marketCapUsd: pickNumber(row, "market_cap", "marketCap"),
    fdvUsd: pickNumber(row, "fdv"),
    totalSupply: pickNumber(row, "total_supply"),
    circulatingSupply: pickNumber(row, "circulating_supply"),
    holders: pickNumber(row, "holder", "holders"),
    volume1mUsd: pickNumber(row, "volume_1m_usd"),
    volume5mUsd: pickNumber(row, "volume_5m_usd"),
    volume30mUsd: pickNumber(row, "volume_30m_usd"),
    volume1hUsd: pickNumber(row, "volume_1h_usd"),
    volume24hUsd: pickNumber(row, "volume_24h_usd"),
    volume1mChangePercent: pickNumber(row, "volume_1m_change_percent"),
    volume5mChangePercent: pickNumber(row, "volume_5m_change_percent"),
    volume30mChangePercent: pickNumber(row, "volume_30m_change_percent"),
    volume1hChangePercent: pickNumber(row, "volume_1h_change_percent"),
    volume24hChangePercent: pickNumber(row, "volume_24h_change_percent"),
    trades1m: pickNumber(row, "trade_1m_count"),
    trades5m: pickNumber(row, "trade_5m_count"),
    trades30m: pickNumber(row, "trade_30m_count"),
    trades1h: pickNumber(row, "trade_1h_count"),
    trades24h: pickNumber(row, "trade_24h_count"),
    priceChange1mPercent: pickNumber(row, "price_change_1m_percent"),
    priceChange5mPercent: pickNumber(row, "price_change_5m_percent"),
    priceChange30mPercent: pickNumber(row, "price_change_30m_percent"),
    priceChange1hPercent: pickNumber(row, "price_change_1h_percent"),
    priceChange24hPercent: pickNumber(row, "price_change_24h_percent"),
  };
}

function parseTradeData(row: Record<string, unknown>): TradeDataSnapshot {
  return {
    lastTradeAt: pickNumber(row, "last_trade_unix_time"),
    priceUsd: pickNumber(row, "price", "priceUsd"),
    volume1mUsd: pickNumber(row, "volume_1m_usd"),
    volume5mUsd: pickNumber(row, "volume_5m_usd", "v5mUSD"),
    volume30mUsd: pickNumber(row, "volume_30m_usd"),
    volume1hUsd: pickNumber(row, "volume_1h_usd"),
    volume24hUsd: pickNumber(row, "volume_24h_usd"),
    volume1mChangePercent: pickNumber(row, "volume_1m_change_percent"),
    volume5mChangePercent: pickNumber(row, "volume_5m_change_percent"),
    volume30mChangePercent: pickNumber(row, "volume_30m_change_percent"),
    volume1hChangePercent: pickNumber(row, "volume_1h_change_percent"),
    volume24hChangePercent: pickNumber(row, "volume_24h_change_percent"),
    volumeBuy1mUsd: pickNumber(row, "volume_buy_1m_usd"),
    volumeBuy5mUsd: pickNumber(row, "volume_buy_5m_usd", "vBuy5mUSD"),
    volumeBuy30mUsd: pickNumber(row, "volume_buy_30m_usd"),
    volumeBuy1hUsd: pickNumber(row, "volume_buy_1h_usd"),
    volumeBuy24hUsd: pickNumber(row, "volume_buy_24h_usd"),
    volumeSell1mUsd: pickNumber(row, "volume_sell_1m_usd"),
    volumeSell5mUsd: pickNumber(row, "volume_sell_5m_usd", "vSell5mUSD"),
    volumeSell30mUsd: pickNumber(row, "volume_sell_30m_usd"),
    volumeSell1hUsd: pickNumber(row, "volume_sell_1h_usd"),
    volumeSell24hUsd: pickNumber(row, "volume_sell_24h_usd"),
    uniqueWallets1m: pickNumber(row, "unique_wallet_1m"),
    uniqueWallets5m: pickNumber(row, "unique_wallet_5m", "uniqueWallet5m"),
    uniqueWallets30m: pickNumber(row, "unique_wallet_30m"),
    uniqueWallets1h: pickNumber(row, "unique_wallet_1h"),
    uniqueWallets24h: pickNumber(row, "unique_wallet_24h"),
    trades1m: pickNumber(row, "trade_1m"),
    trades5m: pickNumber(row, "trade_5m", "trade5m"),
    trades30m: pickNumber(row, "trade_30m"),
    trades1h: pickNumber(row, "trade_1h"),
    trades24h: pickNumber(row, "trade_24h"),
    buys1m: pickNumber(row, "buy_1m"),
    buys5m: pickNumber(row, "buy_5m", "buy5m"),
    buys30m: pickNumber(row, "buy_30m"),
    buys1h: pickNumber(row, "buy_1h"),
    buys24h: pickNumber(row, "buy_24h"),
    sells1m: pickNumber(row, "sell_1m"),
    sells5m: pickNumber(row, "sell_5m"),
    sells30m: pickNumber(row, "sell_30m"),
    sells1h: pickNumber(row, "sell_1h"),
    sells24h: pickNumber(row, "sell_24h"),
    priceChange1mPercent: pickNumber(row, "price_change_1m_percent"),
    priceChange5mPercent: pickNumber(row, "price_change_5m_percent"),
    priceChange30mPercent: pickNumber(row, "price_change_30m_percent"),
    priceChange1hPercent: pickNumber(row, "price_change_1h_percent"),
    priceChange24hPercent: pickNumber(row, "price_change_24h_percent"),
  };
}

function preScoreToken(token: DiscoveryToken, recipe: LabRecipe, nowUnix: number) {
  const minProgress = Number(resolveRelativeNumber(recipe.params.min_progress_percent, nowUnix) ?? 80);
  const referenceTime = recipe.mode === "graduated"
    ? token.graduatedAt ?? token.lastTradeAt
    : token.recentListingAt ?? token.creationAt ?? token.lastTradeAt;
  const windowSeconds = recipeWindowSeconds(recipe, nowUnix);
  const ageSeconds = referenceTime ? Math.max(0, nowUnix - referenceTime) : windowSeconds;
  const freshnessScore = recipe.mode === "graduated"
    ? clamp(1 - (ageSeconds / Math.max(windowSeconds, 1)), 0, 1)
    : clamp((token.progressPercent - minProgress) / Math.max(100 - minProgress, 1), 0, 1);
  const recencyScore = token.lastTradeAt
    ? clamp(1 - ((nowUnix - token.lastTradeAt) / 1_800), 0, 1)
    : 0;
  const liquidityFloor = Number(resolveRelativeNumber(recipe.params.min_liquidity, nowUnix) ?? 5_000);
  const liquidityScore = logScore(token.liquidityUsd ?? 0, Math.max(liquidityFloor, 1));
  const volumeFloor = Number(resolveRelativeNumber(recipe.params.min_volume_5m_usd, nowUnix) ?? 500);
  const volumeScore = logScore(token.volume5mUsd ?? token.volume1hUsd ?? 0, Math.max(volumeFloor, 1));
  const holderScore = clamp((token.holders ?? 0) / 300, 0, 1);
  const tradeScore = clamp((token.trades5m ?? token.trades1h ?? 0) / 500, 0, 1);
  const sourceBoost = token.source === "pump_dot_fun" ? 0.03 : 0;

  return (freshnessScore * 0.28)
    + (liquidityScore * 0.23)
    + (volumeScore * 0.21)
    + (holderScore * 0.12)
    + (tradeScore * 0.1)
    + (recencyScore * 0.06)
    + sourceBoost;
}

function runtimeLikeScore(input: {
  token: DiscoveryToken;
  tradeData: TradeDataSnapshot | null;
  holderConcentration: HolderConcentration | null;
  thresholds: LabThresholds;
  referenceUnix: number | null;
  ageWindowSeconds: number;
}) {
  const { token, tradeData, holderConcentration, thresholds, referenceUnix, ageWindowSeconds } = input;
  const ageSeconds = referenceUnix ? Math.max(0, Math.floor(Date.now() / 1000) - referenceUnix) : ageWindowSeconds;
  const ageScore = clamp(1 - (ageSeconds / Math.max(ageWindowSeconds, 1)), 0, 1);
  const volumeScore = logScore(tradeData?.volume5mUsd ?? token.volume5mUsd ?? 0, thresholds.minVolume5mUsd);
  const ratio = (tradeData?.volumeBuy5mUsd ?? 0) / Math.max(tradeData?.volumeSell5mUsd ?? 0, 1);
  const ratioScore = clamp((ratio - thresholds.minBuySellRatio) / Math.max(thresholds.minBuySellRatio, 1), 0, 1);
  const priceScore = clamp(
    ((tradeData?.priceChange5mPercent ?? token.priceChange5mPercent ?? 0) + thresholds.maxNegativePriceChange5mPercent)
      / Math.max(thresholds.maxNegativePriceChange5mPercent + 20, 1),
    0,
    1,
  );
  const momentumScore = (volumeScore * 0.45) + (ratioScore * 0.35) + (priceScore * 0.2);

  const uniqueBuyerScore = clamp(
    (tradeData?.uniqueWallets5m ?? 0) / Math.max(thresholds.minUniqueBuyers5m * 2, 1),
    0,
    1,
  );
  const holderScore = clamp((token.holders ?? 0) / Math.max(thresholds.minHolders * 2, 1), 0, 1);
  const top10Score = clamp(
    1 - ((holderConcentration?.top10Percent ?? thresholds.maxTop10HolderPercent) / Math.max(thresholds.maxTop10HolderPercent, 1)),
    0,
    1,
  );
  const largestScore = clamp(
    1 - ((holderConcentration?.largestHolderPercent ?? thresholds.maxSingleHolderPercent) / Math.max(thresholds.maxSingleHolderPercent, 1)),
    0,
    1,
  );
  const structureScore = (uniqueBuyerScore * 0.5) + (holderScore * 0.25) + (top10Score * 0.15) + (largestScore * 0.1);

  const liquidityScore = logScore(token.liquidityUsd ?? 0, thresholds.minLiquidityUsd);
  const exitabilityScore = (liquidityScore * 0.75) + (ageScore * 0.25);

  return (momentumScore * 0.35) + (structureScore * 0.35) + (exitabilityScore * 0.3);
}

function evaluateGraduatedToken(
  token: DiscoveryToken,
  recipe: LabRecipe,
  thresholds: LabThresholds,
  tradeData: TradeDataSnapshot | null,
  mintAuthorities: MintAuthoritySnapshot | null,
  holderConcentration: HolderConcentration | null,
  preScore: number,
  nowUnix: number,
): DeepEvaluation {
  const softIssues: string[] = [];
  const notes: string[] = [];
  const ageSeconds = token.graduatedAt ? nowUnix - token.graduatedAt : Number.POSITIVE_INFINITY;
  const referenceUnix = token.graduatedAt ?? token.lastTradeAt;
  const ageWindowSeconds = recipeWindowSeconds(recipe, nowUnix);
  const volume5mUsd = tradeData?.volume5mUsd ?? token.volume5mUsd ?? 0;
  const uniqueBuyers5m = tradeData?.uniqueWallets5m ?? 0;
  const buySellRatio = (tradeData?.volumeBuy5mUsd ?? 0) / Math.max(tradeData?.volumeSell5mUsd ?? 0, 1);
  const priceChange5m = tradeData?.priceChange5mPercent ?? token.priceChange5mPercent ?? 0;
  const marketCapUsd = token.marketCapUsd ?? 0;

  let rejectReason: string | null = null;

  if (!token.graduated || !token.graduatedAt) {
    rejectReason = "token is not confirmed as graduated";
  } else if (ageSeconds > thresholds.maxGraduationAgeSeconds) {
    rejectReason = `graduation too old: ${ageSeconds}s`;
  } else if ((token.liquidityUsd ?? 0) < thresholds.minLiquidityUsd * 0.65) {
    rejectReason = "liquidity far below floor";
  } else if (marketCapUsd > thresholds.maxMarketCapUsd * 2) {
    rejectReason = "market cap far above high-value ceiling";
  } else if ((token.holders ?? 0) < thresholds.minHolders * 0.65) {
    rejectReason = "holder count far below floor";
  } else if (!tradeData) {
    rejectReason = "trade data unavailable";
  } else if (volume5mUsd < thresholds.minVolume5mUsd * 0.65) {
    rejectReason = "5m volume far below floor";
  } else if (uniqueBuyers5m < thresholds.minUniqueBuyers5m * 0.65) {
    rejectReason = "unique buyers far below floor";
  } else if (buySellRatio < thresholds.minBuySellRatio * 0.7) {
    rejectReason = "buy/sell ratio collapsed";
  } else if (priceChange5m <= -thresholds.maxNegativePriceChange5mPercent * 1.5) {
    rejectReason = "price already dumping hard";
  } else if (!mintAuthorities) {
    rejectReason = "mint account unavailable";
  } else if (Boolean(mintAuthorities.mintAuthority)) {
    rejectReason = "mint authority still active";
  } else if (Boolean(mintAuthorities.freezeAuthority)) {
    rejectReason = "freeze authority still active";
  } else if (!holderConcentration) {
    rejectReason = "holder concentration unavailable";
  } else if (holderConcentration.top10Percent > thresholds.maxTop10HolderPercent * 1.25) {
    rejectReason = "top10 concentration far too high";
  } else if (holderConcentration.largestHolderPercent > thresholds.maxSingleHolderPercent * 1.25) {
    rejectReason = "largest holder concentration far too high";
  }

  if (!rejectReason) {
    if ((token.liquidityUsd ?? 0) < thresholds.minLiquidityUsd) softIssues.push("liquidity below floor");
    if (marketCapUsd > thresholds.maxMarketCapUsd) softIssues.push("market cap above preferred ceiling");
    if ((token.holders ?? 0) < thresholds.minHolders) softIssues.push("holder count below floor");
    if (volume5mUsd < thresholds.minVolume5mUsd) softIssues.push("5m volume below floor");
    if (uniqueBuyers5m < thresholds.minUniqueBuyers5m) softIssues.push("unique buyers below floor");
    if (buySellRatio < thresholds.minBuySellRatio) softIssues.push("buy/sell ratio too weak");
    if (priceChange5m <= -thresholds.maxNegativePriceChange5mPercent) softIssues.push("price already fading");
    if ((holderConcentration?.top10Percent ?? 0) > thresholds.maxTop10HolderPercent) softIssues.push("top10 concentration too high");
    if ((holderConcentration?.largestHolderPercent ?? 0) > thresholds.maxSingleHolderPercent) softIssues.push("largest holder concentration too high");

    if (softIssues.length >= 2) {
      rejectReason = `multiple soft weaknesses: ${softIssues.join(", ")}`;
    }
  }

  const entryScore = runtimeLikeScore({
    token,
    tradeData,
    holderConcentration,
    thresholds,
    referenceUnix,
    ageWindowSeconds,
  });
  const freshnessBonus = ageSeconds <= 900 ? 0.1 : ageSeconds <= 3_600 ? 0.07 : ageSeconds <= 14_400 ? 0.03 : 0;
  const tapeBonus = token.lastTradeAt && (nowUnix - token.lastTradeAt) <= 300 ? 0.03 : 0;
  const playScore = clamp(entryScore + freshnessBonus + tapeBonus, 0, 1.2);
  const pass = rejectReason === null;
  const grade = gradeFromScore(playScore, pass);

  if (holderConcentration) {
    notes.push(`top10=${holderConcentration.top10Percent.toFixed(2)}% largest=${holderConcentration.largestHolderPercent.toFixed(2)}%`);
  }

  return {
    mint: token.mint,
    mode: recipe.mode,
    pass,
    grade,
    preScore,
    entryScore,
    playScore,
    rejectReason,
    softIssues,
    notes,
    tradeData,
    mintAuthorities,
    holderConcentration,
  };
}

function evaluatePregradToken(
  token: DiscoveryToken,
  recipe: LabRecipe,
  thresholds: LabThresholds,
  tradeData: TradeDataSnapshot | null,
  mintAuthorities: MintAuthoritySnapshot | null,
  holderConcentration: HolderConcentration | null,
  preScore: number,
  nowUnix: number,
): DeepEvaluation {
  const softIssues: string[] = [];
  const notes: string[] = [];
  const minProgress = Number(resolveRelativeNumber(recipe.params.min_progress_percent, nowUnix) ?? 85);
  const liquidityFloor = Number(resolveRelativeNumber(recipe.params.min_liquidity, nowUnix) ?? Math.max(thresholds.minLiquidityUsd * 0.4, 3_000));
  const recentTradeWindow = nowUnix - Number(resolveRelativeNumber(recipe.params.min_last_trade_unix_time, nowUnix) ?? (nowUnix - 600));
  const recentListingWindow = recipeWindowSeconds(recipe, nowUnix);
  const referenceUnix = token.recentListingAt ?? token.creationAt ?? token.lastTradeAt;
  const volume5mUsd = tradeData?.volume5mUsd ?? token.volume5mUsd ?? 0;
  const volumeFloor = Math.max(500, thresholds.minVolume5mUsd * 0.35);
  const uniqueBuyersFloor = Math.max(10, Math.round(thresholds.minUniqueBuyers5m * 0.6));
  const buySellFloor = Math.max(1.0, thresholds.minBuySellRatio * 0.8);
  const buySellRatio = (tradeData?.volumeBuy5mUsd ?? 0) / Math.max(tradeData?.volumeSell5mUsd ?? 0, 1);

  let rejectReason: string | null = null;

  if (token.graduated) {
    notes.push("already graduated during a pregrad recipe");
  }
  if (token.progressPercent < minProgress) {
    rejectReason = "progress below recipe floor";
  } else if ((token.liquidityUsd ?? 0) < liquidityFloor * 0.5) {
    rejectReason = "liquidity too weak for a pregrad play";
  } else if (!tradeData) {
    rejectReason = "trade data unavailable";
  } else if (volume5mUsd < volumeFloor * 0.5) {
    rejectReason = "5m flow too weak";
  } else if ((tradeData.uniqueWallets5m ?? 0) < uniqueBuyersFloor * 0.5) {
    rejectReason = "unique buyer flow too weak";
  } else if (buySellRatio < buySellFloor * 0.75) {
    rejectReason = "buy/sell ratio too weak";
  } else if (token.lastTradeAt && (nowUnix - token.lastTradeAt) > Math.max(recentTradeWindow, 1_800)) {
    rejectReason = "tape already stale";
  } else if (holderConcentration && holderConcentration.largestHolderPercent > thresholds.maxSingleHolderPercent * 1.5) {
    rejectReason = "largest holder concentration too high";
  }

  if (!rejectReason) {
    if ((token.liquidityUsd ?? 0) < liquidityFloor) softIssues.push("liquidity below preferred floor");
    if (volume5mUsd < volumeFloor) softIssues.push("5m flow below preferred floor");
    if ((tradeData?.uniqueWallets5m ?? 0) < uniqueBuyersFloor) softIssues.push("unique buyers below preferred floor");
    if (buySellRatio < buySellFloor) softIssues.push("buy/sell ratio below preferred floor");
    if (holderConcentration && holderConcentration.top10Percent > thresholds.maxTop10HolderPercent * 1.1) {
      softIssues.push("top10 concentration elevated");
    }
    if (softIssues.length >= 2) {
      rejectReason = `multiple soft weaknesses: ${softIssues.join(", ")}`;
    }
  }

  const entryScore = runtimeLikeScore({
    token,
    tradeData,
    holderConcentration,
    thresholds,
    referenceUnix,
    ageWindowSeconds: recentListingWindow,
  });
  const progressBonus = clamp((token.progressPercent - minProgress) / Math.max(100 - minProgress, 1), 0, 1) * 0.18;
  const recencyBonus = token.lastTradeAt && (nowUnix - token.lastTradeAt) <= 300 ? 0.03 : 0;
  const playScore = clamp((entryScore * 0.82) + progressBonus + recencyBonus, 0, 1.2);
  const pass = rejectReason === null;
  const grade = gradeFromScore(playScore, pass);

  if (mintAuthorities?.mintAuthority) {
    notes.push("mint authority still active pre-grad");
  }
  if (mintAuthorities?.freezeAuthority) {
    notes.push("freeze authority still active pre-grad");
  }

  return {
    mint: token.mint,
    mode: recipe.mode,
    pass,
    grade,
    preScore,
    entryScore,
    playScore,
    rejectReason,
    softIssues,
    notes,
    tradeData,
    mintAuthorities,
    holderConcentration,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runOne() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => runOne()));
  return results;
}

async function birdeyeRequest<T>(endpoint: string, params: Record<string, Scalar>) {
  const url = new URL(endpoint, "https://public-api.birdeye.so");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const maxAttempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "X-API-KEY": env.BIRDEYE_API_KEY,
          "x-chain": "solana",
        },
      });
      const payload = await response.json() as T & { success?: boolean; message?: string };

      if (response.ok && payload.success !== false) {
        return payload;
      }

      const message = typeof payload.message === "string" ? payload.message : `Birdeye ${endpoint} failed with ${response.status}`;
      const shouldRetry = response.status === 429 || response.status >= 500;
      lastError = new Error(message);

      if (!shouldRetry || attempt >= maxAttempts) {
        throw lastError;
      }

      const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "");
      const backoffMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1_000
        : 500 * (2 ** (attempt - 1));
      await sleep(backoffMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxAttempts) {
        throw lastError;
      }
      await sleep(500 * (2 ** (attempt - 1)));
    }
  }

  throw lastError ?? new Error(`Birdeye ${endpoint} failed`);
}

async function heliusRpc<T>(method: string, params: unknown[]) {
  const response = await fetch(env.HELIUS_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${Date.now()}-${Math.random()}`,
      method,
      params,
    }),
  });
  const payload = await response.json() as { result?: T; error?: { message?: string } };

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Helius ${method} failed with ${response.status}`);
  }

  return payload.result as T;
}

async function getMemeList(params: Record<string, Scalar>) {
  const response = await birdeyeRequest<{ data?: { items?: Record<string, unknown>[]; has_next?: boolean } }>(
    "/defi/v3/token/meme/list",
    params,
  );

  return {
    items: (response.data?.items ?? [])
      .map(parseDiscoveryToken)
      .filter((token) => token.mint.length > 0),
    hasNext: response.data?.has_next === true,
  };
}

async function getTradeData(mint: string) {
  const response = await birdeyeRequest<{ data?: Record<string, unknown> }>(
    "/defi/v3/token/trade-data/single",
    { address: mint },
  );
  return response.data ? parseTradeData(response.data) : null;
}

async function getMintAuthorities(mint: string): Promise<MintAuthoritySnapshot | null> {
  const result = await heliusRpc<{
    value?: {
      data?: {
        parsed?: {
          info?: {
            mintAuthority?: string | null;
            freezeAuthority?: string | null;
            supply?: string;
            decimals?: number;
            isInitialized?: boolean;
          };
        };
      };
    } | null;
  }>(
    "getAccountInfo",
    [mint, { encoding: "jsonParsed", commitment: "confirmed" }],
  );

  const info = result.value?.data?.parsed?.info;
  if (!info) return null;

  return {
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    supplyRaw: typeof info.supply === "string" ? info.supply : "0",
    decimals: Number(info.decimals ?? 0),
    isInitialized: info.isInitialized !== false,
  };
}

function bigIntValue(value: string | number | bigint | null | undefined) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  return 0n;
}

async function getHolderConcentration(mint: string, supplyRaw: string) {
  const supply = bigIntValue(supplyRaw);
  if (supply <= 0n) return null;

  const result = await heliusRpc<{ value?: Array<{ address?: string; amount?: string }> }>(
    "getTokenLargestAccounts",
    [mint, { commitment: "confirmed" }],
  );

  const accounts = result.value ?? [];
  const topTenRaw = accounts.slice(0, 10).reduce((sum, row) => sum + bigIntValue(row.amount), 0n);
  const largestRaw = accounts[0] ? bigIntValue(accounts[0].amount) : 0n;
  const supplyAsNumber = Number(supply);
  if (!Number.isFinite(supplyAsNumber) || supplyAsNumber <= 0) return null;

  return {
    top10Percent: Number(topTenRaw) / supplyAsNumber * 100,
    largestHolderPercent: Number(largestRaw) / supplyAsNumber * 100,
    largestAccountsCount: accounts.length,
    largestHolderAddress: typeof accounts[0]?.address === "string" ? accounts[0].address : null,
  } satisfies HolderConcentration;
}

async function loadRecipes(recipePath: string) {
  const raw = await fs.readFile(recipePath, "utf8");
  const parsed = recipeFileSchema.parse(JSON.parse(raw));
  return parsed.recipes satisfies LabRecipe[];
}

async function resolveRecipePath(scriptDir: string, requestedPath?: string) {
  if (!requestedPath || requestedPath.trim().length === 0) {
    return path.join(scriptDir, "discovery-lab.recipes.json");
  }

  const trimmed = requestedPath.trim();
  const candidates = path.isAbsolute(trimmed)
    ? [trimmed]
    : [
      path.resolve(process.cwd(), trimmed),
      path.resolve(scriptDir, trimmed),
    ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return candidates[0];
}

async function loadCache(cachePath: string): Promise<Record<string, CacheEntry>> {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    return JSON.parse(raw) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

async function saveCache(cachePath: string, cache: Record<string, CacheEntry>) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
}

function candidateKey(planKey: string, mint: string) {
  return `${planKey}:${mint}`;
}

function isMintResearch(value: unknown): value is MintResearch {
  const record = asRecord(value);
  return record !== null
    && "tradeData" in record
    && "mintAuthorities" in record
    && "holderConcentration" in record
    && "errorMessage" in record;
}

function summarizeQuery(
  outcome: QueryOutcome,
  deepByCandidate: Map<string, DeepEvaluation>,
): QuerySummary {
  const selected = outcome.selectedTokens
    .map(({ token }) => {
      const deep = deepByCandidate.get(candidateKey(outcome.plan.key, token.mint));
      if (!deep) return null;
      return { token, deep };
    })
    .filter((value): value is { token: DiscoveryToken; deep: DeepEvaluation } => value !== null);

  const good = selected
    .filter(({ deep }) => deep.pass);

  const avgGoodPlayScore = good.length > 0
    ? good.reduce((sum, item) => sum + item.deep.playScore, 0) / good.length
    : 0;
  const avgGoodEntryScore = good.length > 0
    ? good.reduce((sum, item) => sum + item.deep.entryScore, 0) / good.length
    : 0;
  const avgSelectedPlayScore = selected.length > 0
    ? selected.reduce((sum, item) => sum + item.deep.playScore, 0) / selected.length
    : 0;
  const avgSelectedEntryScore = selected.length > 0
    ? selected.reduce((sum, item) => sum + item.deep.entryScore, 0) / selected.length
    : 0;
  const estimatedCu = outcome.queryCu + (outcome.selectedCount * 17);

  return {
    key: outcome.plan.key,
    source: outcome.plan.source,
    recipeName: outcome.plan.recipe.name,
    recipeMode: outcome.plan.recipe.mode,
    filterCount: outcome.plan.filterCount,
    returnedCount: outcome.returnedCount,
    selectedCount: outcome.selectedCount,
    goodCount: good.length,
    avgGoodPlayScore,
    avgGoodEntryScore,
    avgSelectedPlayScore,
    avgSelectedEntryScore,
    estimatedCu,
    topSelectedTokens: selected
      .sort((left, right) => right.deep.playScore - left.deep.playScore)
      .slice(0, 5)
      .map(({ token, deep }) => ({
        symbol: token.symbol,
        mint: token.mint,
        grade: deep.grade,
        playScore: deep.playScore,
        rejectReason: deep.rejectReason,
      })),
    topGoodTokens: good
      .sort((left, right) => right.deep.playScore - left.deep.playScore)
      .slice(0, 5)
      .map(({ token, deep }) => ({
        symbol: token.symbol,
        mint: token.mint,
        grade: deep.grade,
        playScore: deep.playScore,
        rejectReason: deep.rejectReason,
      })),
  };
}

function printSourceSummaries(sourceSummaries: SourceSummary[]) {
  console.log("\nSource winners");
  for (const summary of sourceSummaries) {
    console.log(
      `- ${summary.source}: recipes=${summary.recipesRun}, returned=${summary.totalReturned}, `
      + `good=${summary.totalGoodTokens}, uniqueGood=${summary.uniqueGoodTokens}, `
      + `bestCount=${summary.bestByGoodCount ?? "n/a"}, `
      + `bestScore=${summary.bestByAverageScore ?? "n/a"}, `
      + `bestEfficiency=${summary.bestByEfficiency ?? "n/a"}, `
      + `bestQuality=${summary.bestByQuality ?? "n/a"}`,
    );
  }
}

function printQuerySummaries(querySummaries: QuerySummary[]) {
  console.log("\nTop query outcomes");
  const sorted = [...querySummaries]
    .sort(
      (left, right) => right.goodCount - left.goodCount
        || right.avgGoodPlayScore - left.avgGoodPlayScore
        || right.avgSelectedPlayScore - left.avgSelectedPlayScore,
    )
    .slice(0, 12);

  for (const summary of sorted) {
    const topSymbols = summary.topGoodTokens.length > 0
      ? summary.topGoodTokens.map((token) => `${token.symbol}:${token.grade}`).join(", ")
      : summary.topSelectedTokens.map((token) => `${token.symbol}:${token.grade}@${token.playScore.toFixed(2)}`).join(", ");
    console.log(
      `- ${summary.source} / ${summary.recipeName}: good=${summary.goodCount}, returned=${summary.returnedCount}, `
      + `avgGood=${summary.avgGoodPlayScore.toFixed(3)}, avgSel=${summary.avgSelectedPlayScore.toFixed(3)}, estCU=${summary.estimatedCu}, `
      + `top=${topSymbols || "none"}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const recipePath = await resolveRecipePath(
    scriptDir,
    typeof args.recipes === "string" ? args.recipes : undefined,
  );
  const sources = csv(args.sources, DEFAULT_SOURCES);
  const recipeNames = new Set(csv(args["recipe-names"]));
  const thresholds = applyThresholdOverrides(
    buildThresholds(asString(args.profile, "high-value") === "runtime" ? "runtime" : "high-value"),
    args,
  );
  const deepEvalLimitOverride = asInt(args["deep-eval-limit"], 0);
  const queryConcurrency = asInt(args["query-concurrency"], 2);
  const deepConcurrency = asInt(args["deep-concurrency"], 4);
  const cacheTtlSeconds = asInt(args["cache-ttl-seconds"], 300);
  const outPath = typeof args.out === "string" ? path.resolve(process.cwd(), args.out) : null;
  const allowOverfiltered = args["allow-overfiltered"] === true;
  const cachePath = path.resolve(
    typeof args["cache-file"] === "string"
      ? args["cache-file"]
      : path.join(os.tmpdir(), "bot-trading-discovery-lab-cache.json"),
  );

  const recipes = (await loadRecipes(recipePath))
    .filter((recipe) => recipeNames.size === 0 || recipeNames.has(recipe.name))
    .map((recipe) => ({
      ...recipe,
      deepEvalLimit: deepEvalLimitOverride > 0 ? deepEvalLimitOverride : (recipe.deepEvalLimit ?? 6),
    }));

  if (recipes.length === 0) {
    throw new Error("No recipes selected.");
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const plans: ResolvedPlan[] = [];
  for (const recipe of recipes) {
    const explicitSource = typeof recipe.params.source === "string" && recipe.params.source.trim().length > 0
      ? recipe.params.source.trim()
      : null;
    const planSources = explicitSource ? [explicitSource] : sources;

    for (const source of planSources) {
      const params: Record<string, Scalar> = {};
      for (const [key, value] of Object.entries(recipe.params)) {
        const resolved = resolveRelativeNumber(value, nowUnix);
        if (resolved !== undefined) {
          params[key] = resolved;
        }
      }
      if (!("source" in params)) {
        params.source = source;
      }
      if (!("sort_type" in params)) {
        params.sort_type = "desc";
      }
      if (!("limit" in params)) {
        params.limit = 100;
      }

      const filterCount = countActiveFilters(params);
      plans.push({
        key: `${source}/${recipe.name}`,
        source,
        recipe,
        params,
        filterCount,
      });
    }
  }

  console.log(`Running discovery lab with profile=${thresholds.profileName}, recipes=${recipes.length}, sources=${sources.join(",")}`);
  console.log(`Planned queries=${plans.length}, minimum Birdeye CU=${plans.length * 100}`);

  const queryOutcomes = await mapWithConcurrency(plans, queryConcurrency, async (plan) => {
    if (plan.filterCount > 5 && !allowOverfiltered) {
      return {
        plan,
        returnedCount: 0,
        selectedCount: 0,
        queryCu: 0,
        durationMs: 0,
        status: "skipped",
        skipReason: `filter ceiling exceeded (${plan.filterCount} > 5)`,
        selectedTokens: [],
        topReturned: [],
      } satisfies QueryOutcome;
    }

    const startedAt = Date.now();
    try {
      const response = await getMemeList(plan.params);
      const ranked = response.items
        .map((token) => ({
          token,
          preScore: preScoreToken(token, plan.recipe, nowUnix),
        }))
        .sort((left, right) => right.preScore - left.preScore);
      const selected = ranked.slice(0, plan.recipe.deepEvalLimit ?? 6);

      return {
        plan,
        returnedCount: response.items.length,
        selectedCount: selected.length,
        queryCu: 100,
        durationMs: Date.now() - startedAt,
        status: "ok",
        selectedTokens: selected,
        topReturned: ranked.slice(0, 10).map((item) => ({
          symbol: item.token.symbol,
          mint: item.token.mint,
          preScore: item.preScore,
          liquidityUsd: item.token.liquidityUsd ?? 0,
          volume5mUsd: item.token.volume5mUsd ?? 0,
          volume1hUsd: item.token.volume1hUsd ?? 0,
          progressPercent: item.token.progressPercent,
        })),
      } satisfies QueryOutcome;
    } catch (error) {
      return {
        plan,
        returnedCount: 0,
        selectedCount: 0,
        queryCu: 100,
        durationMs: Date.now() - startedAt,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        selectedTokens: [],
        topReturned: [],
      } satisfies QueryOutcome;
    }
  });

  const selectedTokenMap = new Map<string, RankedToken>();
  for (const outcome of queryOutcomes) {
    if (outcome.status !== "ok") continue;
    for (const item of outcome.selectedTokens) {
      const current = selectedTokenMap.get(item.token.mint);
      if (!current || item.preScore > current.preScore) {
        selectedTokenMap.set(item.token.mint, item);
      }
    }
  }

  const mintResearchByMint = new Map<string, MintResearch>();
  const cache = await loadCache(cachePath);
  const deepByCandidate = new Map<string, DeepEvaluation>();
  const selectedEntries = [...selectedTokenMap.values()];

  await mapWithConcurrency(selectedEntries, deepConcurrency, async ({ token }) => {
    if (mintResearchByMint.has(token.mint)) {
      return;
    }

    const cached = cache[token.mint];
    if (cached && isMintResearch(cached.value) && (Date.now() - cached.fetchedAt) <= cacheTtlSeconds * 1_000) {
      mintResearchByMint.set(token.mint, cached.value);
      return;
    }

    try {
      const tradeData = await getTradeData(token.mint);
      const mintAuthorities = await getMintAuthorities(token.mint);
      const holderConcentration = mintAuthorities
        ? await getHolderConcentration(token.mint, mintAuthorities.supplyRaw)
        : null;
      mintResearchByMint.set(token.mint, {
        tradeData,
        mintAuthorities,
        holderConcentration,
        errorMessage: null,
      });
    } catch (error) {
      mintResearchByMint.set(token.mint, {
        tradeData: null,
        mintAuthorities: null,
        holderConcentration: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  });

  for (const outcome of queryOutcomes) {
    if (outcome.status !== "ok") continue;
    for (const selected of outcome.selectedTokens) {
      const research = mintResearchByMint.get(selected.token.mint);
      if (!research) continue;

      const deep = research.errorMessage
        ? {
          mint: selected.token.mint,
          mode: outcome.plan.recipe.mode,
          pass: false,
          grade: "REJECT",
          preScore: selected.preScore,
          entryScore: 0,
          playScore: 0,
          rejectReason: research.errorMessage,
          softIssues: [],
          notes: [],
          tradeData: null,
          mintAuthorities: null,
          holderConcentration: null,
        } satisfies DeepEvaluation
        : outcome.plan.recipe.mode === "graduated"
          ? evaluateGraduatedToken(
            selected.token,
            outcome.plan.recipe,
            thresholds,
            research.tradeData,
            research.mintAuthorities,
            research.holderConcentration,
            selected.preScore,
            nowUnix,
          )
          : evaluatePregradToken(
            selected.token,
            outcome.plan.recipe,
            thresholds,
            research.tradeData,
            research.mintAuthorities,
            research.holderConcentration,
            selected.preScore,
            nowUnix,
          );

      deepByCandidate.set(candidateKey(outcome.plan.key, selected.token.mint), deep);
      cache[selected.token.mint] = { fetchedAt: Date.now(), value: research };
    }
  }

  await saveCache(cachePath, cache);

  const querySummaries = queryOutcomes
    .filter((outcome) => outcome.status === "ok")
    .map((outcome) => summarizeQuery(outcome, deepByCandidate));

  const sourceSummaries: SourceSummary[] = sources.map((source) => {
    const sourceQueries = querySummaries.filter((summary) => summary.source === source);
    const goodMints = new Set(
      sourceQueries.flatMap((summary) => summary.topGoodTokens.map((token) => token.mint)),
    );
    const sourceQueriesWithWins = sourceQueries.filter((summary) => summary.goodCount > 0);
    const bestByGoodCount = [...sourceQueriesWithWins]
      .sort((left, right) => right.goodCount - left.goodCount || right.avgGoodPlayScore - left.avgGoodPlayScore)[0];
    const bestByAverageScore = [...sourceQueriesWithWins]
      .sort((left, right) => right.avgGoodPlayScore - left.avgGoodPlayScore || right.goodCount - left.goodCount)[0];
    const bestByEfficiency = [...sourceQueriesWithWins]
      .sort((left, right) => (right.goodCount / Math.max(right.estimatedCu, 1)) - (left.goodCount / Math.max(left.estimatedCu, 1)))[0];
    const bestByQuality = [...sourceQueries]
      .sort((left, right) => right.avgSelectedPlayScore - left.avgSelectedPlayScore || right.returnedCount - left.returnedCount)[0];

    return {
      source,
      recipesRun: sourceQueries.length,
      totalReturned: sourceQueries.reduce((sum, item) => sum + item.returnedCount, 0),
      totalGoodTokens: sourceQueries.reduce((sum, item) => sum + item.goodCount, 0),
      uniqueGoodTokens: goodMints.size,
      bestByGoodCount: bestByGoodCount?.recipeName ?? null,
      bestByAverageScore: bestByAverageScore?.recipeName ?? null,
      bestByEfficiency: bestByEfficiency?.recipeName ?? null,
      bestByQuality: bestByQuality?.recipeName ?? null,
    };
  });

  printSourceSummaries(sourceSummaries);
  printQuerySummaries(querySummaries);

  const failedQueries = queryOutcomes.filter((outcome) => outcome.status !== "ok");
  if (failedQueries.length > 0) {
    console.log("\nSkipped / failed queries");
    for (const item of failedQueries) {
      const reason = item.skipReason ?? item.errorMessage ?? "unknown";
      console.log(`- ${item.plan.key}: ${item.status} (${reason})`);
    }
  }

  if (outPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      profile: thresholds.profileName,
      thresholds,
      recipePath,
      sources,
      queryCount: plans.length,
      querySummaries,
      sourceSummaries,
      deepEvaluations: queryOutcomes
        .filter((outcome) => outcome.status === "ok")
        .flatMap((outcome) => outcome.selectedTokens.map(({ token }) => {
          const deep = deepByCandidate.get(candidateKey(outcome.plan.key, token.mint));
          if (!deep) return null;
          return {
            planKey: outcome.plan.key,
            recipeName: outcome.plan.recipe.name,
            mode: outcome.plan.recipe.mode,
            mint: token.mint,
            symbol: token.symbol,
            source: token.source,
            playScore: deep.playScore,
            entryScore: deep.entryScore,
            grade: deep.grade,
            pass: deep.pass,
            rejectReason: deep.rejectReason,
            softIssues: deep.softIssues,
            notes: deep.notes,
          };
        }))
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(report, null, 2));
    console.log(`\nWrote report to ${outPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
