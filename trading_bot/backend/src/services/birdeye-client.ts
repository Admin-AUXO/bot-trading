import type { DiscoveryToken, TokenSecuritySnapshot, TradeDataSnapshot } from "../types/domain.js";
import { recordApiEvent, recordRawApiPayload } from "./provider-telemetry.js";
import { asRecord, asNumber, asString, asBoolean } from "../utils/types.js";
import { ProviderBudgetService } from "./provider-budget-service.js";
import type { ProviderPurpose } from "@prisma/client";

function getByPath(source: Record<string, unknown>, path: string): unknown {
  let current: unknown = source;

  for (const segment of path.split(".")) {
    const record = asRecord(current);
    if (!record || !(segment in record)) {
      return undefined;
    }
    current = record[segment];
  }

  return current;
}

function pickNumber(source: Record<string, unknown>, ...paths: string[]): number | null {
  for (const path of paths) {
    const value = asNumber(getByPath(source, path));
    if (value !== null) return value;
  }
  return null;
}

function pickString(source: Record<string, unknown>, ...paths: string[]): string | null {
  for (const path of paths) {
    const value = asString(getByPath(source, path));
    if (value) return value;
  }
  return null;
}

function pickBoolean(source: Record<string, unknown>, ...paths: string[]): boolean | null {
  for (const path of paths) {
    const value = asBoolean(getByPath(source, path));
    if (value !== null) return value;
  }
  return null;
}

