import { db } from "../../db/client.js";
import type { BotSettings, DiscoveryToken } from "../../types/domain.js";
import { logger } from "../../utils/logger.js";
import type { BirdeyeClient } from "../birdeye-client.js";
import { DexScreenerClient, type DexScreenerTokenPair } from "../dexscreener-client.js";
import {
  RugcheckClient,
  type RugcheckListedToken,
  type RugcheckTokenSummary,
} from "../rugcheck-client.js";
import { SharedTokenFactsService } from "../shared-token-facts.js";
import type {
  DiscoveryLabDataSource,
  DiscoveryLabMarketFocusToken,
  DiscoveryLabMarketStatsPayload,
  DiscoveryLabMarketTokenRow,
  DiscoveryLabSnapshotMeta,
} from "../discovery-lab-market-stats-service.js";
import type { TokenEnrichmentService } from "../enrichment/token-enrichment-service.js";

type ListedSeed = {
  mint: string;
  symbol: string | null;
  name: string | null;
  source: string | null;
  graduationAgeMinutes: number | null;
  primarySignal: "birdeye_recent" | "birdeye_momentum" | "rugcheck_recent" | "rugcheck_verified";
};

type MarketIntelDeps = {
  birdeye: BirdeyeClient;
  enrichment: TokenEnrichmentService;
  getSettings: () => Promise<BotSettings>;
};

type MarketStatsBoardSnapshot = Omit<DiscoveryLabMarketStatsPayload, "focusToken" | "meta">;

type MarketStatsBoardCache = {
  payload: MarketStatsBoardSnapshot;
  lastRefreshedAt: string;
  cacheState: "ready" | "degraded";
  warnings: string[];
};

type MarketStatsFocusCache = {
  payload: DiscoveryLabMarketFocusToken;
  refreshedAt: string;
};

export type MarketTokenStatsPayload = {
  mint: string;
  price24h: number | null;
  mc: number | null;
  liq: number | null;
  buyers5m: number | null;
  sellCount5m: number | null;
  rugScore: number | null;
  ageMinutes: number | null;
};

export type SmartWalletActivityPayload = {
  id: string;
  mint: string;
  walletAddress: string;
  walletLabel: string | null;
  side: "BUY" | "SELL";
  amountUsd: number;
  txSignature: string;
  receivedAt: string;
};

const DEFAULT_LIMIT = 18;
const RECENT_WINDOW_SECONDS = 4 * 60 * 60;
const MARKET_STATS_SOURCES: DiscoveryLabDataSource[] = [
  { key: "birdeye", label: "Birdeye", tier: "paid", detail: "Seed discovery rows and focus-token insight. Only refreshed on explicit operator action." },
  { key: "dexscreener", label: "DexScreener", tier: "free", detail: "Live pair tape for price, liquidity, flow, and short-horizon moves." },
  { key: "rugcheck", label: "Rugcheck", tier: "free", detail: "Recent and verified listings plus risk summaries." },
  { key: "runtime", label: "Runtime book", tier: "local", detail: "Tracked-position context from the bot database." },
];

