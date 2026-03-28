import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import { CircuitBreaker } from "../utils/circuit-breaker.js";
import { RateLimiter, backoffWithJitter } from "../utils/rate-limiter.js";
import { ApiBudgetManager, QuotaExceededError } from "../core/api-budget-manager.js";
import type { ApiRequestMeta, MultiPriceResult, MemeToken, TokenHolder, TokenOverview, TokenSecurity, TradeData } from "../utils/types.js";

const log = createChildLogger("birdeye");

const ENDPOINT_COSTS = {
  "/defi/token_overview": 30,
  "/defi/token_security": 50,
  "/v3/token/holder": 50,
  "/v3/token/trade-data/single": 15,
  "/v3/token/list": 100,
  "/v3/token/meme/list": 100,
  "/v3/token/meme/detail/single": 30,
  "/v2/tokens/top_traders": 30,
  "/defi/token_trending": 50,
  "/v2/tokens/new_listing": 80,
  "/v3/pair/overview/single": 20,
  "/defi/ohlcv": 40,
  "/v3/token/txs": 20,
  "/utils/v1/credits": 1,
} as const;

const CACHE_TTLS = {
  overview: 30_000,
  security: 15 * 60_000,
  holders: 10 * 60_000,
  trade: 20_000,
  tokenList: 20_000,
  memeList: 20_000,
  memeDetail: 30_000,
  trending: 20_000,
  newListings: 20_000,
  pair: 20_000,
  multiPrice: 5_000,
  credits: 60_000,
} as const;

class BirdeyeHttpError extends Error {
  constructor(public status: number, statusText: string) {
    super(`Birdeye HTTP ${status}: ${statusText}`);
  }
}

