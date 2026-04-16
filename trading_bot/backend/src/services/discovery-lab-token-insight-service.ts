import type { BirdeyeClient } from "./birdeye-client.js";
import type { TokenSecuritySnapshot } from "../types/domain.js";

type ScalarRecord = Record<string, unknown>;

function asRecord(value: unknown): ScalarRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ScalarRecord
    : null;
}

function getByPath(source: ScalarRecord | null, path: string): unknown {
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

function pickString(source: ScalarRecord | null, ...paths: string[]): string | null {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function pickNumber(source: ScalarRecord | null, ...paths: string[]): number | null {
  for (const path of paths) {
    const raw = getByPath(source, path);
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === "string" && raw.trim().length > 0) {
      const value = Number(raw);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return null;
}

function pickBoolean(source: ScalarRecord | null, ...paths: string[]): boolean | null {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function trimToNull(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function withHttps(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function normalizeSocialLink(kind: "website" | "twitter" | "telegram" | "discord", value: string | null): string | null {
  const raw = trimToNull(value);
  if (!raw) {
    return null;
  }

  if (kind === "twitter") {
    if (raw.startsWith("@")) {
      return `https://x.com/${raw.slice(1)}`;
    }
    if (/^(x|twitter)\.com\//i.test(raw)) {
      return withHttps(raw);
    }
  }

  if (kind === "telegram") {
    if (raw.startsWith("@")) {
      return `https://t.me/${raw.slice(1)}`;
    }
    if (/^t\.me\//i.test(raw)) {
      return withHttps(raw);
    }
  }

  if (kind === "discord" && /^discord\.gg\//i.test(raw)) {
    return withHttps(raw);
  }

  if (kind === "website" && !/^https?:\/\//i.test(raw)) {
    return withHttps(raw);
  }

  return withHttps(raw);
}

function readProjectLinks(records: Array<ScalarRecord | null>) {
  const pick = (...paths: string[]) => {
    for (const record of records) {
      const value = pickString(record, ...paths);
      if (value) {
        return value;
      }
    }
    return null;
  };

  return {
    website: normalizeSocialLink("website", pick("extensions.website", "website", "links.website")),
    twitter: normalizeSocialLink("twitter", pick("extensions.twitter", "twitter", "links.twitter", "socials.twitter")),
    telegram: normalizeSocialLink("telegram", pick("extensions.telegram", "telegram", "links.telegram", "socials.telegram")),
    discord: normalizeSocialLink("discord", pick("extensions.discord", "discord", "links.discord", "socials.discord")),
  };
}

function toIsoFromBirdeye(record: ScalarRecord | null): string | null {
  const human = pickString(record, "lastTradeHumanTime");
  if (human) {
    const date = new Date(human);
    return Number.isNaN(date.getTime()) ? human : date.toISOString();
  }

  const unix = pickNumber(record, "lastTradeUnixTime");
  if (unix === null) {
    return null;
  }

  const ms = unix > 1_000_000_000_000 ? unix : unix * 1_000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildAxiomHref(mint: string): string {
  return `https://axiom.trade/meme/${mint}?chain=sol`;
}

function buildDexScreenerHref(mint: string): string {
  return `https://dexscreener.com/solana/${mint}`;
}

function buildRugcheckHref(mint: string): string {
  return `https://rugcheck.xyz/tokens/${mint}`;
}

function buildSolscanTokenHref(mint: string): string {
  return `https://solscan.io/token/${mint}`;
}

function buildSolscanAccountHref(address: string | null): string | null {
  return address ? `https://solscan.io/account/${address}` : null;
}

export type DiscoveryLabTokenInsight = {
  mint: string;
  symbol: string | null;
  name: string | null;
  source: string | null;
  creator: string | null;
  platformId: string | null;
  logoUri: string | null;
  description: string | null;
  socials: {
    website: string | null;
    twitter: string | null;
    telegram: string | null;
    discord: string | null;
  };
  toolLinks: {
    axiom: string;
    dexscreener: string;
    rugcheck: string;
    solscanToken: string;
    solscanCreator: string | null;
  };
  market: {
    priceUsd: number | null;
    liquidityUsd: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    holders: number | null;
    lastTradeAt: string | null;
    uniqueWallet5m: number | null;
    uniqueWallet1h: number | null;
    uniqueWallet24h: number | null;
    trade5m: number | null;
    trade1h: number | null;
    trade24h: number | null;
    buy5m: number | null;
    sell5m: number | null;
    volume5mUsd: number | null;
    volume1hUsd: number | null;
    volume24hUsd: number | null;
    priceChange5mPercent: number | null;
    priceChange30mPercent: number | null;
    priceChange1hPercent: number | null;
    priceChange24hPercent: number | null;
    volume5mChangePercent: number | null;
    volume1hChangePercent: number | null;
    volume24hChangePercent: number | null;
  };
  security: {
    creatorBalancePercent: number | null;
    ownerBalancePercent: number | null;
    updateAuthorityBalancePercent: number | null;
    top10HolderPercent: number | null;
    top10UserPercent: number | null;
    freezeable: boolean | null;
    mintAuthorityEnabled: boolean | null;
    mutableMetadata: boolean | null;
    transferFeeEnabled: boolean | null;
    transferFeePercent: number | null;
    trueToken: boolean | null;
    token2022: boolean | null;
    nonTransferable: boolean | null;
    honeypot: boolean | null;
    fakeToken: boolean | null;
  };
};

function readSecurity(security: TokenSecuritySnapshot | null) {
  return {
    creatorBalancePercent: security?.creatorBalancePercent ?? null,
    ownerBalancePercent: security?.ownerBalancePercent ?? null,
    updateAuthorityBalancePercent: security?.updateAuthorityBalancePercent ?? null,
    top10HolderPercent: security?.top10HolderPercent ?? null,
    top10UserPercent: security?.top10UserPercent ?? null,
    freezeable: security?.freezeable ?? null,
    mintAuthorityEnabled: security?.mintAuthorityEnabled ?? null,
    mutableMetadata: security?.mutableMetadata ?? null,
    transferFeeEnabled: security?.transferFeeEnabled ?? null,
    transferFeePercent: security?.transferFeePercent ?? null,
    trueToken: security?.trueToken ?? null,
    token2022: security?.token2022 ?? null,
    nonTransferable: security?.nonTransferable ?? null,
    honeypot: security?.honeypot ?? null,
    fakeToken: security?.fakeToken ?? null,
  };
}

const TOKEN_INSIGHT_CACHE_TTL_MS = 60_000;
const TOKEN_INSIGHT_CACHE_MAX_SIZE = 256;

export class DiscoveryLabTokenInsightService {
  private readonly cache = new Map<string, { fetchedAt: number; value: DiscoveryLabTokenInsight }>();

  constructor(private readonly birdeye: BirdeyeClient) {}

  async getInsight(mint: string): Promise<DiscoveryLabTokenInsight> {
    const normalizedMint = trimToNull(mint);
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const cached = this.cache.get(normalizedMint);
    if (cached && (Date.now() - cached.fetchedAt) <= TOKEN_INSIGHT_CACHE_TTL_MS) {
      return cached.value;
    }
    if (cached) {
      this.cache.delete(normalizedMint);
    }

    const [detail, overview, metadata, security] = await Promise.all([
      this.birdeye.getMemeTokenDetail(normalizedMint),
      this.birdeye.getTokenOverview(normalizedMint),
      this.birdeye.getTokenMetadata(normalizedMint),
      this.birdeye.getTokenSecurity(normalizedMint),
    ]);

    const projectRecords = [metadata, overview];
    const socials = readProjectLinks(projectRecords);
    const creator = detail?.creator ?? pickString(overview, "creator") ?? null;
    const symbol = trimToNull(detail?.symbol) ?? pickString(metadata, "symbol", "data.symbol") ?? pickString(overview, "symbol") ?? null;
    const name = trimToNull(detail?.name) ?? pickString(metadata, "name", "data.name") ?? pickString(overview, "name") ?? null;
    const source = trimToNull(detail?.source) ?? pickString(overview, "source") ?? null;
    const platformId = trimToNull(detail?.platformId) ?? pickString(overview, "platformId", "platform_id") ?? null;
    const logoUri = pickString(metadata, "logo_uri", "logoURI") ?? pickString(overview, "logo_uri", "logoURI") ?? null;
    const description = pickString(metadata, "extensions.description", "description") ?? pickString(overview, "extensions.description", "description") ?? null;

    const insight: DiscoveryLabTokenInsight = {
      mint: normalizedMint,
      symbol,
      name,
      source,
      creator,
      platformId,
      logoUri,
      description,
      socials,
      toolLinks: {
        axiom: buildAxiomHref(normalizedMint),
        dexscreener: buildDexScreenerHref(normalizedMint),
        rugcheck: buildRugcheckHref(normalizedMint),
        solscanToken: buildSolscanTokenHref(normalizedMint),
        solscanCreator: buildSolscanAccountHref(creator),
      },
      market: {
        priceUsd: detail?.priceUsd ?? pickNumber(overview, "price"),
        liquidityUsd: detail?.liquidityUsd ?? pickNumber(overview, "liquidity"),
        marketCapUsd: detail?.marketCapUsd ?? pickNumber(overview, "marketCap", "market_cap"),
        fdvUsd: detail?.fdvUsd ?? pickNumber(overview, "fdv"),
        holders: detail?.holders ?? pickNumber(overview, "holder", "holders"),
        lastTradeAt: toIsoFromBirdeye(overview),
        uniqueWallet5m: pickNumber(overview, "uniqueWallet5m", "unique_wallet_5m"),
        uniqueWallet1h: pickNumber(overview, "uniqueWallet1h", "unique_wallet_1h"),
        uniqueWallet24h: pickNumber(overview, "uniqueWallet24h", "unique_wallet_24h"),
        trade5m: pickNumber(overview, "trade5m", "trade_5m"),
        trade1h: pickNumber(overview, "trade1h", "trade_1h"),
        trade24h: pickNumber(overview, "trade24h", "trade_24h"),
        buy5m: pickNumber(overview, "buy5m", "buy_5m"),
        sell5m: pickNumber(overview, "sell5m", "sell_5m"),
        volume5mUsd: pickNumber(overview, "v5mUSD", "volume_5m_usd"),
        volume1hUsd: pickNumber(overview, "v1hUSD", "volume_1h_usd"),
        volume24hUsd: pickNumber(overview, "v24hUSD", "volume_24h_usd"),
        priceChange5mPercent: pickNumber(overview, "priceChange5mPercent", "price_change_5m_percent"),
        priceChange30mPercent: pickNumber(overview, "priceChange30mPercent", "price_change_30m_percent"),
        priceChange1hPercent: pickNumber(overview, "priceChange1hPercent", "price_change_1h_percent"),
        priceChange24hPercent: pickNumber(overview, "priceChange24hPercent", "price_change_24h_percent"),
        volume5mChangePercent: pickNumber(overview, "v5mChangePercent", "volume_5m_change_percent"),
        volume1hChangePercent: pickNumber(overview, "v1hChangePercent", "volume_1h_change_percent"),
        volume24hChangePercent: pickNumber(overview, "v24hChangePercent", "volume_24h_change_percent"),
      },
      security: readSecurity(security),
    };

    this.cache.set(normalizedMint, {
      fetchedAt: Date.now(),
      value: insight,
    });
    this.pruneCache();

    return insight;
  }

  private pruneCache() {
    if (this.cache.size <= TOKEN_INSIGHT_CACHE_MAX_SIZE) {
      return;
    }

    const oldest = [...this.cache.entries()]
      .sort((left, right) => left[1].fetchedAt - right[1].fetchedAt)
      .slice(0, this.cache.size - TOKEN_INSIGHT_CACHE_MAX_SIZE);
    for (const [mint] of oldest) {
      this.cache.delete(mint);
    }
  }
}
