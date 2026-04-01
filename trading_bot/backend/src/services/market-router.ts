import type {
  ApiRequestMeta,
  ExitRefresh,
  FinalScoreInput,
  JsonValue,
  PrefilterResult,
  SeedCandidate,
} from "../utils/types.js";
import { config } from "../config/index.js";
import type { BirdeyeService } from "./birdeye.js";
import type { DexScreenerService, DexScreenerTokenMarket } from "./dexscreener.js";
import type { JupiterService } from "./jupiter.js";

type JupiterTokenRow = Record<string, unknown>;

function extractText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function normalizeSeed(row: JupiterTokenRow, source: SeedCandidate["source"]): SeedCandidate | null {
  const address = extractText(row.id ?? row.address ?? row.mint);
  if (!address) return null;

  return {
    address,
    symbol: extractText(row.symbol) || address.slice(0, 6),
    name: extractText(row.name) || extractText(row.symbol) || address,
    source,
    priceUsd: extractNumber(row.priceUsd ?? row.usdPrice ?? row.price),
    liquidityUsd: extractNumber(row.liquidity ?? row.liquidityUsd),
    marketCap: extractNumber(row.marketCap ?? row.mcap),
    metadata: {
      rawSource: String(source),
    },
  };
}

function toMetadata(row: DexScreenerTokenMarket): Record<string, JsonValue> {
  return {
    chainId: row.chainId,
    pairAddress: row.pairAddress,
  };
}

export class MarketRouter {
  private priceFallbackCache = new Map<string, ExitRefresh & { expiresAt: number }>();

  constructor(private deps: {
    jupiter: Pick<JupiterService, "getTopTrendingTokens" | "getTopTradedTokens" | "getRecentTokens" | "getPricesUsd" | "getQuoteForPriceCheck">;
    dexscreener: Pick<DexScreenerService, "getTokens" | "getTokenPairs">;
    birdeye: Pick<BirdeyeService, "getMultiPrice">;
  }) {}

  async getMomentumSeeds(params?: { interval?: string; limit?: number }): Promise<SeedCandidate[]> {
    const [trending, traded] = await Promise.all([
      this.deps.jupiter.getTopTrendingTokens(params),
      this.deps.jupiter.getTopTradedTokens(params),
    ]);

    return this.dedupeSeeds([
      ...this.mapSeeds(trending, "JUPITER_TOP_TRENDING"),
      ...this.mapSeeds(traded, "JUPITER_TOP_TRADED"),
    ]);
  }

  async getRecentSeeds(params?: { limit?: number }): Promise<SeedCandidate[]> {
    const recent = await this.deps.jupiter.getRecentTokens(params);
    return this.mapSeeds(recent, "JUPITER_RECENT");
  }

  async getMarketBreadthSample(params?: { interval?: string; limit?: number }): Promise<SeedCandidate[]> {
    return this.getMomentumSeeds(params);
  }

  async prefilterCandidates(tokenAddresses: string[]): Promise<Map<string, PrefilterResult>> {
    const rows = await this.deps.dexscreener.getTokens(tokenAddresses);
    const results = new Map<string, PrefilterResult>();

    for (const row of rows) {
      results.set(row.tokenAddress, {
        address: row.tokenAddress,
        passed: true,
        source: "DEX_SCREENER",
        pairAddress: row.pairAddress,
        priceUsd: row.priceUsd,
        liquidityUsd: row.liquidityUsd,
        pairCreatedAt: row.pairCreatedAt,
        metadata: toMetadata(row),
      });
    }

    for (const tokenAddress of tokenAddresses) {
      if (results.has(tokenAddress)) continue;
      results.set(tokenAddress, {
        address: tokenAddress,
        passed: false,
        source: "DEX_SCREENER",
        reason: "no DEX Screener market data",
      });
    }

    return results;
  }