export interface BirdeyeCreditsUsage {
  cycleStart: Date | null;
  cycleEnd: Date | null;
  used: number | null;
  remaining: number | null;
  overage: number | null;
  overageCost: number | null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function sanitizeFinite(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function estimateBatchCost(batchSize: number, baseCost: number = 5): number {
  return Math.ceil(Math.pow(Math.max(batchSize, 1), 0.8) * baseCost);
}

export class BirdeyeService {
  private lastRequestTime = 0;
  private circuitBreaker: CircuitBreaker;
  private walletRateLimiter: RateLimiter;
  private readonly tokenCache = new Map<string, { value: unknown; expiresAt: number }>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private budgetManager: ApiBudgetManager) {
    this.circuitBreaker = new CircuitBreaker(
      "birdeye",
      config.circuitBreaker.birdeye.failureThreshold,
      config.circuitBreaker.birdeye.cooldownMs,
      config.circuitBreaker.birdeye.halfOpenMax,
      (err) => !(err instanceof BirdeyeHttpError && err.status === 429),
    );
    this.walletRateLimiter = new RateLimiter("birdeye-wallet", config.api.birdeyeWalletRpmLimit, config.api.birdeyeWalletWindowMs);
  }

  private async request<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(path, config.birdeye.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.api.birdeyeTimeoutMs);
    try {
      const res = await fetch(url.toString(), {
        headers: { "X-API-KEY": config.birdeye.apiKey, "x-chain": "solana" },
        signal: controller.signal,
      });
      if (!res.ok) throw new BirdeyeHttpError(res.status, res.statusText);
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }

  private async throttledRequest<T>(fn: () => Promise<T>, maxRetries: number = config.birdeye.maxRetries): Promise<T> {
    const minInterval = 1000 / config.birdeye.rateLimit;
    const now = Date.now();
    const wait = Math.max(0, minInterval - (now - this.lastRequestTime));

    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestTime = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.circuitBreaker.execute(fn);
      } catch (err) {
        const status = err instanceof BirdeyeHttpError ? err.status : 0;
        const isRetryable = status === 429 || status === 503 || isAbortError(err);
        if (!isRetryable || attempt === maxRetries) throw err;
        const delay = backoffWithJitter(attempt);
        log.debug({ attempt, delay, status }, "retrying birdeye request");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error("unreachable");
  }

  private async walletThrottledRequest<T>(fn: () => Promise<T>): Promise<T> {
    await this.walletRateLimiter.waitForSlot();
    return this.throttledRequest(fn);
  }

  private getCached<T>(key: string): T | null {
    const entry = this.tokenCache.get(key);
    if (entry && Date.now() < entry.expiresAt) return entry.value as T;
    if (entry) this.tokenCache.delete(key);
    return null;
  }

  private setCache(key: string, value: unknown): void {
    this.tokenCache.set(key, { value, expiresAt: Date.now() + this.getCacheTtl(key) });
  }

  private getCacheTtl(key: string): number {
    if (key.startsWith("overview:")) return CACHE_TTLS.overview;
    if (key.startsWith("security:")) return CACHE_TTLS.security;
    if (key.startsWith("holders:")) return CACHE_TTLS.holders;
    if (key.startsWith("trade:")) return CACHE_TTLS.trade;
    if (key.startsWith("token-list:")) return CACHE_TTLS.tokenList;
    if (key.startsWith("meme-list:")) return CACHE_TTLS.memeList;
    if (key.startsWith("meme-detail:")) return CACHE_TTLS.memeDetail;
    if (key.startsWith("trending:")) return CACHE_TTLS.trending;
    if (key.startsWith("new-listings:")) return CACHE_TTLS.newListings;
    if (key.startsWith("pair:")) return CACHE_TTLS.pair;
    if (key.startsWith("multi-price:")) return CACHE_TTLS.multiPrice;
    if (key.startsWith("credits:")) return CACHE_TTLS.credits;
    return config.api.birdeyeCacheTtlMs;
  }

  private dedupedFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private async requestWithBudget<T>(options: {
    endpoint: string;
    params?: Record<string, string | number | boolean | undefined>;
    estimatedCredits: number;
    meta?: ApiRequestMeta;
    walletEndpoint?: boolean;
  }): Promise<T> {
    const reservation = await this.budgetManager.reserve("BIRDEYE", options.estimatedCredits, options.meta);
    const startedAt = Date.now();
    try {
      const runner = options.walletEndpoint ? this.walletThrottledRequest.bind(this) : this.throttledRequest.bind(this);
      const result = await runner(() => this.request<T>(options.endpoint, options.params));
      reservation.commit({
        endpoint: options.endpoint,
        credits: options.estimatedCredits,
        statusCode: 200,
        latencyMs: Date.now() - startedAt,
        batchSize: options.meta?.batchSize,
      });
      return result;
    } catch (err) {
      reservation.commit({
        endpoint: options.endpoint,
        credits: options.estimatedCredits,
        statusCode: err instanceof BirdeyeHttpError ? err.status : 0,
        latencyMs: Date.now() - startedAt,
        success: false,
        batchSize: options.meta?.batchSize,
      });
      throw err;
    }
  }

  async getTokenOverview(address: string, meta?: ApiRequestMeta): Promise<TokenOverview | null> {
    const cacheKey = `overview:${address}`;
    const cached = this.getCached<TokenOverview>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/defi/token_overview", meta);
      return cached;
    }

    try {
      return this.dedupedFetch(cacheKey, async () => {
        const res = await this.requestWithBudget<{ data?: Record<string, unknown> }>({
          endpoint: "/defi/token_overview",
          params: { address },
          estimatedCredits: ENDPOINT_COSTS["/defi/token_overview"],
          meta,
        });
        const d = res?.data;
        if (!d) return null;

        const result: TokenOverview = {
          address: String(d.address ?? ""),
          symbol: String(d.symbol ?? ""),
          name: String(d.name ?? ""),
          price: sanitizeFinite(d.price),
          priceChange5m: sanitizeFinite(d.priceChange5mPercent),
          priceChange1h: sanitizeFinite(d.priceChange1hPercent),
          volume5m: sanitizeFinite(d.v5mUSD),
          volume1h: sanitizeFinite(d.v1hUSD),
          liquidity: sanitizeFinite(d.liquidity),
          marketCap: sanitizeFinite(d.mc),
          holder: sanitizeFinite(d.holder),
          buyPercent: sanitizeFinite(d.buy5mPercent),
          sellPercent: sanitizeFinite(d.sell5mPercent),
        };
        this.setCache(cacheKey, result);
        return result;
      });
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.error({ err: (err as Error).message, address }, "getTokenOverview failed");
      }
      return null;
    }
  }

  async getTokenSecurity(address: string, meta?: ApiRequestMeta): Promise<TokenSecurity | null> {
    const cacheKey = `security:${address}`;
    const cached = this.getCached<TokenSecurity>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/defi/token_security", meta);
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: Record<string, unknown> }>({
        endpoint: "/defi/token_security",
        params: { address },
        estimatedCredits: ENDPOINT_COSTS["/defi/token_security"],
        meta,
      });
      const d = res?.data;
      if (!d) return null;

      const result: TokenSecurity = {
        top10HolderPercent: sanitizeFinite(d.top10HolderPercent),
        freezeable: d.freezeable === "true" || d.freezeable === true,
        mintAuthority: d.mintAuthority !== null && d.mintAuthority !== "",
        transferFeeEnable: d.transferFeeEnable === "true" || d.transferFeeEnable === true,
        mutableMetadata: d.mutableMetadata === "true" || d.mutableMetadata === true,
      };
      this.setCache(cacheKey, result);
      return result;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.error({ err: (err as Error).message, address }, "getTokenSecurity failed");
      }
      return null;
    }
  }

  async getTokenHolders(address: string, limit: number = 10, meta?: ApiRequestMeta): Promise<TokenHolder[]> {
    const cacheKey = `holders:${address}:${limit}`;
    const cached = this.getCached<TokenHolder[]>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/v3/token/holder", { ...meta, batchSize: limit });
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: { items?: unknown[] } }>({
        endpoint: "/v3/token/holder",
        params: { address, limit },
        estimatedCredits: ENDPOINT_COSTS["/v3/token/holder"],
        meta: { ...meta, batchSize: limit },
        walletEndpoint: true,
      });
      const items = (res?.data?.items ?? []) as Record<string, unknown>[];
      const holders = items.map((holder) => ({
        address: String(holder.owner ?? ""),
        percent: sanitizeFinite(holder.uiAmountPercent),
      }));
      this.setCache(cacheKey, holders);
      return holders;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message, address }, "getTokenHolders failed");
      }
      return [];
    }
  }

  async getTradeData(address: string, meta?: ApiRequestMeta): Promise<TradeData | null> {
    const cacheKey = `trade:${address}`;
    const cached = this.getCached<TradeData>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/v3/token/trade-data/single", meta);
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: Record<string, unknown> }>({
        endpoint: "/v3/token/trade-data/single",
        params: { address },
        estimatedCredits: ENDPOINT_COSTS["/v3/token/trade-data/single"],
        meta,
      });
      const d = res?.data;
      if (!d) return null;

      const result: TradeData = {
        volume5m: sanitizeFinite(d.volume5mUSD),
        volumeHistory5m: sanitizeFinite(d.volumeHistory5mUSD),
        volumeBuy5m: sanitizeFinite(d.volumeBuy5mUSD),
        trade5m: sanitizeFinite(d.trade5m),
        buy5m: sanitizeFinite(d.buy5m),
        uniqueWallet5m: sanitizeFinite(d.uniqueWallet5m),
      };
      this.setCache(cacheKey, result);
      return result;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message, address }, "getTradeData failed");
      }
      return null;
    }
  }

  async getTokenList(
    params: {
      sortBy: string;
      minVolume5m?: number;
      minLiquidity?: number;
      maxMarketCap?: number;
      minHolder?: number;
      limit?: number;
    },
    meta?: ApiRequestMeta,
  ): Promise<TokenOverview[]> {
    const cacheKey = `token-list:${JSON.stringify(params)}`;
    const cached = this.getCached<TokenOverview[]>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/v3/token/list", { ...meta, batchSize: params.limit ?? 5 });
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: { items?: unknown[] } }>({
        endpoint: "/v3/token/list",
        params: {
          sort_by: params.sortBy,
          sort_type: "desc",
          min_volume_5m_usd: params.minVolume5m,
          min_liquidity: params.minLiquidity,
          max_market_cap: params.maxMarketCap,
          min_holder: params.minHolder,
          limit: params.limit ?? 5,
        },
        estimatedCredits: ENDPOINT_COSTS["/v3/token/list"],
        meta: { ...meta, batchSize: params.limit ?? 5 },
      });
      const items = (res?.data?.items ?? []) as Record<string, unknown>[];
      const list = items.map((d) => ({
        address: String(d.address ?? ""),
        symbol: String(d.symbol ?? ""),
        name: String(d.name ?? ""),
        price: sanitizeFinite(d.price),
        priceChange5m: sanitizeFinite(d.priceChange5mPercent),
        priceChange1h: sanitizeFinite(d.priceChange1hPercent),
        volume5m: sanitizeFinite(d.v5mUSD),
        volume1h: sanitizeFinite(d.v1hUSD),
        liquidity: sanitizeFinite(d.liquidity),
        marketCap: sanitizeFinite(d.mc),
        holder: sanitizeFinite(d.holder),
        buyPercent: sanitizeFinite(d.buy5mPercent),
        sellPercent: sanitizeFinite(d.sell5mPercent),
      }));
      this.setCache(cacheKey, list);
      return list;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.error({ err: (err as Error).message }, "getTokenList failed");
      }
      return [];
    }
  }

  async getMemeTokenList(
    params: {
      graduated?: boolean;
      minProgressPercent?: number;
      minGraduatedTime?: number;
      source?: string;
      limit?: number;
    },
    meta?: ApiRequestMeta,
  ): Promise<MemeToken[]> {
    const cacheKey = `meme-list:${JSON.stringify(params)}`;
    const cached = this.getCached<MemeToken[]>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/v3/token/meme/list", { ...meta, batchSize: params.limit ?? 10 });
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: { items?: unknown[] } }>({
        endpoint: "/v3/token/meme/list",
        params: {
          graduated: params.graduated,
          min_progress_percent: params.minProgressPercent,
          min_graduated_time: params.minGraduatedTime,
          source: params.source,
          limit: params.limit ?? 10,
        },
        estimatedCredits: ENDPOINT_COSTS["/v3/token/meme/list"],
        meta: { ...meta, batchSize: params.limit ?? 10 },
      });
      const items = (res?.data?.items ?? []) as Record<string, unknown>[];
      const tokens = items.map((d) => ({
        address: String(d.address ?? ""),
        symbol: String(d.symbol ?? ""),
        name: String(d.name ?? ""),
        source: String(d.source ?? ""),
        progressPercent: sanitizeFinite(d.progressPercent),
        graduated: Boolean(d.graduated),
        graduatedTime: d.graduatedTime != null ? sanitizeFinite(d.graduatedTime) : undefined,
        realSolReserves: sanitizeFinite(d.realSolReserves),
        creator: String(d.creator ?? ""),
      }));
      this.setCache(cacheKey, tokens);
      return tokens;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.error({ err: (err as Error).message }, "getMemeTokenList failed");
      }
      return [];
    }
  }

  async getMemeTokenDetail(address: string, meta?: ApiRequestMeta): Promise<MemeToken | null> {
    const cacheKey = `meme-detail:${address}`;
    const cached = this.getCached<MemeToken>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/v3/token/meme/detail/single", meta);
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: Record<string, unknown> }>({
        endpoint: "/v3/token/meme/detail/single",
        params: { address },
        estimatedCredits: ENDPOINT_COSTS["/v3/token/meme/detail/single"],
        meta,
      });
      const d = res?.data;
      if (!d) return null;

      const token = {
        address: String(d.address ?? ""),
        symbol: String(d.symbol ?? ""),
        name: String(d.name ?? ""),
        source: String(d.source ?? ""),
        progressPercent: sanitizeFinite(d.progressPercent),
        graduated: Boolean(d.graduated),
        graduatedTime: d.graduatedTime != null ? sanitizeFinite(d.graduatedTime) : undefined,
        realSolReserves: sanitizeFinite(d.realSolReserves),
        creator: String(d.creator ?? ""),
      };
      this.setCache(cacheKey, token);
      return token;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message, address }, "getMemeTokenDetail failed");
      }
      return null;
    }
  }

  async getTopTraders(address: string, meta?: ApiRequestMeta): Promise<unknown[]> {
    try {
      const res = await this.requestWithBudget<{ data?: unknown[] }>({
        endpoint: "/v2/tokens/top_traders",
        params: { address },
        estimatedCredits: ENDPOINT_COSTS["/v2/tokens/top_traders"],
        meta,
      });
      return res?.data ?? [];
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message, address }, "getTopTraders failed");
      }
      return [];
    }
  }

  async getTokenTrending(meta?: ApiRequestMeta): Promise<unknown[]> {
    const cacheKey = "trending:volume";
    const cached = this.getCached<unknown[]>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/defi/token_trending", meta);
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: { items?: unknown[] } }>({
        endpoint: "/defi/token_trending",
        params: {
          sort_by: "volume",
          sort_type: "desc",
          offset: 0,
          limit: 10,
        },
        estimatedCredits: ENDPOINT_COSTS["/defi/token_trending"],
        meta: { ...meta, batchSize: 10 },
      });
      const items = res?.data?.items ?? [];
      this.setCache(cacheKey, items);
      return items;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message }, "getTokenTrending failed");
      }
      return [];
    }
  }

  async getNewListings(meta?: ApiRequestMeta): Promise<unknown[]> {
    const cacheKey = "new-listings:20";
    const cached = this.getCached<unknown[]>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/v2/tokens/new_listing", meta);
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: unknown[] }>({
        endpoint: "/v2/tokens/new_listing",
        params: { limit: 20 },
        estimatedCredits: ENDPOINT_COSTS["/v2/tokens/new_listing"],
        meta: { ...meta, batchSize: 20 },
      });
      const listings = res?.data ?? [];
      this.setCache(cacheKey, listings);
      return listings;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message }, "getNewListings failed");
      }
      return [];
    }
  }

  async getPairOverview(pairAddress: string, meta?: ApiRequestMeta): Promise<unknown> {
    const cacheKey = `pair:${pairAddress}`;
    const cached = this.getCached<unknown>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/v3/pair/overview/single", meta);
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: unknown }>({
        endpoint: "/v3/pair/overview/single",
        params: { address: pairAddress },
        estimatedCredits: ENDPOINT_COSTS["/v3/pair/overview/single"],
        meta,
      });
      const pair = res?.data ?? null;
      this.setCache(cacheKey, pair);
      return pair;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message, pairAddress }, "getPairOverview failed");
      }
      return null;
    }
  }

  async getOhlcv(
    address: string,
    params?: {
      timeFrom?: number;
      timeTo?: number;
      type?: string;
    },
    meta?: ApiRequestMeta,
  ): Promise<unknown[]> {
    try {
      const res = await this.requestWithBudget<{ data?: { items?: unknown[] } }>({
        endpoint: "/defi/ohlcv",
        params: {
          address,
          type: params?.type ?? "15m",
          time_from: params?.timeFrom,
          time_to: params?.timeTo,
          limit: 999,
        },
        estimatedCredits: ENDPOINT_COSTS["/defi/ohlcv"],
        meta,
      });
      return res?.data?.items ?? [];
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message, address }, "getOhlcv failed");
      }
      return [];
    }
  }

  async getTokenTradeHistory(address: string, meta?: ApiRequestMeta): Promise<unknown[]> {
    try {
      const res = await this.requestWithBudget<{ data?: { items?: unknown[] } }>({
        endpoint: "/v3/token/txs",
        params: { address, limit: 100 },
        estimatedCredits: ENDPOINT_COSTS["/v3/token/txs"],
        meta: { ...meta, batchSize: 100 },
      });
      return res?.data?.items ?? [];
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message, address }, "getTokenTradeHistory failed");
      }
      return [];
    }
  }

  async getMultiPrice(addresses: string[], meta?: ApiRequestMeta): Promise<Map<string, MultiPriceResult>> {
    const results = new Map<string, MultiPriceResult>();
    const unique = [...new Set(addresses.filter(Boolean))];
    if (unique.length === 0) return results;

    const misses: string[] = [];
    for (const address of unique) {
      const cached = this.getCached<MultiPriceResult>(`multi-price:${address}`);
      if (cached) {
        results.set(address, cached);
      } else {
        misses.push(address);
      }
    }

    if (misses.length === 0) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/defi/multi_price", { ...meta, batchSize: unique.length });
      return results;
    }

    try {
      const res = await this.requestWithBudget<{ data?: Record<string, unknown> }>({
        endpoint: "/defi/multi_price",
        params: { list_address: misses.join(",") },
        estimatedCredits: estimateBatchCost(misses.length),
        meta: { ...meta, batchSize: misses.length },
      });
      const data = res?.data ?? {};

      for (const [address, info] of Object.entries(data)) {
        const d = info as Record<string, unknown>;
        const entry: MultiPriceResult = {
          value: sanitizeFinite(d.value),
          priceChange24h: sanitizeFinite(d.priceChange24h),
          liquidity: sanitizeFinite(d.liquidity),
          updateUnixTime: sanitizeFinite(d.updateUnixTime),
        };
        results.set(address, entry);
        this.setCache(`multi-price:${address}`, entry);
      }
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.error({ err: (err as Error).message, count: misses.length }, "getMultiPrice failed");
      }
    }

    return results;
  }

  async getCreditsUsage(meta?: ApiRequestMeta): Promise<BirdeyeCreditsUsage | null> {
    const cacheKey = "credits:usage";
    const cached = this.getCached<BirdeyeCreditsUsage>(cacheKey);
    if (cached) {
      this.budgetManager.recordCacheHit("BIRDEYE", "/utils/v1/credits", meta);
      return cached;
    }

    try {
      const res = await this.requestWithBudget<{ data?: Record<string, unknown> }>({
        endpoint: "/utils/v1/credits",
        estimatedCredits: ENDPOINT_COSTS["/utils/v1/credits"],
        meta,
      });
      const data = res?.data;
      if (!data) return null;

      const usage = {
        cycleStart: typeof data.cycle_start === "string" ? new Date(data.cycle_start) : null,
        cycleEnd: typeof data.cycle_end === "string" ? new Date(data.cycle_end) : null,
        used: sanitizeFinite((data.usage as Record<string, unknown> | undefined)?.total, NaN),
        remaining: sanitizeFinite((data.remaining as Record<string, unknown> | undefined)?.total, NaN),
        overage: sanitizeFinite(data.overage_usage, NaN),
        overageCost: sanitizeFinite(data.overage_cost, NaN),
      };

      const normalized: BirdeyeCreditsUsage = {
        cycleStart: usage.cycleStart,
        cycleEnd: usage.cycleEnd,
        used: Number.isFinite(usage.used) ? usage.used : null,
        remaining: Number.isFinite(usage.remaining) ? usage.remaining : null,
        overage: Number.isFinite(usage.overage) ? usage.overage : null,
        overageCost: Number.isFinite(usage.overageCost) ? usage.overageCost : null,
      };
      this.setCache(cacheKey, normalized);
      return normalized;
    } catch (err) {
      if (!(err instanceof QuotaExceededError)) {
        log.warn({ err: (err as Error).message }, "getCreditsUsage failed");
      }
      return null;
    }
  }

  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  getWalletRateLimitUsage() {
    return this.walletRateLimiter.getUsage();
  }
}
