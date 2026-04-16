import { env } from "../../src/config/env.js";
import type {
  DiscoveryToken,
  HolderConcentration,
  MintAuthoritySnapshot,
  TradeDataSnapshot,
} from "../../src/types/domain.js";
import {
  asRecord,
  getByPath,
  mapWithConcurrency,
  pickBoolean,
  pickNumber,
  pickString,
  sleep,
} from "./shared.js";
import type { BatchFetchResult, Scalar } from "./types.js";

export function parseDiscoveryToken(row: Record<string, unknown>): DiscoveryToken {
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

export function parseTradeData(row: Record<string, unknown>): TradeDataSnapshot {
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

async function heliusBatchRpc<T>(requests: Array<{ id: string; method: string; params: unknown[] }>) {
  const results = new Map<string, BatchFetchResult<T>>();
  if (requests.length === 0) {
    return results;
  }

  for (const request of requests) {
    results.set(request.id, { value: null, error: "missing helius batch response" });
  }

  try {
    const response = await fetch(env.HELIUS_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        requests.map((request) => ({
          jsonrpc: "2.0",
          id: request.id,
          method: request.method,
          params: request.params,
        })),
      ),
    });
    const payload = await response.json() as unknown;

    if (!response.ok) {
      const errorMessage = `Helius batch failed with ${response.status}`;
      for (const request of requests) {
        results.set(request.id, { value: null, error: errorMessage });
      }
      return results;
    }

    if (!Array.isArray(payload)) {
      const errorMessage = "Helius batch returned a non-array payload";
      for (const request of requests) {
        results.set(request.id, { value: null, error: errorMessage });
      }
      return results;
    }

    for (const item of payload) {
      const record = asRecord(item);
      const id = record ? getByPath(record, "id") : undefined;
      const requestId = typeof id === "string" || typeof id === "number" ? String(id) : null;
      if (!requestId || !results.has(requestId)) {
        continue;
      }

      const error = record ? asRecord(getByPath(record, "error")) : null;
      if (error) {
        results.set(requestId, {
          value: null,
          error: pickString(error, "message") ?? "unknown helius batch rpc error",
        });
        continue;
      }

      results.set(requestId, {
        value: (record ? getByPath(record, "result") : null) as T | null,
        error: null,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    for (const request of requests) {
      results.set(request.id, { value: null, error: errorMessage });
    }
  }

  return results;
}

export async function getMemeList(params: Record<string, Scalar>) {
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

export async function getTradeData(mint: string) {
  const response = await birdeyeRequest<{ data?: Record<string, unknown> }>(
    "/defi/v3/token/trade-data/single",
    { address: mint },
  );
  return response.data ? parseTradeData(response.data) : null;
}

function bigIntValue(value: string | number | bigint | null | undefined) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  return 0n;
}

function parseMintAuthorities(
  value: {
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
  } | null | undefined,
) {
  const info = value?.data?.parsed?.info;
  if (!info) return null;

  return {
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
    supplyRaw: typeof info.supply === "string" ? info.supply : "0",
    decimals: Number(info.decimals ?? 0),
    isInitialized: info.isInitialized !== false,
  } satisfies MintAuthoritySnapshot;
}

function parseHolderConcentration(
  result: { value?: Array<{ address?: string; amount?: string }> } | null | undefined,
  supplyRaw: string,
) {
  const supply = bigIntValue(supplyRaw);
  if (supply <= 0n) return null;

  const accounts = result?.value ?? [];
  const topTenRaw = accounts.slice(0, 10).reduce((sum, row) => sum + bigIntValue(row.amount), 0n);
  const largestRaw = accounts[0]?.amount ? bigIntValue(accounts[0].amount) : 0n;
  const supplyAsNumber = Number(supply);
  if (!Number.isFinite(supplyAsNumber) || supplyAsNumber <= 0) return null;

  return {
    top10Percent: Number(topTenRaw) / supplyAsNumber * 100,
    largestHolderPercent: Number(largestRaw) / supplyAsNumber * 100,
    largestAccountsCount: accounts.length,
    largestHolderAddress: typeof accounts[0]?.address === "string" ? accounts[0].address : null,
  } satisfies HolderConcentration;
}

export async function getMintAuthoritiesBatch(mints: string[]) {
  const uniqueMints = [...new Set(mints.filter((mint) => mint.trim().length > 0))];
  const results = new Map<string, BatchFetchResult<MintAuthoritySnapshot>>();
  const chunkSize = 100;

  for (let index = 0; index < uniqueMints.length; index += chunkSize) {
    const chunk = uniqueMints.slice(index, index + chunkSize);
    try {
      const response = await heliusRpc<{
        value?: Array<{
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
        } | null>;
      }>(
        "getMultipleAccounts",
        [chunk, { encoding: "jsonParsed", commitment: "confirmed" }],
      );

      const values = response.value ?? [];
      for (const [offset, mint] of chunk.entries()) {
        results.set(mint, {
          value: parseMintAuthorities(values[offset] ?? null),
          error: null,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      for (const mint of chunk) {
        results.set(mint, { value: null, error: errorMessage });
      }
    }
  }

  return results;
}

export async function getHolderConcentrationsBatch(
  inputs: Array<{ mint: string; supplyRaw: string }>,
  concurrency: number,
) {
  const results = new Map<string, BatchFetchResult<HolderConcentration>>();
  const uniqueInputs = [...new Map(inputs.map((input) => [input.mint, input])).values()];
  const eligible = uniqueInputs.filter((input) => bigIntValue(input.supplyRaw) > 0n);
  const chunkSize = 50;
  const chunks: Array<Array<{ mint: string; supplyRaw: string }>> = [];

  for (const input of uniqueInputs) {
    if (bigIntValue(input.supplyRaw) <= 0n) {
      results.set(input.mint, { value: null, error: null });
    }
  }

  for (let index = 0; index < eligible.length; index += chunkSize) {
    chunks.push(eligible.slice(index, index + chunkSize));
  }

  await mapWithConcurrency(chunks, Math.max(1, concurrency), async (chunk) => {
    const batchResults = await heliusBatchRpc<{ value?: Array<{ address?: string; amount?: string }> }>(
      chunk.map((input) => ({
        id: input.mint,
        method: "getTokenLargestAccounts",
        params: [input.mint, { commitment: "confirmed" }],
      })),
    );

    for (const input of chunk) {
      const batchResult = batchResults.get(input.mint);
      if (!batchResult) {
        results.set(input.mint, { value: null, error: "missing helius holder batch result" });
        continue;
      }

      results.set(input.mint, {
        value: batchResult.error ? null : parseHolderConcentration(batchResult.value, input.supplyRaw),
        error: batchResult.error,
      });
    }
  });

  return results;
}
