import { ProviderSource, type Prisma, type WalletFundingSource } from "@prisma/client";
import { db } from "../../db/client.js";
import { SharedTokenFactsService } from "../shared-token-facts.js";
import type { DiscoveryLabTokenInsight } from "../discovery-lab-token-insight-service.js";
import type { TokenSecuritySnapshot } from "../../types/domain.js";
import { toJsonValue } from "../../utils/json.js";
import { asNumber, asRecord, asString, clamp } from "../../utils/types.js";
import { ProviderBudgetService } from "../provider-budget-service.js";
import { BubblemapsClient, type BubblemapsFetchResult } from "./bubblemaps-client.js";
import { DefiLlamaClient, type DefiLlamaFetchResult } from "./defillama-client.js";
import { GeckoTerminalClient, type GeckoTerminalFetchResult } from "./geckoterminal-client.js";
import { JupiterTokenClient, type JupiterTokenFetchResult } from "./jupiter-token-client.js";
import { PumpfunPublicClient, type PumpfunPublicFetchResult } from "./pumpfun-public-client.js";
import { SolsnifferClient, type SolsnifferFetchResult } from "./solsniffer-client.js";

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
  | "bubblemaps"
  | "solsniffer"
  | "pumpfun"
  | "jupiter"
  | "geckoterminal"
  | "defillama";

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
  bubblemaps: EnrichmentSourceState<BubblemapsFetchResult>;
  solsniffer: EnrichmentSourceState<SolsnifferFetchResult>;
  pumpfun: EnrichmentSourceState<PumpfunPublicFetchResult>;
  jupiter: EnrichmentSourceState<JupiterTokenFetchResult>;
  geckoterminal: EnrichmentSourceState<GeckoTerminalFetchResult>;
  defillama: EnrichmentSourceState<DefiLlamaFetchResult>;
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
  bubblemapsClient?: BubblemapsClient;
  solsnifferClient?: SolsnifferClient;
  pumpfunClient?: PumpfunPublicClient;
  jupiterClient?: JupiterTokenClient;
  geckoterminalClient?: GeckoTerminalClient;
  defillamaClient?: DefiLlamaClient;
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
  bubblemaps: 30 * 60_000,
  solsniffer: 15 * 60_000,
  pumpfun: 60 * 60_000,
  jupiter: 60 * 60_000,
  geckoterminal: 5 * 60_000,
  defillama: 15 * 60_000,
};

const FETCH_TIMEOUT_MS = 6_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutId = setTimeout(() => { throw new Error(`Fetch timeout after ${timeoutMs}ms`); }, timeoutMs);
  try {
    return await promise;
  } finally {
    clearTimeout(timeoutId);
  }
}