function median(values: Array<number | null | undefined>): number | null {
  const sorted = values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function round(value: number | null, decimals = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getNumeric(record: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
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

function computeGraduationAgeMinutes(token: DiscoveryToken): number | null {
  if (!token.graduatedAt) return null;
  return Math.max(0, Math.round((Date.now() / 1000 - token.graduatedAt) / 60));
}

function mergeSeeds(...groups: ListedSeed[][]): ListedSeed[] {
  const merged = new Map<string, ListedSeed>();
  for (const group of groups) {
    for (const seed of group) {
      if (!merged.has(seed.mint)) merged.set(seed.mint, seed);
    }
  }
  return [...merged.values()];
}

function seedFromDiscoveryToken(token: DiscoveryToken, primarySignal: ListedSeed["primarySignal"]): ListedSeed {
  return {
    mint: token.mint,
    symbol: token.symbol || null,
    name: token.name || null,
    source: token.source || null,
    graduationAgeMinutes: computeGraduationAgeMinutes(token),
    primarySignal,
  };
}

function seedFromRugcheckToken(token: RugcheckListedToken, primarySignal: ListedSeed["primarySignal"]): ListedSeed {
  return {
    mint: token.mint,
    symbol: token.symbol,
    name: token.name,
    source: token.verified ? "rugcheck_verified" : "rugcheck_recent",
    graduationAgeMinutes: null,
    primarySignal,
  };
}

function chooseBetterSeed(current: ListedSeed | null, next: ListedSeed): ListedSeed {
  if (!current) return next;
  if (current.primarySignal.startsWith("birdeye")) return current;
  if (next.primarySignal.startsWith("birdeye")) return next;
  return current;
}

function emptyPayload(meta: DiscoveryLabSnapshotMeta, focusToken: DiscoveryLabMarketFocusToken | null): DiscoveryLabMarketStatsPayload {
  return {
    generatedAt: new Date().toISOString(),
    meta,
    tokenUniverseSize: 0,
    marketPulse: {
      advancingSharePercent: 0,
      cautionSharePercent: 0,
      medianPriceChange5mPercent: null,
      medianLiquidityUsd: null,
      medianVolume24hUsd: null,
      medianRugScoreNormalized: null,
      trackedOpenPositions: 0,
    },
    sourceMix: {
      birdeyeRecentCount: 0,
      birdeyeMomentumCount: 0,
      rugcheckRecentCount: 0,
      rugcheckVerifiedCount: 0,
    },
    tokens: [],
    focusToken,
  };
}

export class MarketIntelService {
  private readonly dexscreener = new DexScreenerClient();
  private readonly rugcheck = new RugcheckClient();
  private readonly sharedFacts = new SharedTokenFactsService();
  private readonly boardCache = new Map<number, MarketStatsBoardCache>();
  private readonly focusTokenCache = new Map<string, MarketStatsFocusCache>();

  constructor(private readonly deps: MarketIntelDeps) {}

  async getTokenStats(mint: string): Promise<MarketTokenStatsPayload> {
    const normalizedMint = mint.trim();
    if (normalizedMint.length === 0) {
      throw new Error("mint is required");
    }

    const [overview, rugSummary, graduation] = await Promise.all([
      this.deps.birdeye.getTokenOverview(normalizedMint),
      this.rugcheck.getTokenReportSummary(normalizedMint).catch(() => null),
      db.candidate.findFirst({
        where: { mint: normalizedMint, graduatedAt: { not: null } },
        orderBy: { graduatedAt: "asc" },
        select: { graduatedAt: true },
      }),
    ]);

    const overviewRecord = (overview ?? null) as Record<string, unknown> | null;
    const graduatedAt = graduation?.graduatedAt?.getTime() ?? null;
    const ageMinutes = graduatedAt === null
      ? null
      : Math.max(0, Math.round((Date.now() - graduatedAt) / 60_000));

    return {
      mint: normalizedMint,
      price24h: getNumeric(overviewRecord, "price"),
      mc: getNumeric(overviewRecord, "marketCap", "market_cap"),
      liq: getNumeric(overviewRecord, "liquidity"),
      buyers5m: getNumeric(overviewRecord, "buy5m", "buy_5m"),
      sellCount5m: getNumeric(overviewRecord, "sell5m", "sell_5m"),
      rugScore: rugSummary?.scoreNormalized ?? rugSummary?.score ?? null,
      ageMinutes,
    };
  }

  async getRecentSmartWalletActivity(mints: string[], limit = 10): Promise<SmartWalletActivityPayload[]> {
    const normalizedMints = [...new Set(
      mints.map((mint) => mint.trim()).filter((mint) => mint.length > 0),
    )];
    if (normalizedMints.length === 0) {
      return [];
    }

    const cappedLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
    const events = await db.smartWalletEvent.findMany({
      where: { mint: { in: normalizedMints } },
      orderBy: { receivedAt: "desc" },
      take: cappedLimit,
      include: { wallet: { select: { label: true } } },
    });

    return events.map((event) => ({
      id: event.id,
      mint: event.mint,
      walletAddress: event.walletAddress,
      walletLabel: event.wallet?.label ?? null,
      side: event.side,
      amountUsd: Number(event.amountUsd),
      txSignature: event.txSignature,
      receivedAt: event.receivedAt.toISOString(),
    }));
  }

  async getTrending(input?: { mint?: string; limit?: number; refresh?: boolean; focusOnly?: boolean }): Promise<DiscoveryLabMarketStatsPayload> {
    const limit = Math.min(Math.max(Math.floor(input?.limit ?? DEFAULT_LIMIT), 8), 30);
    const focusMint = typeof input?.mint === "string" && input.mint.trim().length > 0 ? input.mint.trim() : null;
    if (input?.refresh) {
      if (input.focusOnly && focusMint) return this.refreshFocusToken(limit, focusMint);
      return this.refreshBoard(limit, focusMint);
    }
    if (input?.focusOnly && focusMint && !this.focusTokenCache.has(focusMint)) {
      return this.refreshFocusToken(limit, focusMint);
    }
    return this.composePayload(limit, focusMint, null, []);
  }

  private async refreshBoard(limit: number, focusMint: string | null): Promise<DiscoveryLabMarketStatsPayload> {
    const settings = await this.deps.getSettings();
    const warnings: string[] = [];
    const tokenUniverse = await this.buildTokenUniverse(limit, settings, warnings);
    const rugSummaries = await this.loadRugSummaries(tokenUniverse.map((token) => token.mint), warnings);
    const dexPairs = await this.safeLoad(
      "DexScreener market-intel pairs",
      () => this.dexscreener.getTopPairsByMint(tokenUniverse.map((token) => token.mint)),
      new Map<string, DexScreenerTokenPair>(),
      warnings,
      "DexScreener tape is unavailable, so price and liquidity fields may be blank.",
    );
    const positionRows = await db.position.findMany({
      where: { mint: { in: tokenUniverse.map((token) => token.mint) } },
      orderBy: { openedAt: "desc" },
      select: { id: true, mint: true, status: true },
    });
    const latestPositionByMint = new Map<string, { id: string; status: "OPEN" | "CLOSED" }>();
    for (const row of positionRows) {
      if (!latestPositionByMint.has(row.mint)) {
        latestPositionByMint.set(row.mint, { id: row.id, status: row.status });
      }
    }

    const rows = tokenUniverse.map((seed) => {
      const pair = dexPairs.get(seed.mint) ?? null;
      const rug = rugSummaries.get(seed.mint) ?? null;
      const tracked = latestPositionByMint.get(seed.mint) ?? null;
      const row: DiscoveryLabMarketTokenRow = {
        mint: seed.mint,
        pairAddress: pair?.pairAddress?.trim() ? pair.pairAddress : null,
        pairCreatedAt: pair?.pairCreatedAt ?? null,
        symbol: seed.symbol ?? "Unknown",
        name: seed.name ?? seed.symbol ?? seed.mint,
        source: seed.source,
        primarySignal: seed.primarySignal,
        graduationAgeMinutes: seed.graduationAgeMinutes,
        priceUsd: pair?.priceUsd ?? null,
        liquidityUsd: pair?.liquidityUsd ?? null,
        marketCapUsd: pair?.marketCapUsd ?? null,
        volume5mUsd: pair?.volume5mUsd ?? null,
        volume24hUsd: pair?.volume24hUsd ?? null,
        buys5m: pair?.buys5m ?? null,
        sells5m: pair?.sells5m ?? null,
        priceChange5mPercent: pair?.priceChange5mPercent ?? null,
        priceChange1hPercent: pair?.priceChange1hPercent ?? null,
        rugScore: rug?.score ?? null,
        rugScoreNormalized: rug?.scoreNormalized ?? null,
        rugRiskLevel: rug?.topRiskLevel ?? "unknown",
        topRiskName: rug?.topRiskName ?? null,
        lpLockedPercent: rug?.lpLockedPercent ?? null,
        trackedPositionId: tracked?.id ?? null,
        trackedPositionStatus: tracked?.status ?? null,
        socials: {
          website: pair?.website ?? null,
          twitter: pair?.twitter ?? null,
          telegram: pair?.telegram ?? null,
          count: [pair?.website, pair?.twitter, pair?.telegram].filter(Boolean).length,
        },
        toolLinks: {
          dexscreener: pair?.url ?? buildDexScreenerHref(seed.mint),
          rugcheck: buildRugcheckHref(seed.mint),
          axiom: buildAxiomHref(pair?.pairAddress?.trim() ? pair.pairAddress : seed.mint),
        },
      };
      void this.sharedFacts.rememberMarketStats(seed.mint, {
        dexPair: pair,
        rugcheck: rug,
        primarySignal: seed.primarySignal,
        capturedAt: new Date().toISOString(),
      });
      return row;
    });

    const advancingCount = rows.filter((row) => (row.priceChange5mPercent ?? 0) > 0).length;
    const cautionCount = rows.filter((row) => row.rugRiskLevel === "danger" || (row.rugScoreNormalized ?? 100) >= 70).length;
    const trackedOpenPositions = rows.filter((row) => row.trackedPositionStatus === "OPEN").length;
    const generatedAt = new Date().toISOString();
    const payload: MarketStatsBoardSnapshot = {
      generatedAt,
      tokenUniverseSize: rows.length,
      marketPulse: {
        advancingSharePercent: round(rows.length > 0 ? (advancingCount / rows.length) * 100 : 0) ?? 0,
        cautionSharePercent: round(rows.length > 0 ? (cautionCount / rows.length) * 100 : 0) ?? 0,
        medianPriceChange5mPercent: round(median(rows.map((row) => row.priceChange5mPercent))),
        medianLiquidityUsd: round(median(rows.map((row) => row.liquidityUsd))),
        medianVolume24hUsd: round(median(rows.map((row) => row.volume24hUsd))),
        medianRugScoreNormalized: round(median(rows.map((row) => row.rugScoreNormalized))),
        trackedOpenPositions,
      },
      sourceMix: {
        birdeyeRecentCount: rows.filter((row) => row.primarySignal === "birdeye_recent").length,
        birdeyeMomentumCount: rows.filter((row) => row.primarySignal === "birdeye_momentum").length,
        rugcheckRecentCount: rows.filter((row) => row.primarySignal === "rugcheck_recent").length,
        rugcheckVerifiedCount: rows.filter((row) => row.primarySignal === "rugcheck_verified").length,
      },
      tokens: rows.sort((left, right) => {
        const leftSignal = (left.volume5mUsd ?? 0) + ((left.buys5m ?? 0) * 50) + ((left.priceChange5mPercent ?? 0) * 80);
        const rightSignal = (right.volume5mUsd ?? 0) + ((right.buys5m ?? 0) * 50) + ((right.priceChange5mPercent ?? 0) * 80);
        return rightSignal - leftSignal;
      }),
    };
    this.boardCache.set(limit, {
      payload,
      lastRefreshedAt: generatedAt,
      cacheState: warnings.length > 0 ? "degraded" : "ready",
      warnings: [...warnings],
    });

    let focusWarnings: string[] = [];
    let focusToken: DiscoveryLabMarketFocusToken | null = null;
    if (focusMint) {
      focusWarnings = [];
      focusToken = await this.refreshFocusTokenOnly(focusMint, focusWarnings);
    }
    return this.composePayload(limit, focusMint, focusToken, focusWarnings);
  }

  private async refreshFocusToken(limit: number, mint: string): Promise<DiscoveryLabMarketStatsPayload> {
    const warnings: string[] = [];
    const focusToken = await this.refreshFocusTokenOnly(mint, warnings);
    return this.composePayload(limit, mint, focusToken, warnings);
  }

  private composePayload(limit: number, focusMint: string | null, focusToken: DiscoveryLabMarketFocusToken | null, transientWarnings: string[]): DiscoveryLabMarketStatsPayload {
    const board = this.boardCache.get(limit);
    const focusCache = focusMint ? this.focusTokenCache.get(focusMint) ?? null : null;
    const mergedWarnings = board
      ? [...board.warnings, ...transientWarnings]
      : transientWarnings.length > 0
        ? transientWarnings
        : ["No market snapshot exists yet. Use Refresh board before relying on this page."];
    const lastRefreshedAt = board?.lastRefreshedAt ?? null;
    const cacheState = board
      ? mergedWarnings.length > 0 ? "degraded" : board.cacheState
      : transientWarnings.length > 0 ? "degraded" : "empty";

    if (!board) {
      return emptyPayload(
        this.buildMeta({ cacheState, lastRefreshedAt, warnings: mergedWarnings, focusMint, focusTokenCachedAt: focusCache?.refreshedAt ?? null }),
        focusToken ?? focusCache?.payload ?? null,
      );
    }

    return {
      ...board.payload,
      meta: this.buildMeta({ cacheState, lastRefreshedAt, warnings: mergedWarnings, focusMint, focusTokenCachedAt: focusCache?.refreshedAt ?? null }),
      focusToken: focusToken ?? focusCache?.payload ?? null,
    };
  }

  private buildMeta(input: {
    cacheState: "empty" | "ready" | "degraded";
    lastRefreshedAt: string | null;
    warnings: string[];
    focusMint: string | null;
    focusTokenCachedAt: string | null;
  }): DiscoveryLabSnapshotMeta {
    const parsedLastRefresh = input.lastRefreshedAt ? Date.parse(input.lastRefreshedAt) : Number.NaN;
    return {
      refreshMode: "manual",
      cacheState: input.cacheState,
      lastRefreshedAt: input.lastRefreshedAt,
      staleMinutes: Number.isFinite(parsedLastRefresh) ? Math.max(0, Math.round((Date.now() - parsedLastRefresh) / 60_000)) : null,
      warnings: input.warnings,
      focusMint: input.focusMint,
      focusTokenCachedAt: input.focusTokenCachedAt,
      sources: MARKET_STATS_SOURCES,
    };
  }

  private async refreshFocusTokenOnly(mint: string, warnings: string[]): Promise<DiscoveryLabMarketFocusToken | null> {
    const focusToken = await this.safeLoad<DiscoveryLabMarketFocusToken | null>(
      `focus token ${mint}`,
      () => this.buildFocusToken(mint),
      null,
      warnings,
      `Focus token ${mint.slice(0, 8)} could not be refreshed.`,
    );
    if (focusToken) {
      this.focusTokenCache.set(mint, { payload: focusToken, refreshedAt: new Date().toISOString() });
    }
    return focusToken;
  }

  private async buildTokenUniverse(limit: number, settings: BotSettings, warnings: string[]): Promise<ListedSeed[]> {
    const nowUnix = Math.floor(Date.now() / 1000);
    const minGraduatedTime = nowUnix - Math.min(settings.filters.maxGraduationAgeSeconds, RECENT_WINDOW_SECONDS);
    const [birdeyeRecent, birdeyeMomentum, rugRecent, rugVerified] = await Promise.all([
      this.safeLoad("Birdeye recent market-intel tokens", () => this.deps.birdeye.getMemeTokens({
        source: "pump_dot_fun",
        graduated: true,
        minGraduatedTime,
        minLiquidityUsd: Math.max(2_500, settings.filters.minLiquidityUsd * 0.3),
        minVolume5mUsd: Math.max(500, settings.filters.minVolume5mUsd * 0.2),
        limit: limit * 2,
        sortBy: "graduated_time",
      }), [] as DiscoveryToken[], warnings, "Birdeye recent graduates are unavailable, so the paid seed slice is partial."),
      this.safeLoad("Birdeye momentum market-intel tokens", () => this.deps.birdeye.getMemeTokens({
        source: "pump_dot_fun",
        graduated: true,
        minGraduatedTime,
        minLiquidityUsd: Math.max(2_500, settings.filters.minLiquidityUsd * 0.3),
        minVolume5mUsd: Math.max(500, settings.filters.minVolume5mUsd * 0.2),
        limit: limit * 2,
        sortBy: "volume_5m_usd",
      }), [] as DiscoveryToken[], warnings, "Birdeye momentum rows are unavailable, so the paid momentum slice is partial."),
      this.safeLoad("Rugcheck recent market-intel tokens", () => this.rugcheck.getRecentTokens(limit), [] as RugcheckListedToken[], warnings, "Rugcheck recent listings are unavailable."),
      this.safeLoad("Rugcheck verified market-intel tokens", () => this.rugcheck.getVerifiedTokens(Math.ceil(limit / 2)), [] as RugcheckListedToken[], warnings, "Rugcheck verified listings are unavailable."),
    ]);

    const deduped = new Map<string, ListedSeed>();
    for (const seed of mergeSeeds(
      birdeyeRecent.map((token) => seedFromDiscoveryToken(token, "birdeye_recent")),
      birdeyeMomentum.map((token) => seedFromDiscoveryToken(token, "birdeye_momentum")),
      rugRecent.map((token) => seedFromRugcheckToken(token, "rugcheck_recent")),
      rugVerified.map((token) => seedFromRugcheckToken(token, "rugcheck_verified")),
    )) {
      deduped.set(seed.mint, chooseBetterSeed(deduped.get(seed.mint) ?? null, seed));
    }

    return [...deduped.values()].slice(0, limit);
  }

  private async loadRugSummaries(mints: string[], warnings: string[]): Promise<Map<string, RugcheckTokenSummary>> {
    const pairs = await Promise.all(mints.map(async (mint) => {
      try {
        const summary = await this.rugcheck.getTokenReportSummary(mint);
        return summary ? [mint, summary] as const : null;
      } catch {
        return null;
      }
    }));
    const missingCount = pairs.filter((entry) => entry === null).length;
    if (missingCount > 0) {
      warnings.push(`Rugcheck summaries are partial for ${missingCount} token${missingCount === 1 ? "" : "s"}, so some risk fields may be blank.`);
    }
    return new Map(pairs.filter((entry): entry is readonly [string, RugcheckTokenSummary] => Boolean(entry)));
  }

  private async buildFocusToken(mint: string): Promise<DiscoveryLabMarketFocusToken> {
    const [insight, rugcheck, tracked] = await Promise.all([
      this.deps.enrichment.getEnrichment(mint),
      this.rugcheck.getTokenReportSummary(mint).catch(() => null),
      db.position.findFirst({
        where: { mint },
        orderBy: { openedAt: "desc" },
        select: { id: true, status: true },
      }),
    ]);

    return {
      insight,
      rugcheck,
      trackedPositionId: tracked?.id ?? null,
      trackedPositionStatus: tracked?.status ?? null,
    };
  }

  private async safeLoad<T>(label: string, load: () => Promise<T>, fallback: T, warnings?: string[], warningMessage?: string): Promise<T> {
    try {
      return await load();
    } catch (error) {
      logger.warn({ err: error, label }, "market intel source failed");
      if (warnings && warningMessage) warnings.push(warningMessage);
      return fallback;
    }
  }
}
