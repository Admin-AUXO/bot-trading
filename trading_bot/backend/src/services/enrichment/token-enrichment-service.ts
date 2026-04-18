import { ProviderSource, type Prisma, type WalletFundingSource } from "@prisma/client";
import type { BirdeyeClient } from "../birdeye-client.js";
import { db } from "../../db/client.js";
import { SharedTokenFactsService } from "../shared-token-facts.js";
import type { DiscoveryLabTokenInsight } from "../discovery-lab-token-insight-service.js";
import type { TokenSecuritySnapshot } from "../../types/domain.js";
import { toJsonValue } from "../../utils/json.js";
import { asNumber, asRecord, asString, clamp } from "../../utils/types.js";
import { ProviderBudgetService } from "../provider-budget-service.js";
import { BubblemapsClient, type BubblemapsFetchResult } from "./bubblemaps-client.js";
import { CieloClient, type CieloFetchResult } from "./cielo-client.js";
import { DefiLlamaClient, type DefiLlamaFetchResult } from "./defillama-client.js";
import { GeckoTerminalClient, type GeckoTerminalFetchResult } from "./geckoterminal-client.js";
import { JupiterTokenClient, type JupiterTokenFetchResult } from "./jupiter-token-client.js";
import { PumpfunPublicClient, type PumpfunPublicFetchResult } from "./pumpfun-public-client.js";
import { SolsnifferClient, type SolsnifferFetchResult } from "./solsniffer-client.js";
import { TrenchClient, type TrenchFetchResult } from "./trench-client.js";

type ScalarRecord = Record<string, unknown>;

type EnrichmentFactRow = Prisma.EnrichmentFactGetPayload<{
  select: {
    source: true;
    factType: true;
    payload: true;
    fetchedAt: true;
    expiresAt: true;
  };
}>;

type EnrichmentSourceKey =
  | "trench"
  | "bubblemaps"
  | "solsniffer"
  | "pumpfun"
  | "jupiter"
  | "geckoterminal"
  | "defillama"
  | "cielo";

type SourceStatus = "fresh" | "stale" | "empty" | "error";

export type EnrichmentSourceState<T> = {
  source: ProviderSource;
  factType: string;
  status: SourceStatus;
  fetchedAt: string | null;
  expiresAt: string | null;
  staleMinutes: number | null;
  data: T | null;
  error: string | null;
};

export type CreatorLineageSummary = {
  creatorAddress: string;
  tokenCount24h: number | null;
  rugRate: number | null;
  fundingSource: WalletFundingSource | null;
  lastSampledAt: string | null;
};

export type TokenEnrichmentProviders = {
  trench: EnrichmentSourceState<TrenchFetchResult>;
  bubblemaps: EnrichmentSourceState<BubblemapsFetchResult>;
  solsniffer: EnrichmentSourceState<SolsnifferFetchResult>;
  pumpfun: EnrichmentSourceState<PumpfunPublicFetchResult>;
  jupiter: EnrichmentSourceState<JupiterTokenFetchResult>;
  geckoterminal: EnrichmentSourceState<GeckoTerminalFetchResult>;
  defillama: EnrichmentSourceState<DefiLlamaFetchResult>;
  cielo: EnrichmentSourceState<CieloFetchResult>;
};

export type EnrichmentBundle = DiscoveryLabTokenInsight & {
  compositeScore: number | null;
  compositeSourceCount: number;
  creatorLineage: CreatorLineageSummary | null;
  providers: TokenEnrichmentProviders;
};

export type TokenEnrichmentPayload = EnrichmentBundle;

type TokenEnrichmentServiceDeps = {
  providerBudget?: ProviderBudgetService;
  sharedFacts?: SharedTokenFactsService;
  trenchClient?: TrenchClient;
  bubblemapsClient?: BubblemapsClient;
  solsnifferClient?: SolsnifferClient;
  pumpfunClient?: PumpfunPublicClient;
  jupiterClient?: JupiterTokenClient;
  geckoterminalClient?: GeckoTerminalClient;
  defillamaClient?: DefiLlamaClient;
  cieloClient?: CieloClient;
  now?: () => Date;
};

