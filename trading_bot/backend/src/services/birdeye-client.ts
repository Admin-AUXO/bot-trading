import type { DiscoveryToken, TokenSecuritySnapshot, TradeDataSnapshot } from "../types/domain.js";
import { recordApiEvent, recordRawApiPayload } from "./provider-telemetry.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

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

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
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
  constructor(private readonly apiKey: string) {}

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

    try {
      const response = await fetch(url, {
        headers: {
          "X-API-KEY": this.apiKey,
          "x-chain": "solana",
        },
      });

      const latencyMs = Date.now() - startedAt;
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
        this.record(endpoint, units, false, latencyMs, { status: response.status });
        throw new Error(`Birdeye ${endpoint} failed with ${response.status}`);
      }

      this.record(endpoint, units, true, latencyMs);
      return payload as T;
    } catch (error) {
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
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      this.record(endpoint, units, false, latencyMs, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getGraduatedMemeTokens(params: {
    minGraduatedTime: number;
    limit: number;
    minLiquidityUsd: number;
    minVolume5mUsd: number;
    minHolders: number;
  }): Promise<DiscoveryToken[]> {
    const response = await this.request<{ data?: { items?: Record<string, unknown>[] } }>(
      "/defi/v3/token/meme/list",
      100,
      {
        source: "pump_dot_fun",
        sort_by: "graduated_time",
        sort_type: "desc",
        graduated: true,
        min_graduated_time: params.minGraduatedTime,
        min_liquidity: params.minLiquidityUsd,
        min_volume_5m_usd: params.minVolume5mUsd,
        min_holder: params.minHolders,
        limit: params.limit,
      },
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