function resolveRecipeParamValue(value: string | number | boolean | null, nowUnix: number) {
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

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch (parseErr) {
    throw new Error(`Birdeye response body parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)} (status=${response.status}, body=${text.slice(0, 200)})`);
  }
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
    graduatedAt: pickNumber(row, "meme_info.graduated_time", "graduatedTime", "graduated_time"),
    creationAt: pickNumber(row, "meme_info.creation_time"),
    recentListingAt: pickNumber(row, "recent_listing_time"),
    lastTradeAt: pickNumber(row, "last_trade_unix_time"),
    decimals: pickNumber(row, "decimals"),
    progressPercent: pickNumber(row, "meme_info.progress_percent", "progressPercent", "progress_percent") ?? 0,
    priceUsd: pickNumber(row, "price", "priceUsd", "price_usd"),
    liquidityUsd: pickNumber(row, "liquidity", "liquidityUsd", "liquidity_usd"),
    marketCapUsd: pickNumber(row, "marketCap", "market_cap", "mc"),
    fdvUsd: pickNumber(row, "fdv"),
    totalSupply: pickNumber(row, "total_supply"),
    circulatingSupply: pickNumber(row, "circulating_supply"),
    holders: pickNumber(row, "holder", "holders"),
    volume1mUsd: pickNumber(row, "volume_1m_usd"),
    volume5mUsd: pickNumber(row, "v5mUSD", "volume5mUSD", "volume_5m_usd"),
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
    priceChange5mPercent: pickNumber(row, "priceChange5mPercent", "price_change_5m_percent"),
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
    volume5mUsd: pickNumber(row, "volume5m", "v5mUSD", "volume_5m_usd"),
    volume30mUsd: pickNumber(row, "volume_30m_usd"),
    volume1hUsd: pickNumber(row, "volume_1h_usd"),
    volume24hUsd: pickNumber(row, "volume_24h_usd"),
    volume1mChangePercent: pickNumber(row, "volume_1m_change_percent"),
    volume5mChangePercent: pickNumber(row, "volume_5m_change_percent"),
    volume30mChangePercent: pickNumber(row, "volume_30m_change_percent"),
    volume1hChangePercent: pickNumber(row, "volume_1h_change_percent"),
    volume24hChangePercent: pickNumber(row, "volume_24h_change_percent"),
    volumeBuy1mUsd: pickNumber(row, "volume_buy_1m_usd"),
    volumeBuy5mUsd: pickNumber(row, "volumeBuy5m", "vBuy5mUSD", "volume_buy_5m_usd"),
    volumeBuy30mUsd: pickNumber(row, "volume_buy_30m_usd"),
    volumeBuy1hUsd: pickNumber(row, "volume_buy_1h_usd"),
    volumeBuy24hUsd: pickNumber(row, "volume_buy_24h_usd"),
    volumeSell1mUsd: pickNumber(row, "volume_sell_1m_usd"),
    volumeSell5mUsd: pickNumber(row, "volumeSell5m", "vSell5mUSD", "volume_sell_5m_usd"),
    volumeSell30mUsd: pickNumber(row, "volume_sell_30m_usd"),
    volumeSell1hUsd: pickNumber(row, "volume_sell_1h_usd"),
    volumeSell24hUsd: pickNumber(row, "volume_sell_24h_usd"),
    uniqueWallets1m: pickNumber(row, "unique_wallet_1m"),
    uniqueWallets5m: pickNumber(row, "uniqueWallet5m", "unique_wallet_5m"),
    uniqueWallets30m: pickNumber(row, "unique_wallet_30m"),
    uniqueWallets1h: pickNumber(row, "unique_wallet_1h"),
    uniqueWallets24h: pickNumber(row, "unique_wallet_24h"),
    trades1m: pickNumber(row, "trade_1m"),
    trades5m: pickNumber(row, "trade5m", "trade_5m"),
    trades30m: pickNumber(row, "trade_30m"),
    trades1h: pickNumber(row, "trade_1h"),
    trades24h: pickNumber(row, "trade_24h"),
    buys1m: pickNumber(row, "buy_1m"),
    buys5m: pickNumber(row, "buy5m", "buy_5m"),
    buys30m: pickNumber(row, "buy_30m"),
    buys1h: pickNumber(row, "buy_1h"),
    buys24h: pickNumber(row, "buy_24h"),
    sells1m: pickNumber(row, "sell_1m"),
    sells5m: pickNumber(row, "sell_5m"),
    sells30m: pickNumber(row, "sell_30m"),
    sells1h: pickNumber(row, "sell_1h"),
    sells24h: pickNumber(row, "sell_24h"),
    priceChange1mPercent: pickNumber(row, "price_change_1m_percent"),
    priceChange5mPercent: pickNumber(row, "priceChange5mPercent", "price_change_5m_percent"),
    priceChange30mPercent: pickNumber(row, "price_change_30m_percent"),
    priceChange1hPercent: pickNumber(row, "price_change_1h_percent"),
    priceChange24hPercent: pickNumber(row, "price_change_24h_percent"),
  };
}

export class BirdeyeClient {
  constructor(
    private readonly apiKey: string,
    private readonly providerBudget: ProviderBudgetService = new ProviderBudgetService(),
  ) {}

  private record(
    endpoint: string,
    units: number,
    success: boolean,
    latencyMs: number,
    metadata?: Record<string, unknown>,
  ) {
    recordApiEvent({
      provider: "BIRDEYE",
      endpoint,
      units,
      success,
      latencyMs,
      metadata,
    });
  }

