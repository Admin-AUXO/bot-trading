import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("dexscreener");
const DEX_SCREENER_BASE_URL = "https://api.dexscreener.com";
const DEX_SCREENER_TIMEOUT_MS = 10_000;
const TOKEN_BATCH_SIZE = 30;

export interface DexScreenerTokenMarket {
  chainId: string;
  tokenAddress: string;
  pairAddress: string;
  priceUsd: number;
  liquidityUsd: number;
  pairCreatedAt: number;
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`DEX Screener HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeTokenMarket(row: Record<string, unknown>): DexScreenerTokenMarket | null {
  const baseToken = row.baseToken as Record<string, unknown> | undefined;
  const tokenAddress = String(baseToken?.address ?? row.tokenAddress ?? "").trim();
  if (!tokenAddress) return null;

  const liquidity = row.liquidity as Record<string, unknown> | undefined;

  return {
    chainId: String(row.chainId ?? "solana"),
    tokenAddress,
    pairAddress: String(row.pairAddress ?? ""),
    priceUsd: Number(row.priceUsd ?? 0),
    liquidityUsd: Number(liquidity?.usd ?? row.liquidityUsd ?? 0),
    pairCreatedAt: Number(row.pairCreatedAt ?? 0),
  };
}

export class DexScreenerService {
  async getTokens(tokenAddresses: string[]): Promise<DexScreenerTokenMarket[]> {
    const unique = [...new Set(tokenAddresses.filter(Boolean))];
    if (unique.length === 0) return [];

    try {
      const chunks = chunk(unique, TOKEN_BATCH_SIZE);
      const responses = await Promise.all(
        chunks.map((group) =>
          fetchJson<Record<string, unknown>[]>(
            `${DEX_SCREENER_BASE_URL}/tokens/v1/solana/${group.join(",")}`,
            DEX_SCREENER_TIMEOUT_MS,
          ),
        ),
      );

      return responses
        .flat()
        .map((row) => normalizeTokenMarket(row))
        .filter((row): row is DexScreenerTokenMarket => row !== null);
    } catch (err) {
      log.warn({ err, count: unique.length }, "getTokens failed");
      return [];
    }
  }

  async getTokenPairs(tokenAddress: string): Promise<DexScreenerTokenMarket[]> {
    if (!tokenAddress) return [];

    try {
      const rows = await fetchJson<Record<string, unknown>[]>(
        `${DEX_SCREENER_BASE_URL}/token-pairs/v1/solana/${tokenAddress}`,
        DEX_SCREENER_TIMEOUT_MS,
      );
      return rows
        .map((row) => normalizeTokenMarket(row))
        .filter((row): row is DexScreenerTokenMarket => row !== null);
    } catch (err) {
      log.warn({ err, tokenAddress }, "getTokenPairs failed");
      return [];
    }
  }
}
