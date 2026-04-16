import { db } from "../db/client.js";
import type {
  DiscoveryToken,
  HolderConcentration,
  MintAuthoritySnapshot,
  TokenSecuritySnapshot,
  TradeDataSnapshot,
} from "../types/domain.js";
import { toJsonValue } from "../utils/json.js";

const CACHE_TTL_MS = {
  detail: 2 * 60_000,
  tradeData: 15_000,
  mintAuthorities: 30 * 60_000,
  holderConcentration: 10 * 60_000,
  security: 10 * 60_000,
} as const;

type CacheKey =
  | "latestDetail"
  | "latestOverview"
  | "latestMetadata"
  | "latestMarketStats"
  | "latestTradeData"
  | "latestMintAuthorities"
  | "latestHolderConcentration"
  | "latestSecurity";

type CacheTimestampKey =
  | "latestDetailAt"
  | "latestOverviewAt"
  | "latestMetadataAt"
  | "latestMarketStatsAt"
  | "latestTradeDataAt"
  | "latestMintAuthoritiesAt"
  | "latestHolderConcentrationAt"
  | "latestSecurityAt";

export type FreshTokenFacts = {
  detail: DiscoveryToken | null;
  overview: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  marketStats: Record<string, unknown> | null;
  tradeData: TradeDataSnapshot | null;
  mintAuthorities: MintAuthoritySnapshot | null;
  holderConcentration: HolderConcentration | null;
  security: TokenSecuritySnapshot | null;
};

export class SharedTokenFactsService {
  async rememberDiscovery(token: DiscoveryToken): Promise<void> {
    await db.sharedTokenFact.upsert({
      where: { mint: token.mint },
      update: {
        symbol: token.symbol,
        name: token.name,
        source: token.source,
        latestDiscovery: toJsonValue(token),
        latestDiscoveryAt: new Date(),
        lastSeenAt: new Date(),
      },
      create: {
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        source: token.source,
        latestDiscovery: toJsonValue(token),
        latestDiscoveryAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
  }

  async rememberDetail(mint: string, detail: DiscoveryToken | null): Promise<void> {
    await this.writeFact(mint, "latestDetail", "latestDetailAt", detail);
  }

  async rememberOverview(mint: string, overview: Record<string, unknown> | null): Promise<void> {
    await this.writeFact(mint, "latestOverview", "latestOverviewAt", overview);
  }

  async rememberMetadata(mint: string, metadata: Record<string, unknown> | null): Promise<void> {
    await this.writeFact(mint, "latestMetadata", "latestMetadataAt", metadata);
  }

  async rememberMarketStats(mint: string, marketStats: Record<string, unknown> | null): Promise<void> {
    await this.writeFact(mint, "latestMarketStats", "latestMarketStatsAt", marketStats);
  }

  async rememberTradeData(mint: string, tradeData: TradeDataSnapshot | null): Promise<void> {
    await this.writeFact(mint, "latestTradeData", "latestTradeDataAt", tradeData);
  }

  async rememberMintAuthorities(mint: string, mintAuthorities: MintAuthoritySnapshot | null): Promise<void> {
    await this.writeFact(mint, "latestMintAuthorities", "latestMintAuthoritiesAt", mintAuthorities);
  }

  async rememberHolderConcentration(mint: string, holderConcentration: HolderConcentration | null): Promise<void> {
    await this.writeFact(mint, "latestHolderConcentration", "latestHolderConcentrationAt", holderConcentration);
  }

  async rememberSecurity(mint: string, security: TokenSecuritySnapshot | null): Promise<void> {
    await this.writeFact(mint, "latestSecurity", "latestSecurityAt", security);
  }

  async rememberMigrationSignal(input: {
    programId: string;
    signature: string;
    observedAt?: Date;
  }): Promise<void> {
    await db.sharedTokenFactMigrationSignal.create({
      data: {
        programId: input.programId,
        signature: input.signature,
        observedAt: input.observedAt ?? new Date(),
      },
    });
  }

  async getFreshFacts(mint: string): Promise<FreshTokenFacts> {
    const row = await db.sharedTokenFact.findUnique({
      where: { mint },
      select: {
        latestDetail: true,
        latestDetailAt: true,
        latestOverview: true,
        latestOverviewAt: true,
        latestMetadata: true,
        latestMetadataAt: true,
        latestMarketStats: true,
        latestMarketStatsAt: true,
        latestTradeData: true,
        latestTradeDataAt: true,
        latestMintAuthorities: true,
        latestMintAuthoritiesAt: true,
        latestHolderConcentration: true,
        latestHolderConcentrationAt: true,
        latestSecurity: true,
        latestSecurityAt: true,
      },
    });

    return {
      detail: this.readFreshFromRow<DiscoveryToken>(row, "latestDetail", "latestDetailAt", CACHE_TTL_MS.detail),
      overview: this.readFreshFromRow<Record<string, unknown>>(row, "latestOverview", "latestOverviewAt", CACHE_TTL_MS.detail),
      metadata: this.readFreshFromRow<Record<string, unknown>>(row, "latestMetadata", "latestMetadataAt", CACHE_TTL_MS.detail),
      marketStats: this.readFreshFromRow<Record<string, unknown>>(row, "latestMarketStats", "latestMarketStatsAt", CACHE_TTL_MS.detail),
      tradeData: this.readFreshFromRow<TradeDataSnapshot>(row, "latestTradeData", "latestTradeDataAt", CACHE_TTL_MS.tradeData),
      mintAuthorities: this.readFreshFromRow<MintAuthoritySnapshot>(
        row,
        "latestMintAuthorities",
        "latestMintAuthoritiesAt",
        CACHE_TTL_MS.mintAuthorities,
      ),
      holderConcentration: this.readFreshFromRow<HolderConcentration>(
        row,
        "latestHolderConcentration",
        "latestHolderConcentrationAt",
        CACHE_TTL_MS.holderConcentration,
      ),
      security: this.readFreshFromRow<TokenSecuritySnapshot>(row, "latestSecurity", "latestSecurityAt", CACHE_TTL_MS.security),
    };
  }

  private async writeFact(
    mint: string,
    valueKey: CacheKey,
    timeKey: CacheTimestampKey,
    value: unknown,
  ): Promise<void> {
    await db.sharedTokenFact.upsert({
      where: { mint },
      update: {
        [valueKey]: value === null ? null : toJsonValue(value),
        [timeKey]: value === null ? null : new Date(),
        lastSeenAt: new Date(),
      },
      create: {
        mint,
        [valueKey]: value === null ? null : toJsonValue(value),
        [timeKey]: value === null ? null : new Date(),
        lastSeenAt: new Date(),
      },
    });
  }

  private readFreshFromRow<T>(
    row: Record<string, unknown> | null,
    valueKey: CacheKey,
    timeKey: CacheTimestampKey,
    ttlMs: number,
  ): T | null {
    if (!row) {
      return null;
    }

    const seenAt = row[timeKey] as Date | null;
    if (!(seenAt instanceof Date) || (Date.now() - seenAt.getTime()) > ttlMs) {
      return null;
    }

    const value = row[valueKey] as unknown;
    if (!value || typeof value !== "object") {
      return null;
    }

    return value as T;
  }
}