const EMPTY_FACT_TYPES = {
  bubblemaps: "cluster",
  solsniffer: "security",
  pumpfun: "pump_fun_origin",
  jupiter: "jupiter_token",
  geckoterminal: "pool_list",
  defillama: "defillama_summary",
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
  private readonly bubblemapsClient: BubblemapsClient;
  private readonly solsnifferClient: SolsnifferClient;
  private readonly pumpfunClient: PumpfunPublicClient;
  private readonly jupiterClient: JupiterTokenClient;
  private readonly geckoterminalClient: GeckoTerminalClient;
  private readonly defillamaClient: DefiLlamaClient;
  private readonly now: () => Date;

  constructor(deps: TokenEnrichmentServiceDeps = {}) {
    this.providerBudget = deps.providerBudget ?? new ProviderBudgetService();
    this.sharedFacts = deps.sharedFacts ?? new SharedTokenFactsService();
    this.bubblemapsClient = deps.bubblemapsClient ?? new BubblemapsClient();
    this.solsnifferClient = deps.solsnifferClient ?? new SolsnifferClient();
    this.pumpfunClient = deps.pumpfunClient ?? new PumpfunPublicClient();
    this.jupiterClient = deps.jupiterClient ?? new JupiterTokenClient();
    this.geckoterminalClient = deps.geckoterminalClient ?? new GeckoTerminalClient();
    this.defillamaClient = deps.defillamaClient ?? new DefiLlamaClient();
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
    const pumpfunData = await this.pumpfunClient.fetch(mint);
    const symbol = pumpfunData?.symbol ?? null;
    const creator = pumpfunData?.creator ?? null;
    const graduatedAt = pumpfunData?.graduatedAt ?? null;

    return {
      mint,
      pairAddress: null,
      pairCreatedAt: null,
      symbol,
      name: null,
      source: graduatedAt ? "pump_fun" : null,
      creator,
      platformId: null,
      logoUri: null,
      description: null,
      socials: {
        website: null,
        twitter: null,
        telegram: null,
        discord: null,
      },
      toolLinks: {
        axiom: buildAxiomHref(mint),
        dexscreener: buildDexScreenerHref(mint),
        rugcheck: buildRugcheckHref(mint),
        solscanToken: buildSolscanTokenHref(mint),
        solscanCreator: buildSolscanAccountHref(creator),
      },
      market: {
        priceUsd: null,
        liquidityUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        holders: null,
        lastTradeAt: null,
        uniqueWallet5m: null,
        uniqueWallet1h: null,
        uniqueWallet24h: null,
        trade5m: null,
        trade1h: null,
        trade24h: null,
        buy5m: null,
        sell5m: null,
        volume5mUsd: null,
        volume1hUsd: null,
        volume24hUsd: null,
        priceChange5mPercent: null,
        priceChange30mPercent: null,
        priceChange1hPercent: null,
        priceChange24hPercent: null,
        volume5mChangePercent: null,
        volume1hChangePercent: null,
        volume24hChangePercent: null,
      },
      security: {
        creatorBalancePercent: null,
        ownerBalancePercent: null,
        updateAuthorityBalancePercent: null,
        top10HolderPercent: null,
        top10UserPercent: null,
        freezeable: null,
        mintAuthorityEnabled: null,
        mutableMetadata: null,
        transferFeeEnabled: null,
        transferFeePercent: null,
        trueToken: null,
        token2022: null,
        nonTransferable: null,
        honeypot: null,
        fakeToken: null,
      },
    };
  }

  private async getCachedFactRows(mint: string): Promise<Map<string, EnrichmentFactRow>> {
    const rows = await db.enrichmentFact.findMany({
      where: {
        mint,
        source: {
          in: [
            "BUBBLEMAPS",
            "SOLSNIFFER",
            "PUMPFUN",
            "JUPITER",
            "GECKOTERMINAL",
            "DEFILLAMA",
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

    const [
      bubblemaps,
      solsniffer,
      pumpfun,
      jupiter,
      geckoterminal,
      defillama,
    ] = await Promise.all([
      this.loadProviderState(mint, bubblemapsConfig, cachedRows, now),
      this.loadProviderState(mint, solsnifferConfig, cachedRows, now),
      this.loadProviderState(mint, pumpfunConfig, cachedRows, now),
      this.loadProviderState(mint, jupiterConfig, cachedRows, now),
      this.loadProviderState(mint, geckoterminalConfig, cachedRows, now),
      this.loadProviderState(mint, defillamaConfig, cachedRows, now),
    ]);

    return {
      bubblemaps,
      solsniffer,
      pumpfun,
      jupiter,
      geckoterminal,
      defillama,
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
      const data = await withTimeout(config.fetch(mint), FETCH_TIMEOUT_MS);
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
      { weight: 0.20, value: this.bubblemapsScore(providers.bubblemaps.data) },
      { weight: 0.30, value: this.solsnifferScore(providers.solsniffer.data) },
      { weight: 0.15, value: this.pumpfunScore(providers.pumpfun.data) },
      { weight: 0.10, value: this.jupiterScore(providers.jupiter.data) },
      { weight: 0.15, value: this.geckoterminalScore(providers.geckoterminal.data) },
      { weight: 0.10, value: this.defillamaScore(providers.defillama.data) },
    ];

    const available = components.filter((component) => component.value !== null);
    if (available.length < 3) {
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