  async refreshExitContext(tokenAddresses: string[], meta?: ApiRequestMeta): Promise<Map<string, ExitRefresh>> {
    const unique = [...new Set(tokenAddresses.filter(Boolean))];
    const prices = await this.deps.jupiter.getPricesUsd(unique);
    const results = new Map<string, ExitRefresh>();
    const pendingQuoteFallback: string[] = [];
    const now = Date.now();

    for (const tokenAddress of unique) {
      const price = prices.get(tokenAddress);
      if (price?.value) {
        results.set(tokenAddress, {
          tokenAddress,
          priceUsd: price.value,
          liquidityUsd: price.liquidity ?? 0,
          priceSource: "JUPITER_PRICE",
          updatedAt: price.updateUnixTime ?? 0,
        });
        continue;
      }

      const cached = this.getCachedFallback(tokenAddress, now);
      if (cached) {
        results.set(tokenAddress, cached);
        continue;
      }

      pendingQuoteFallback.push(tokenAddress);
    }

    const unresolvedForBirdeye: string[] = [];
    if (pendingQuoteFallback.length > 0) {
      const quoteFallbacks = await Promise.all(pendingQuoteFallback.map(async (tokenAddress) => ({
        tokenAddress,
        priceUsd: await this.deps.jupiter.getQuoteForPriceCheck(tokenAddress),
      })));

      for (const quote of quoteFallbacks) {
        if (quote.priceUsd) {
          const refresh: ExitRefresh = {
            tokenAddress: quote.tokenAddress,
            priceUsd: quote.priceUsd,
            liquidityUsd: 0,
            priceSource: "JUPITER_QUOTE",
            updatedAt: now,
          };
          this.setCachedFallback(refresh, now);
          results.set(quote.tokenAddress, refresh);
          continue;
        }

        unresolvedForBirdeye.push(quote.tokenAddress);
      }
    }

    if (unresolvedForBirdeye.length > 0) {
      const birdeyePrices = await this.deps.birdeye.getMultiPrice(unresolvedForBirdeye, {
        ...meta,
        essential: meta?.essential ?? true,
        batchSize: unresolvedForBirdeye.length,
      });

      for (const tokenAddress of unresolvedForBirdeye) {
        const price = birdeyePrices.get(tokenAddress);
        if (price?.value) {
          const refresh: ExitRefresh = {
            tokenAddress,
            priceUsd: price.value,
            liquidityUsd: price.liquidity ?? 0,
            priceSource: "BIRDEYE_SLOW_PATH",
            updatedAt: price.updateUnixTime ?? now,
          };
          this.setCachedFallback(refresh, now);
          results.set(tokenAddress, refresh);
          continue;
        }

      results.set(tokenAddress, {
        tokenAddress,
        priceUsd: null,
        liquidityUsd: 0,
        priceSource: "JUPITER_PRICE",
        updatedAt: 0,
      });
      }
    }

    return results;
  }

  buildFinalScoreInput(seed: SeedCandidate): FinalScoreInput {
    return {
      address: seed.address,
      symbol: seed.symbol,
      name: seed.name,
      source: seed.source,
    };
  }

  private mapSeeds(rows: JupiterTokenRow[], source: SeedCandidate["source"]): SeedCandidate[] {
    return rows
      .map((row) => normalizeSeed(row, source))
      .filter((row): row is SeedCandidate => row !== null);
  }

  private dedupeSeeds(seeds: SeedCandidate[]): SeedCandidate[] {
    const seen = new Set<string>();
    return seeds.filter((seed) => {
      if (seen.has(seed.address)) return false;
      seen.add(seed.address);
      return true;
    });
  }

  private getCachedFallback(tokenAddress: string, now: number): ExitRefresh | null {
    const cached = this.priceFallbackCache.get(tokenAddress);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
      this.priceFallbackCache.delete(tokenAddress);
      return null;
    }

    const { expiresAt: _expiresAt, ...refresh } = cached;
    return refresh;
  }

  private setCachedFallback(refresh: ExitRefresh, now: number): void {
    this.priceFallbackCache.set(refresh.tokenAddress, {
      ...refresh,
      expiresAt: now + config.marketRouter.priceSlowPathRefreshMs,
    });
  }
}