  private async request<T>(
    endpoint: string,
    units: number,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(endpoint, "https://public-api.birdeye.so");
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const startedAt = Date.now();
    let rawPayloadCaptured = false;
    let apiEventRecorded = false;
    let lastError: Error | null = null;

    const retryDelaysMs = [500, 1000, 2000];
    let attempts = 0;

    while (attempts <= retryDelaysMs.length) {
      const purpose = this.resolvePurpose(endpoint);
      const slot = this.providerBudget.requestSlot("BIRDEYE", purpose, {
        endpoint,
        mint: typeof params?.address === "string" ? params.address : undefined,
      });
      let responseStatus = 599;
      let observedCredits = units;

      try {
        const response = await fetch(url, {
          headers: {
            "X-API-KEY": this.apiKey,
            "x-chain": "solana",
          },
        });

        const latencyMs = Date.now() - startedAt;
        responseStatus = response.status;
        observedCredits = this.parseCreditsUsed(response.headers.get("x-credits-used"));

        if (response.status === 429 && attempts < retryDelaysMs.length) {
          this.providerBudget.releaseSlot(slot.id, {
            endpoint,
            creditsUsed: observedCredits,
            httpStatus: response.status,
            latencyMs,
            errorCode: "HTTP_429",
          });
          attempts++;
          const delayMs = retryDelaysMs[attempts - 1];
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        const payload = await parseResponseBody(response);

        recordRawApiPayload({
          provider: "BIRDEYE",
          endpoint,
          requestMethod: "GET",
          entityKey: typeof params?.address === "string" ? params.address : null,
          success: response.ok,
          statusCode: response.status,
          latencyMs,
          requestParams: params,
          responseBody: payload,
          errorMessage: response.ok ? null : `Birdeye ${endpoint} failed with ${response.status}`,
        });
        rawPayloadCaptured = true;

        if (!response.ok) {
          this.providerBudget.releaseSlot(slot.id, {
            endpoint,
            creditsUsed: observedCredits,
            httpStatus: response.status,
            latencyMs,
            errorCode: `HTTP_${response.status}`,
          });
          this.record(endpoint, units, false, latencyMs, { status: response.status });
          apiEventRecorded = true;
          throw new Error(`Birdeye ${endpoint} failed with ${response.status}`);
        }

        this.providerBudget.releaseSlot(slot.id, {
          endpoint,
          creditsUsed: observedCredits,
          httpStatus: response.status,
          latencyMs,
        });
        this.record(endpoint, units, true, latencyMs);
        apiEventRecorded = true;
        return payload as T;
      } catch (error) {
        this.providerBudget.releaseSlot(slot.id, {
          endpoint,
          creditsUsed: observedCredits,
          httpStatus: responseStatus,
          latencyMs: Date.now() - startedAt,
          errorCode: error instanceof Error ? error.name : "REQUEST_ERROR",
        });
        lastError = error instanceof Error ? error : new Error(String(error));
        break;
      }
    }

    const latencyMs = Date.now() - startedAt;
    if (!rawPayloadCaptured) {
      recordRawApiPayload({
        provider: "BIRDEYE",
        endpoint,
        requestMethod: "GET",
        entityKey: typeof params?.address === "string" ? params.address : null,
        success: false,
        latencyMs,
        requestParams: params,
        errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
      });
    }
    if (!apiEventRecorded) {
      this.record(endpoint, units, false, latencyMs, {
        error: lastError instanceof Error ? lastError.message : String(lastError),
      });
    }
    throw lastError;
  }

  private parseCreditsUsed(value: string | null): number {
    if (!value) return 0;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  private resolvePurpose(endpoint: string): ProviderPurpose {
    if (endpoint === "/defi/v3/token/meme/list") return "DISCOVERY";
    if (endpoint === "/defi/token_security") return "ENRICH";
    return "EVALUATE";
  }

  async getMemeTokens(params: {
    source?: string;
    graduated: boolean;
    limit: number;
    minGraduatedTime?: number;
    minProgressPercent?: number;
    minLiquidityUsd?: number;
    minVolume1mUsd?: number;
    minVolume5mUsd?: number;
    minHolders?: number;
    minLastTradeTime?: number | null;
    minTrades1m?: number;
    minTrades5m?: number;
    sortBy?: string;
    sortType?: "asc" | "desc";
  }): Promise<DiscoveryToken[]> {
    const requestParams: Record<string, string | number | boolean> = {
      sort_by: params.sortBy?.trim().length ? params.sortBy : (params.graduated ? "graduated_time" : "trade_1m_count"),
      sort_type: params.sortType ?? "desc",
      limit: params.limit,
    };
    const activeFilters: Array<[string, string | number | boolean]> = [];
    const source = params.source?.trim();

    if (source && source !== "all") {
      requestParams.source = source;
    }

    activeFilters.push(["graduated", params.graduated]);

    if ((params.minGraduatedTime ?? 0) > 0) {
      activeFilters.push(["min_graduated_time", params.minGraduatedTime ?? 0]);
    }

    if ((params.minProgressPercent ?? 0) > 0) {
      activeFilters.push(["min_progress_percent", params.minProgressPercent ?? 0]);
    }

    if ((params.minLiquidityUsd ?? 0) > 0) {
      activeFilters.push(["min_liquidity", params.minLiquidityUsd ?? 0]);
    }

    if ((params.minTrades1m ?? 0) > 0) {
      activeFilters.push(["min_trade_1m_count", params.minTrades1m ?? 0]);
    }

    if ((params.minTrades5m ?? 0) > 0) {
      activeFilters.push(["min_trade_5m_count", params.minTrades5m ?? 0]);
    }

    if ((params.minLastTradeTime ?? 0) > 0) {
      activeFilters.push(["min_last_trade_unix_time", params.minLastTradeTime ?? 0]);
    }

    if ((params.minVolume5mUsd ?? 0) > 0) {
      activeFilters.push(["min_volume_5m_usd", params.minVolume5mUsd ?? 0]);
    }

    if ((params.minVolume1mUsd ?? 0) > 0) {
      activeFilters.push(["min_volume_1m_usd", params.minVolume1mUsd ?? 0]);
    }

    for (const [key, value] of activeFilters.slice(0, 4)) {
      requestParams[key] = value;
    }

    const response = await this.request<{ data?: { items?: Record<string, unknown>[] } }>(
      "/defi/v3/token/meme/list",
      100,
      requestParams,
    );

    return (response.data?.items ?? [])
      .map(parseDiscoveryToken)
      .filter((token) => (token.holders ?? 0) >= (params.minHolders ?? 0))
      .filter((token) => token.mint.length > 0);
  }

  async getMemeTokensForRecipe(params: {
    recipeParams: Record<string, string | number | boolean | null>;
    source?: string;
    mode: "graduated" | "pregrad";
    limit: number;
  }): Promise<DiscoveryToken[]> {
    const nowUnix = Math.floor(Date.now() / 1000);
    const requestParams: Record<string, string | number | boolean> = {
      sort_by: typeof params.recipeParams.sort_by === "string" && params.recipeParams.sort_by.trim().length > 0
        ? params.recipeParams.sort_by
        : params.mode === "graduated"
          ? "graduated_time"
          : "trade_1m_count",
      sort_type: params.recipeParams.sort_type === "asc" ? "asc" : "desc",
      limit: params.limit,
      graduated: params.mode === "graduated",
    };

    const source = params.source?.trim()
      || (typeof params.recipeParams.source === "string" ? params.recipeParams.source.trim() : "");
    if (source && source !== "all") {
      requestParams.source = source;
    }

    for (const [key, value] of Object.entries(params.recipeParams)) {
      if (key === "sort_by" || key === "sort_type" || key === "source") {
        continue;
      }
      const resolved = resolveRecipeParamValue(value, nowUnix);
      if (resolved === null || resolved === undefined || resolved === "") {
        continue;
      }
      requestParams[key] = resolved;
    }

    const response = await this.request<{ data?: { items?: Record<string, unknown>[] } }>(
      "/defi/v3/token/meme/list",
      100,
      requestParams,
    );

    return (response.data?.items ?? [])
      .map(parseDiscoveryToken)
      .filter((token) => token.mint.length > 0);
  }

  async getMemeTokenDetail(mint: string): Promise<DiscoveryToken | null> {
    const response = await this.request<{ data?: Record<string, unknown> }>(
      "/defi/v3/token/meme/detail/single",
      30,
      { address: mint },
    );

    const row = response.data;
    return row ? parseDiscoveryToken(row) : null;
  }

  async getTokenMetadata(mint: string): Promise<Record<string, unknown> | null> {
    const response = await this.request<{ data?: Record<string, unknown> }>(
      "/defi/v3/token/meta-data/single",
      15,
      { address: mint },
    );

    return asRecord(response.data);
  }

  async getTokenOverview(mint: string): Promise<Record<string, unknown> | null> {
    const response = await this.request<{ data?: Record<string, unknown> }>(
      "/defi/token_overview",
      30,
      { address: mint },
    );

    return asRecord(response.data);
  }

  async getTradeData(mint: string): Promise<TradeDataSnapshot | null> {
    const response = await this.request<{ data?: Record<string, unknown> }>(
      "/defi/v3/token/trade-data/single",
      15,
      { address: mint },
    );

    const row = response.data;
    return row ? parseTradeData(row) : null;
  }

  async getPrice(mint: string): Promise<number | null> {
    const response = await this.request<{ data?: { value?: number } | Record<string, unknown> }>(
      "/defi/price",
      10,
      { address: mint },
    );

    if (!response.data) return null;
    if ("value" in response.data && typeof response.data.value === "number") return response.data.value;
    return pickNumber(response.data, "value", "price", "priceUsd");
  }

  async getMultiPrice(mints: string[]): Promise<Record<string, number | null>> {
    const uniqueMints = [...new Set(mints.filter((mint) => mint.trim().length > 0))];
    if (uniqueMints.length === 0) {
      return {};
    }

    const prices: Record<string, number | null> = {};
    for (let index = 0; index < uniqueMints.length; index += 100) {
      const batch = uniqueMints.slice(index, index + 100);
      const response = await this.request<{ data?: Record<string, unknown> }>(
        "/defi/multi_price",
        Math.ceil((batch.length ** 0.8) * 5),
        {
          list_address: batch.join(","),
          include_liquidity: false,
        },
      );

      for (const mint of batch) {
        const row = response.data?.[mint];
        if (typeof row === "number") {
          prices[mint] = Number.isFinite(row) ? row : null;
          continue;
        }

        const record = asRecord(row);
        prices[mint] = record ? pickNumber(record, "value", "price", "priceUsd") : null;
      }
    }

    return prices;
  }

  async getTokenSecurity(mint: string): Promise<TokenSecuritySnapshot | null> {
    const response = await this.request<{ data?: Record<string, unknown> }>(
      "/defi/token_security",
      50,
      { address: mint },
    );

    const row = response.data;
    if (!row) return null;

    return {
      creatorBalancePercent: pickNumber(row, "creatorPercentage"),
      ownerBalancePercent: pickNumber(row, "ownerPercentage"),
      updateAuthorityBalancePercent: pickNumber(row, "metaplexUpdateAuthorityPercent"),
      top10HolderPercent: pickNumber(row, "top10HolderPercent"),
      top10UserPercent: pickNumber(row, "top10UserPercent"),
      freezeable: pickBoolean(row, "freezeable"),
      mintAuthorityEnabled: pickBoolean(row, "mintAuthority", "mintable"),
      mutableMetadata: pickBoolean(row, "mutableMetadata"),
      transferFeeEnabled: pickBoolean(row, "transferFeeEnable"),
      transferFeePercent: pickNumber(
        row,
        "transferFeeData.transferFeePercent",
        "transferFeeData.transferFee",
        "transferFeePercent",
        "transferFee",
      ),
      trueToken: pickBoolean(row, "isTrueToken"),
      token2022: pickBoolean(row, "isToken2022"),
      nonTransferable: pickBoolean(row, "nonTransferable"),
      honeypot: pickBoolean(row, "isHoneyPot", "honeypot"),
      fakeToken: pickBoolean(row, "isFakeToken", "fakeToken"),
    };
  }
}
