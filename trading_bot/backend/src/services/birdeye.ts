import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import { ApiCallBuffer } from "../utils/api-call-buffer.js";
import { CircuitBreaker } from "../utils/circuit-breaker.js";
import { RateLimiter, backoffWithJitter } from "../utils/rate-limiter.js";
import type { TokenOverview, TokenSecurity, TokenHolder, TradeData, MemeToken, MultiPriceResult } from "../utils/types.js";

const log = createChildLogger("birdeye");

class BirdeyeHttpError extends Error {
  constructor(public status: number, statusText: string) {
    super(`Birdeye HTTP ${status}: ${statusText}`);
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function sanitizeFinite(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

export class BirdeyeService {
  private lastRequestTime = 0;
  private apiBuffer: ApiCallBuffer;
  private circuitBreaker: CircuitBreaker;
  private walletRateLimiter: RateLimiter;
  private readonly tokenCache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly CACHE_TTL = config.api.birdeyeCacheTtlMs;
  private inflight: Map<string, Promise<unknown>> = new Map();

  constructor(apiBuffer?: ApiCallBuffer) {
    this.apiBuffer = apiBuffer ?? new ApiCallBuffer();
    this.circuitBreaker = new CircuitBreaker(
      "birdeye",
      config.circuitBreaker.birdeye.failureThreshold,
      config.circuitBreaker.birdeye.cooldownMs,
      config.circuitBreaker.birdeye.halfOpenMax,
      (err) => !(err instanceof BirdeyeHttpError && err.status === 429),
    );
    this.walletRateLimiter = new RateLimiter("birdeye-wallet", config.api.birdeyeWalletRpmLimit, config.api.birdeyeWalletWindowMs);
  }

  private async request<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
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

  private async throttledRequest<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    const minInterval = 1000 / config.birdeye.rateLimit;
    const now = Date.now();
    const wait = Math.max(0, minInterval - (now - this.lastRequestTime));

    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
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
        await new Promise((r) => setTimeout(r, delay));
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
    return null;
  }

  private setCache(key: string, value: unknown): void {
    this.tokenCache.set(key, { value, expiresAt: Date.now() + this.CACHE_TTL });
  }

  async getTokenOverview(address: string): Promise<TokenOverview | null> {
    const cached = this.getCached<TokenOverview>(`overview:${address}`);
    if (cached) return cached;

    try {
      return this.dedupedFetch(`overview:${address}`, () =>
        this.throttledRequest(() => this.request<{ data?: Record<string, unknown> }>(`/defi/token_overview`, { address })),
      ).then((res) => {
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
        this.setCache(`overview:${address}`, result);
        return result;
      });
    } catch (err) {
      log.error({ err: (err as Error).message, address }, "getTokenOverview failed");
      return null;
    }
  }

  async getTokenSecurity(address: string): Promise<TokenSecurity | null> {
    const cached = this.getCached<TokenSecurity>(`security:${address}`);
    if (cached) return cached;

    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: Record<string, unknown> }>(`/defi/token_security`, { address }),
      );
      const d = res?.data;
      if (!d) return null;

      const result: TokenSecurity = {
        top10HolderPercent: sanitizeFinite(d.top10HolderPercent),
        freezeable: d.freezeable === "true" || d.freezeable === true,
        mintAuthority: d.mintAuthority !== null && d.mintAuthority !== "",
        transferFeeEnable: d.transferFeeEnable === "true" || d.transferFeeEnable === true,
        mutableMetadata: d.mutableMetadata === "true" || d.mutableMetadata === true,
      };
      this.setCache(`security:${address}`, result);
      return result;
    } catch (err) {
      log.error({ err: (err as Error).message, address }, "getTokenSecurity failed");
      return null;
    }
  }

  async getTokenHolders(address: string, limit: number = 10): Promise<TokenHolder[]> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: { items?: unknown[] } }>(`/v3/token/holder`, { address, limit }),
      );
      this.trackCall("v3/token/holder");
      const items = (res?.data?.items ?? []) as Record<string, unknown>[];
      return items.map((h) => ({
        address: String(h.owner ?? ""),
        percent: sanitizeFinite(h.uiAmountPercent),
      }));
    } catch (err) {
      log.warn({ err: (err as Error).message, address }, "getTokenHolders failed");
      return [];
    }
  }

  async getTradeData(address: string): Promise<TradeData | null> {
    const cached = this.getCached<TradeData>(`trade:${address}`);
    if (cached) return cached;

    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: Record<string, unknown> }>(`/v3/token/trade-data/single`, { address }),
      );
      this.trackCall("v3/token/trade-data/single");
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
      this.setCache(`trade:${address}`, result);
      return result;
    } catch (err) {
      log.warn({ err: (err as Error).message, address }, "getTradeData failed");
      return null;
    }
  }

  async getTokenList(params: {
    sortBy: string;
    minVolume5m?: number;
    minLiquidity?: number;
    maxMarketCap?: number;
    minHolder?: number;
    limit?: number;
  }): Promise<TokenOverview[]> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: { items?: unknown[] } }>(`/v3/token/list`, {
          sort_by: params.sortBy,
          sort_type: "desc",
          min_volume_5m_usd: params.minVolume5m,
          min_liquidity: params.minLiquidity,
          max_market_cap: params.maxMarketCap,
          min_holder: params.minHolder,
          limit: params.limit ?? 5,
        }),
      );
      this.trackCall("v3/token/list");
      const items = (res?.data?.items ?? []) as Record<string, unknown>[];
      return items.map((d) => ({
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
    } catch (err) {
      log.error({ err: (err as Error).message }, "getTokenList failed");
      return [];
    }
  }

  async getMemeTokenList(params: {
    graduated?: boolean;
    minProgressPercent?: number;
    minGraduatedTime?: number;
    source?: string;
    limit?: number;
  }): Promise<MemeToken[]> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: { items?: unknown[] } }>(`/v3/token/meme/list`, {
          graduated: params.graduated,
          min_progress_percent: params.minProgressPercent,
          min_graduated_time: params.minGraduatedTime,
          source: params.source,
          limit: params.limit ?? 10,
        }),
      );
      this.trackCall("v3/token/meme/list");
      const items = (res?.data?.items ?? []) as Record<string, unknown>[];
      return items.map((d) => ({
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
    } catch (err) {
      log.error({ err: (err as Error).message }, "getMemeTokenList failed");
      return [];
    }
  }

  async getMemeTokenDetail(address: string): Promise<MemeToken | null> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: Record<string, unknown> }>(`/v3/token/meme/detail/single`, { address }),
      );
      this.trackCall("v3/token/meme/detail/single");
      const d = res?.data;
      if (!d) return null;

      return {
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
    } catch (err) {
      log.warn({ err: (err as Error).message, address }, "getMemeTokenDetail failed");
      return null;
    }
  }

  async getTopTraders(address: string): Promise<unknown[]> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: unknown[] }>(`/v2/tokens/top_traders`, { address }),
      );
      this.trackCall("v2/tokens/top_traders");
      return res?.data ?? [];
    } catch (err) {
      log.warn({ err: (err as Error).message, address }, "getTopTraders failed");
      return [];
    }
  }

  async getTokenTrending(): Promise<unknown[]> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: { items?: unknown[] } }>(`/defi/token_trending`, {
          sort_by: "volume",
          sort_type: "desc",
          offset: 0,
          limit: 10,
        }),
      );
      this.trackCall("token_trending");
      return res?.data?.items ?? [];
    } catch (err) {
      log.warn({ err: (err as Error).message }, "getTokenTrending failed");
      return [];
    }
  }

  async getNewListings(): Promise<unknown[]> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: unknown[] }>(`/v2/tokens/new_listing`, { limit: 20 }),
      );
      this.trackCall("v2/tokens/new_listing");
      return res?.data ?? [];
    } catch (err) {
      log.warn({ err: (err as Error).message }, "getNewListings failed");
      return [];
    }
  }

  async getPairOverview(pairAddress: string): Promise<unknown> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: unknown }>(`/v3/pair/overview/single`, { address: pairAddress }),
      );
      this.trackCall("v3/pair/overview/single");
      return res?.data ?? null;
    } catch (err) {
      log.warn({ err: (err as Error).message, pairAddress }, "getPairOverview failed");
      return null;
    }
  }

  async getOhlcv(address: string, params?: {
    timeFrom?: number;
    timeTo?: number;
    type?: string;
  }): Promise<unknown[]> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: { items?: unknown[] } }>(`/defi/ohlcv`, {
          address,
          type: params?.type ?? "15m",
          time_from: params?.timeFrom,
          time_to: params?.timeTo,
          limit: 999,
        }),
      );
      this.trackCall("ohlcv", 60);
      return res?.data?.items ?? [];
    } catch (err) {
      log.warn({ err: (err as Error).message, address }, "getOhlcv failed");
      return [];
    }
  }

  async getTokenTradeHistory(address: string): Promise<unknown[]> {
    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: { items?: unknown[] } }>(`/v3/token/txs`, { address, limit: 100 }),
      );
      this.trackCall("v3/token/txs", 25);
      return res?.data?.items ?? [];
    } catch (err) {
      log.warn({ err: (err as Error).message, address }, "getTokenTradeHistory failed");
      return [];
    }
  }

  async getMultiPrice(addresses: string[]): Promise<Map<string, MultiPriceResult>> {
    const results = new Map<string, MultiPriceResult>();
    if (addresses.length === 0) return results;

    try {
      const res = await this.throttledRequest(() =>
        this.request<{ data?: Record<string, unknown> }>(`/defi/multi_price`, {
          list_address: addresses.join(","),
        }),
      );
      this.trackCall("multi_price", addresses.length);
      const data = res?.data ?? {};

      for (const [addr, info] of Object.entries(data)) {
        const d = info as Record<string, unknown>;
        results.set(addr, {
          value: (d.value as number) ?? 0,
          priceChange24h: (d.priceChange24h as number) ?? 0,
          liquidity: (d.liquidity as number) ?? 0,
          updateUnixTime: (d.updateUnixTime as number) ?? 0,
        });
      }
    } catch (err) {
      log.error({ err: (err as Error).message, count: addresses.length }, "getMultiPrice failed");
    }

    return results;
  }

  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  getWalletRateLimitUsage() {
    return this.walletRateLimiter.getUsage();
  }

  private trackCall(endpoint: string, credits: number = 1): void {
    this.apiBuffer.log({ service: "BIRDEYE", endpoint, credits });
  }

  private dedupedFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  async flushApiCalls(): Promise<void> {
    await this.apiBuffer.flush();
  }
}