type SourceConfig<T> = {
  key: EnrichmentSourceKey;
  provider: ProviderSource;
  factType: string;
  ttlMs: number;
  endpoint: string;
  fetch: (mint: string) => Promise<T | null>;
  onSuccess?: (mint: string, data: T, now: Date) => Promise<void>;
};

type CachedSourceState<T> = {
  data: T | null;
  fetchedAt: Date;
  expiresAt: Date;
  staleMinutes: number;
};

const SOURCE_TTLS_MS: Record<EnrichmentSourceKey, number> = {
  trench: 10 * 60_000,
  bubblemaps: 30 * 60_000,
  solsniffer: 15 * 60_000,
  pumpfun: 60_000,
  jupiter: 60 * 60_000,
  geckoterminal: 5 * 60_000,
  defillama: 15 * 60_000,
  cielo: 2 * 60_000,
};

const EMPTY_FACT_TYPES = {
  trench: "bundle",
  bubblemaps: "cluster",
  solsniffer: "security",
  pumpfun: "pump_fun_origin",
  jupiter: "jupiter_token",
  geckoterminal: "pool_list",
  defillama: "defillama_summary",
  cielo: "smart_money",
} as const;

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

function trimToNull(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function withHttps(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function normalizeSocialLink(kind: "website" | "twitter" | "telegram" | "discord", value: string | null): string | null {
  const raw = trimToNull(value);
  if (!raw) return null;
  if (kind === "twitter") {
    if (raw.startsWith("@")) return `https://x.com/${raw.slice(1)}`;
    if (/^(x|twitter)\.com\//i.test(raw)) return withHttps(raw);
  }
  if (kind === "telegram") {
    if (raw.startsWith("@")) return `https://t.me/${raw.slice(1)}`;
    if (/^t\.me\//i.test(raw)) return withHttps(raw);
  }
  if (kind === "discord" && /^discord\.gg\//i.test(raw)) return withHttps(raw);
  if (kind === "website" && !/^https?:\/\//i.test(raw)) return withHttps(raw);
  return withHttps(raw);
}

function readProjectLinks(records: Array<ScalarRecord | null>) {
  const pick = (...paths: string[]) => {
    for (const record of records) {
      const value = pickString(record, ...paths);
      if (value) return value;
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
  if (unix === null) return null;
  const ms = unix > 1_000_000_000_000 ? unix : unix * 1_000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildAxiomHref(target: string): string {
  return `https://axiom.trade/meme/${target}?chain=sol`;
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

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function createEmptySourceState<T>(source: ProviderSource, factType: string): EnrichmentSourceState<T> {
  return {
    source,
    factType,
    status: "empty",
    fetchedAt: null,
    expiresAt: null,
    staleMinutes: null,
    data: null,
    error: null,
  };
}

export class TokenEnrichmentService {
  private readonly providerBudget: ProviderBudgetService;
  private readonly sharedFacts: SharedTokenFactsService;
  private readonly trenchClient: TrenchClient;
  private readonly bubblemapsClient: BubblemapsClient;
  private readonly solsnifferClient: SolsnifferClient;
  private readonly pumpfunClient: PumpfunPublicClient;
  private readonly jupiterClient: JupiterTokenClient;
  private readonly geckoterminalClient: GeckoTerminalClient;
  private readonly defillamaClient: DefiLlamaClient;
  private readonly cieloClient: CieloClient;
  private readonly now: () => Date;

  constructor(
    private readonly birdeye: BirdeyeClient,
    deps: TokenEnrichmentServiceDeps = {},
  ) {
    this.providerBudget = deps.providerBudget ?? new ProviderBudgetService();
    this.sharedFacts = deps.sharedFacts ?? new SharedTokenFactsService();
    this.trenchClient = deps.trenchClient ?? new TrenchClient();
    this.bubblemapsClient = deps.bubblemapsClient ?? new BubblemapsClient();
    this.solsnifferClient = deps.solsnifferClient ?? new SolsnifferClient();
    this.pumpfunClient = deps.pumpfunClient ?? new PumpfunPublicClient();
    this.jupiterClient = deps.jupiterClient ?? new JupiterTokenClient();
    this.geckoterminalClient = deps.geckoterminalClient ?? new GeckoTerminalClient();
    this.defillamaClient = deps.defillamaClient ?? new DefiLlamaClient();
    this.cieloClient = deps.cieloClient ?? new CieloClient();
    this.now = deps.now ?? (() => new Date());
  }

  async getEnrichment(mint: string): Promise<TokenEnrichmentPayload> {
    const normalizedMint = trimToNull(mint);
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const now = this.now();
    const [baseInsight, cachedRows] = await Promise.all([
      this.buildBaseInsight(normalizedMint),
      this.getCachedFactRows(normalizedMint),
    ]);

    const providers = await this.loadProviderStates(normalizedMint, cachedRows, now);
    const creatorLineage = await this.getCreatorLineage(baseInsight.creator);
    const { compositeScore, compositeSourceCount } = this.computeCompositeScore(providers);

    return {
      ...baseInsight,
      compositeScore,
      compositeSourceCount,
      creatorLineage,
      providers,
    };
  }

  async getInsight(mint: string): Promise<TokenEnrichmentPayload> {
    return this.getEnrichment(mint);
  }

  private async buildBaseInsight(mint: string): Promise<DiscoveryLabTokenInsight> {
    const cachedFacts = await this.sharedFacts.getFreshFacts(mint);
    const cachedMarketStats = asRecord(cachedFacts.marketStats);
    const cachedDexPair = asRecord(cachedMarketStats?.dexPair);
    const pairAddress = pickString(cachedDexPair, "pairAddress");
    const pairCreatedAt = pickString(cachedDexPair, "pairCreatedAt");
    const [detail, overview, metadata, security] = await Promise.all([
      this.birdeye.getMemeTokenDetail(mint),
      cachedFacts.overview
        ? Promise.resolve(cachedFacts.overview)
        : this.birdeye.getTokenOverview(mint).then(async (value) => {
          await this.sharedFacts.rememberOverview(mint, value as Record<string, unknown> | null);
          return value;
        }),
      cachedFacts.metadata
        ? Promise.resolve(cachedFacts.metadata)
        : this.birdeye.getTokenMetadata(mint).then(async (value) => {
          await this.sharedFacts.rememberMetadata(mint, value as Record<string, unknown> | null);
          return value;
        }),
      cachedFacts.security
        ? Promise.resolve(cachedFacts.security)
        : this.birdeye.getTokenSecurity(mint).then(async (value) => {
          await this.sharedFacts.rememberSecurity(mint, value);
          return value;
        }),
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

    return {
      mint,
      pairAddress,
      pairCreatedAt,
      symbol,
      name,
      source,
      creator,
      platformId,
      logoUri,
      description,
      socials,
      toolLinks: {
        axiom: buildAxiomHref(pairAddress ?? mint),
        dexscreener: buildDexScreenerHref(mint),
        rugcheck: buildRugcheckHref(mint),
        solscanToken: buildSolscanTokenHref(mint),
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
  }

  private async getCachedFactRows(mint: string): Promise<Map<string, EnrichmentFactRow>> {
    const rows = await db.enrichmentFact.findMany({
      where: {
        mint,
        source: {
          in: [
            "TRENCH",
            "BUBBLEMAPS",
            "SOLSNIFFER",
            "PUMPFUN",
            "JUPITER",
            "GECKOTERMINAL",
            "DEFILLAMA",
            "CIELO",
          ],
        },
      },
      select: {
        source: true,
        factType: true,
        payload: true,
        fetchedAt: true,
        expiresAt: true,
      },
    });

    return new Map(rows.map((row) => [`${row.source}:${row.factType}`, row]));
  }

  private async loadProviderStates(
    mint: string,
    cachedRows: Map<string, EnrichmentFactRow>,
    now: Date,
  ): Promise<TokenEnrichmentProviders> {
    const trenchConfig: SourceConfig<TrenchFetchResult> = {
      key: "trench",
      provider: "TRENCH",
      factType: EMPTY_FACT_TYPES.trench,
      ttlMs: SOURCE_TTLS_MS.trench,
      endpoint: "bundle_advanced",
      fetch: (targetMint) => this.trenchClient.fetch(targetMint),
      onSuccess: (targetMint, data, currentTime) => this.persistBundleStats(targetMint, data, currentTime),
    };
    const bubblemapsConfig: SourceConfig<BubblemapsFetchResult> = {
      key: "bubblemaps",
      provider: "BUBBLEMAPS",
      factType: EMPTY_FACT_TYPES.bubblemaps,
      ttlMs: SOURCE_TTLS_MS.bubblemaps,
      endpoint: "map-data",
      fetch: (targetMint) => this.bubblemapsClient.fetch(targetMint),
    };
    const solsnifferConfig: SourceConfig<SolsnifferFetchResult> = {
      key: "solsniffer",
      provider: "SOLSNIFFER",
      factType: EMPTY_FACT_TYPES.solsniffer,
      ttlMs: SOURCE_TTLS_MS.solsniffer,
      endpoint: "token_security",
      fetch: (targetMint) => this.solsnifferClient.fetch(targetMint),
    };
    const pumpfunConfig: SourceConfig<PumpfunPublicFetchResult> = {
      key: "pumpfun",
      provider: "PUMPFUN",
      factType: EMPTY_FACT_TYPES.pumpfun,
      ttlMs: SOURCE_TTLS_MS.pumpfun,
      endpoint: "coins",
      fetch: (targetMint) => this.pumpfunClient.fetch(targetMint),
    };
    const jupiterConfig: SourceConfig<JupiterTokenFetchResult> = {
      key: "jupiter",
      provider: "JUPITER",
      factType: EMPTY_FACT_TYPES.jupiter,
      ttlMs: SOURCE_TTLS_MS.jupiter,
      endpoint: "token",
      fetch: (targetMint) => this.jupiterClient.fetch(targetMint),
    };
    const geckoterminalConfig: SourceConfig<GeckoTerminalFetchResult> = {
      key: "geckoterminal",
      provider: "GECKOTERMINAL",
      factType: EMPTY_FACT_TYPES.geckoterminal,
      ttlMs: SOURCE_TTLS_MS.geckoterminal,
      endpoint: "pools",
      fetch: (targetMint) => this.geckoterminalClient.fetch(targetMint),
    };
    const defillamaConfig: SourceConfig<DefiLlamaFetchResult> = {
      key: "defillama",
      provider: "DEFILLAMA",
      factType: EMPTY_FACT_TYPES.defillama,
      ttlMs: SOURCE_TTLS_MS.defillama,
      endpoint: "summary_dexs",
      fetch: (targetMint) => this.defillamaClient.fetch(targetMint),
    };
    const cieloConfig: SourceConfig<CieloFetchResult> = {
      key: "cielo",
      provider: "CIELO",
      factType: EMPTY_FACT_TYPES.cielo,
      ttlMs: SOURCE_TTLS_MS.cielo,
      endpoint: "feed",
      fetch: (targetMint) => this.cieloClient.fetch(targetMint),
    };

    const [
      trench,
      bubblemaps,
      solsniffer,
      pumpfun,
      jupiter,
      geckoterminal,
      defillama,
      cielo,
    ] = await Promise.all([
      this.loadProviderState(mint, trenchConfig, cachedRows, now),
      this.loadProviderState(mint, bubblemapsConfig, cachedRows, now),
      this.loadProviderState(mint, solsnifferConfig, cachedRows, now),
      this.loadProviderState(mint, pumpfunConfig, cachedRows, now),
      this.loadProviderState(mint, jupiterConfig, cachedRows, now),
      this.loadProviderState(mint, geckoterminalConfig, cachedRows, now),
      this.loadProviderState(mint, defillamaConfig, cachedRows, now),
      this.loadProviderState(mint, cieloConfig, cachedRows, now),
    ]);

    return {
      trench,
      bubblemaps,
      solsniffer,
      pumpfun,
      jupiter,
      geckoterminal,
      defillama,
      cielo,
    };
  }

  private async loadProviderState<T>(
    mint: string,
    config: SourceConfig<T>,
    cachedRows: Map<string, EnrichmentFactRow>,
    now: Date,
  ): Promise<EnrichmentSourceState<T>> {
    const cached = this.readCachedState<T>(cachedRows.get(`${config.provider}:${config.factType}`), now);
    if (cached && cached.expiresAt.getTime() > now.getTime()) {
      return {
        source: config.provider,
        factType: config.factType,
        status: "fresh",
        fetchedAt: toIsoString(cached.fetchedAt),
        expiresAt: toIsoString(cached.expiresAt),
        staleMinutes: 0,
        data: cached.data,
        error: null,
      };
    }

    const slot = this.providerBudget.requestSlot(config.provider, "ENRICH", {
      endpoint: config.endpoint,
      mint,
    });
    const startedAt = Date.now();

    try {
      const data = await config.fetch(mint);
      this.providerBudget.releaseSlot(slot.id, {
        endpoint: config.endpoint,
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
      });

      if (data === null) {
        return this.buildFallbackState(config.provider, config.factType, cached, "Provider returned no enrichment payload");
      }

      await this.persistFact(mint, config.provider, config.factType, data, config.ttlMs, now);
      if (config.onSuccess) {
        await config.onSuccess(mint, data, now);
      }

      return {
        source: config.provider,
        factType: config.factType,
        status: "fresh",
        fetchedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + config.ttlMs).toISOString(),
        staleMinutes: 0,
        data,
        error: null,
      };
    } catch (error) {
      this.providerBudget.releaseSlot(slot.id, {
        endpoint: config.endpoint,
        httpStatus: 500,
        latencyMs: Date.now() - startedAt,
        errorCode: error instanceof Error ? error.name : "ENRICHMENT_ERROR",
      });
      return this.buildFallbackState(
        config.provider,
        config.factType,
        cached,
        error instanceof Error ? error.message : "Provider request failed",
      );
    }
  }

  private readCachedState<T>(row: EnrichmentFactRow | undefined, now: Date): CachedSourceState<T> | null {
    if (!row) {
      return null;
    }
    const staleMinutes = Math.max(0, Math.round((now.getTime() - row.expiresAt.getTime()) / 60_000));
    return {
      data: row.payload as T,
      fetchedAt: row.fetchedAt,
      expiresAt: row.expiresAt,
      staleMinutes,
    };
  }

  private buildFallbackState<T>(
    source: ProviderSource,
    factType: string,
    cached: CachedSourceState<T> | null,
    error: string,
  ): EnrichmentSourceState<T> {
    if (cached) {
      return {
        source,
        factType,
        status: "stale",
        fetchedAt: cached.fetchedAt.toISOString(),
        expiresAt: cached.expiresAt.toISOString(),
        staleMinutes: cached.staleMinutes,
        data: cached.data,
        error,
      };
    }

    return {
      source,
      factType,
      status: "error",
      fetchedAt: null,
      expiresAt: null,
      staleMinutes: null,
      data: null,
      error,
    };
  }

  private async persistFact(
    mint: string,
    source: ProviderSource,
    factType: string,
    payload: unknown,
    ttlMs: number,
    now: Date,
  ): Promise<void> {
    await db.enrichmentFact.upsert({
      where: {
        mint_source_factType: {
          mint,
          source,
          factType,
        },
      },
      update: {
        payload: toJsonValue(payload),
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + ttlMs),
      },
      create: {
        mint,
        source,
        factType,
        payload: toJsonValue(payload),
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + ttlMs),
      },
    });
  }

  private async persistBundleStats(mint: string, data: TrenchFetchResult, now: Date): Promise<void> {
    await db.bundleStats.upsert({
      where: { mint },
      update: {
        bundleCount: data.bundles.length,
        bundleSupplyPct: data.bundleSupplyPct,
        devBundle: data.devBundle,
        sniperCount: data.sniperCount,
        source: "TRENCH",
        checkedAt: now,
        expiresAt: new Date(now.getTime() + SOURCE_TTLS_MS.trench),
      },
      create: {
        mint,
        bundleCount: data.bundles.length,
        bundleSupplyPct: data.bundleSupplyPct,
        devBundle: data.devBundle,
        sniperCount: data.sniperCount,
        source: "TRENCH",
        checkedAt: now,
        expiresAt: new Date(now.getTime() + SOURCE_TTLS_MS.trench),
      },
    });
  }

  private async getCreatorLineage(creatorAddress: string | null): Promise<CreatorLineageSummary | null> {
    if (!creatorAddress) {
      return null;
    }

    const row = await db.creatorLineage.findUnique({
      where: { creatorAddress },
      select: {
        creatorAddress: true,
        tokenCount24h: true,
        rugRate: true,
        fundingSource: true,
        lastSampledAt: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      creatorAddress: row.creatorAddress,
      tokenCount24h: row.tokenCount24h,
      rugRate: row.rugRate,
      fundingSource: row.fundingSource,
      lastSampledAt: row.lastSampledAt.toISOString(),
    };
  }

  private computeCompositeScore(providers: TokenEnrichmentProviders): {
    compositeScore: number | null;
    compositeSourceCount: number;
  } {
    const components: Array<{ weight: number; value: number | null }> = [
      { weight: 0.25, value: this.trenchScore(providers.trench.data) },
      { weight: 0.15, value: this.bubblemapsScore(providers.bubblemaps.data) },
      { weight: 0.20, value: this.solsnifferScore(providers.solsniffer.data) },
      { weight: 0.15, value: this.cieloScore(providers.cielo.data) },
      { weight: 0.05, value: this.jupiterScore(providers.jupiter.data) },
      { weight: 0.05, value: this.pumpfunScore(providers.pumpfun.data) },
      { weight: 0.10, value: this.geckoterminalScore(providers.geckoterminal.data) },
      { weight: 0.05, value: this.defillamaScore(providers.defillama.data) },
    ];

    const available = components.filter((component) => component.value !== null);
    if (available.length < 4) {
      return {
        compositeScore: null,
        compositeSourceCount: available.length,
      };
    }

    const totalWeight = available.reduce((sum, component) => sum + component.weight, 0);
    const weightedScore = available.reduce((sum, component) => {
      return sum + (component.weight * (component.value ?? 0));
    }, 0);

    return {
      compositeScore: totalWeight > 0 ? clamp(weightedScore / totalWeight, 0, 1) : null,
      compositeSourceCount: available.length,
    };
  }

  private trenchScore(data: TrenchFetchResult | null): number | null {
    if (!data || data.bundleSupplyPct === null) {
      return null;
    }
    return clamp(1 - Math.min(data.bundleSupplyPct / 0.25, 1), 0, 1);
  }

  private bubblemapsScore(data: BubblemapsFetchResult | null): number | null {
    if (!data || data.topClusterPct === null) {
      return null;
    }
    return clamp(1 - Math.min(data.topClusterPct / 0.2, 1), 0, 1);
  }

  private solsnifferScore(data: SolsnifferFetchResult | null): number | null {
    if (!data || data.score === null) {
      return null;
    }
    return clamp(data.score / 100, 0, 1);
  }

  private cieloScore(data: CieloFetchResult | null): number | null {
    if (!data || data.netFlowUsd24h === null) {
      return null;
    }
    if (data.netFlowUsd24h > 0) {
      return 1;
    }
    if (data.netFlowUsd24h < 0) {
      return 0;
    }
    return 0.5;
  }

  private jupiterScore(data: JupiterTokenFetchResult | null): number | null {
    if (!data) {
      return null;
    }
    return data.strict || data.verified ? 1 : 0;
  }

  private pumpfunScore(data: PumpfunPublicFetchResult | null): number | null {
    if (!data) {
      return null;
    }
    return data.graduatedAt ? 1 : 0;
  }

  private geckoterminalScore(data: GeckoTerminalFetchResult | null): number | null {
    if (!data || data.pools.length === 0) {
      return null;
    }
    const liquidities = data.pools
      .map((pool) => pool.liquidityUsd)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    if (liquidities.length === 0) {
      return null;
    }
    const totalLiquidity = liquidities.reduce((sum, value) => sum + value, 0);
    const topLiquidity = Math.max(...liquidities);
    const share = totalLiquidity > 0 ? topLiquidity / totalLiquidity : 0;
    return topLiquidity >= 25_000 && share >= 0.6 ? 1 : 0;
  }

  private defillamaScore(data: DefiLlamaFetchResult | null): number | null {
    if (!data) {
      return null;
    }
    if ((data.tvlUsd ?? 0) > 0 || data.protocols.length > 0) {
      return 1;
    }
    return 0;
  }
}
