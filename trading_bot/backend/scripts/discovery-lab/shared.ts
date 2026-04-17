import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_CREATED_DISCOVERY_LAB_PACK_ID, getCreatedDiscoveryLabPackById } from "../../src/services/discovery-lab-created-packs.js";
import type { DiscoveryLabThresholdOverrides } from "../../src/services/discovery-lab-pack-types.js";
import type { CacheEntry, LabRecipe, MintResearch, QueryValue, Scalar } from "./types.js";

export const DEFAULT_SOURCES = ["pump_dot_fun"];

export const FILTER_KEYS = new Set([
  "creator",
  "platform_id",
  "min_progress_percent",
  "max_progress_percent",
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
  recipes: z.array(recipeSchema).min(1),
});

export type LoadedRecipeSelection = {
  recipePath: string;
  recipes: LabRecipe[];
  packContext: {
    id: string;
    name: string;
    defaultProfile: "runtime" | "high-value" | "scalp";
    thresholdOverrides: DiscoveryLabThresholdOverrides;
  } | null;
};

export function printHelp() {
  console.log(`
Discovery lab for Birdeye meme/list + Helius structural grading.

Usage:
  npm run lab:discovery -- [options]

Options:
  --sources <csv>             Sources to test. Default: ${DEFAULT_SOURCES.join(",")}
  --pack <id>                 Repo-created discovery pack. Default: ${DEFAULT_CREATED_DISCOVERY_LAB_PACK_ID}
  --recipes <path>            Recipe JSON file override
  --recipe-names <csv>        Run only specific recipe names
  --profile <runtime|high-value|scalp>
                              Scoring profile. Defaults to selected pack profile, then high-value
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
  --out <path>                Write JSON report and sibling winners CSV
  --out-csv <path>            Write winners CSV to a file
  --allow-overfiltered        Do not skip recipes with more than 5 API filters
  --help                      Show help

Notes:
  Created/workspace pack threshold overrides are now applied automatically.
  CLI threshold flags still take precedence over pack defaults.
`);
}

export function parseArgs(argv: string[]) {
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

export function csv(value: string | boolean | undefined, fallback: string[] = []) {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function asInt(value: string | boolean | undefined, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asNumberArg(value: string | boolean | undefined, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asString(value: string | boolean | undefined, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getByPath(source: Record<string, unknown>, pathKey: string): unknown {
  let current: unknown = source;
  for (const segment of pathKey.split(".")) {
    const record = asRecord(current);
    if (!record || !(segment in record)) return undefined;
    current = record[segment];
  }
  return current;
}

export function pickNumber(source: Record<string, unknown>, ...paths: string[]) {
  for (const pathKey of paths) {
    const picked = asNumber(getByPath(source, pathKey));
    if (picked !== null) return picked;
  }
  return null;
}

export function pickString(source: Record<string, unknown>, ...paths: string[]) {
  for (const pathKey of paths) {
    const picked = asText(getByPath(source, pathKey));
    if (picked) return picked;
  }
  return null;
}

export function pickBoolean(source: Record<string, unknown>, ...paths: string[]) {
  for (const pathKey of paths) {
    const value = getByPath(source, pathKey);
    if (typeof value === "boolean") return value;
  }
  return null;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function logScore(value: number, floor: number) {
  const normalized = Math.log1p(Math.max(value, 0)) / Math.log1p(Math.max(floor * 6, 1));
  return clamp(normalized, 0, 1);
}

export function gradeFromScore(score: number, pass: boolean) {
  if (!pass) return "REJECT";
  if (score >= 0.92) return "A";
  if (score >= 0.84) return "A-";
  if (score >= 0.76) return "B+";
  if (score >= 0.68) return "B";
  if (score >= 0.6) return "B-";
  return "C";
}

export function resolveRelativeNumber(value: QueryValue, nowUnix: number): Scalar | undefined {
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

export function countActiveFilters(params: Record<string, Scalar>) {
  return Object.entries(params)
    .filter(([key]) => FILTER_KEYS.has(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .length;
}

export function recipeWindowSeconds(recipe: LabRecipe, nowUnix: number) {
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

export async function mapWithConcurrency<T, R>(
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

export async function loadRecipeSelection(
  scriptDir: string,
  requestedPath?: string,
  requestedPackId?: string,
): Promise<LoadedRecipeSelection> {
  const packId = typeof requestedPackId === "string" && requestedPackId.trim().length > 0
    ? requestedPackId.trim()
    : DEFAULT_CREATED_DISCOVERY_LAB_PACK_ID;

  if (!requestedPath || requestedPath.trim().length === 0) {
    const pack = getCreatedDiscoveryLabPackById(packId);
    if (!pack) {
      throw new Error(`Unknown created discovery pack: ${packId}`);
    }
    return {
      recipePath: `pack:${pack.id}`,
      recipes: pack.recipes as LabRecipe[],
      packContext: {
        id: pack.id,
        name: pack.name,
        defaultProfile: pack.defaultProfile,
        thresholdOverrides: pack.thresholdOverrides ?? {},
      },
    };
  }

  const trimmed = requestedPath.trim();
  const candidates = path.isAbsolute(trimmed)
    ? [trimmed]
    : [
      path.resolve(process.cwd(), trimmed),
      path.resolve(scriptDir, trimmed),
    ];

  let resolvedPath = candidates[0];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      resolvedPath = candidate;
      break;
    } catch {
      continue;
    }
  }

  const raw = await fs.readFile(resolvedPath, "utf8");
  const parsed = recipeFileSchema.parse(JSON.parse(raw));
  return {
    recipePath: resolvedPath,
    recipes: parsed.recipes satisfies LabRecipe[],
    packContext: null,
  };
}

export async function loadCache(cachePath: string): Promise<Record<string, CacheEntry>> {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    return JSON.parse(raw) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

export async function saveCache(cachePath: string, cache: Record<string, CacheEntry>) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
}

export function defaultCachePath() {
  return path.join(os.tmpdir(), "bot-trading-discovery-lab-cache.json");
}

export function deriveWinnerCsvPath(outPath: string) {
  const parsed = path.parse(outPath);
  const stem = parsed.ext.length > 0 ? parsed.name : parsed.base;
  return path.join(parsed.dir, `${stem}-winners.csv`);
}

export function candidateKey(planKey: string, mint: string) {
  return `${planKey}:${mint}`;
}

export function isMintResearch(value: unknown): value is MintResearch {
  const record = asRecord(value);
  return record !== null
    && "tradeData" in record
    && "mintAuthorities" in record
    && "holderConcentration" in record
    && "errorMessage" in record;
}
