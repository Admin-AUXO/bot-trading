import { asNumber, asRecord, asString } from "../utils/types.js";

type ScalarRecord = Record<string, unknown>;

export type DexScreenerTokenPair = {
  mint: string;
  pairAddress: string;
  url: string | null;
  dexId: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume5mUsd: number | null;
  volume24hUsd: number | null;
  buys5m: number | null;
  sells5m: number | null;
  buys24h: number | null;
  sells24h: number | null;
  priceChange5mPercent: number | null;
  priceChange1hPercent: number | null;
  priceChange24hPercent: number | null;
  pairCreatedAt: string | null;
  imageUrl: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
};

const MAX_BATCH_SIZE = 30;
const REQUEST_TIMEOUT_MS = 6_000;

function pickSocialUrl(socials: unknown, type: string): string | null {
  if (!Array.isArray(socials)) {
    return null;
  }

  for (const entry of socials) {
    const record = asRecord(entry);
    if (record?.type === type) {
      return asString(record.url);
    }
  }
  return null;
}

function parsePair(row: ScalarRecord): DexScreenerTokenPair | null {
  const baseToken = asRecord(row.baseToken);
  const txns = asRecord(row.txns);
  const txns5m = asRecord(txns?.m5);
  const txns24h = asRecord(txns?.h24);
  const volume = asRecord(row.volume);
  const priceChange = asRecord(row.priceChange);
  const liquidity = asRecord(row.liquidity);
  const info = asRecord(row.info);
  const websites = Array.isArray(info?.websites) ? info.websites : [];
  const firstWebsite = websites
    .map((entry) => asRecord(entry))
    .map((entry) => asString(entry?.url))
    .find((entry) => entry) ?? null;
  const mint = asString(baseToken?.address);

  if (!mint) {
    return null;
  }

  const createdAt = asNumber(row.pairCreatedAt);

  return {
    mint,
    pairAddress: asString(row.pairAddress) ?? "",
    url: asString(row.url),
    dexId: asString(row.dexId),
    priceUsd: asNumber(row.priceUsd),
    liquidityUsd: asNumber(liquidity?.usd),
    marketCapUsd: asNumber(row.marketCap),
    fdvUsd: asNumber(row.fdv),
    volume5mUsd: asNumber(volume?.m5),
    volume24hUsd: asNumber(volume?.h24),
    buys5m: asNumber(txns5m?.buys),
    sells5m: asNumber(txns5m?.sells),
    buys24h: asNumber(txns24h?.buys),
    sells24h: asNumber(txns24h?.sells),
    priceChange5mPercent: asNumber(priceChange?.m5),
    priceChange1hPercent: asNumber(priceChange?.h1),
    priceChange24hPercent: asNumber(priceChange?.h24),
    pairCreatedAt: createdAt ? new Date(createdAt).toISOString() : null,
    imageUrl: asString(info?.imageUrl),
    website: firstWebsite,
    twitter: pickSocialUrl(info?.socials, "twitter"),
    telegram: pickSocialUrl(info?.socials, "telegram"),
  };
}

function chooseBetterPair(current: DexScreenerTokenPair | null, candidate: DexScreenerTokenPair): DexScreenerTokenPair {
  if (!current) {
    return candidate;
  }

  const currentLiquidity = current.liquidityUsd ?? 0;
  const candidateLiquidity = candidate.liquidityUsd ?? 0;
  if (candidateLiquidity !== currentLiquidity) {
    return candidateLiquidity > currentLiquidity ? candidate : current;
  }

  const currentVolume = current.volume24hUsd ?? 0;
  const candidateVolume = candidate.volume24hUsd ?? 0;
  return candidateVolume > currentVolume ? candidate : current;
}

export class DexScreenerClient {
  async getTopPairsByMint(mints: string[]): Promise<Map<string, DexScreenerTokenPair>> {
    const uniqueMints = [...new Set(mints.map((mint) => mint.trim()).filter(Boolean))];
    if (uniqueMints.length === 0) {
      return new Map();
    }

    const merged = new Map<string, DexScreenerTokenPair>();
    for (let index = 0; index < uniqueMints.length; index += MAX_BATCH_SIZE) {
      const batch = uniqueMints.slice(index, index + MAX_BATCH_SIZE);
      const batchPairs = await this.fetchBatch(batch);
      for (const pair of batchPairs) {
        merged.set(pair.mint, chooseBetterPair(merged.get(pair.mint) ?? null, pair));
      }
    }

    return merged;
  }

  private async fetchBatch(mints: string[]): Promise<DexScreenerTokenPair[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mints.join(",")}`, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`DexScreener tokens endpoint failed with ${response.status}`);
      }

      const payload = await response.json() as unknown;
      const record = asRecord(payload);
      const pairs = Array.isArray(record?.pairs) ? record.pairs : [];
      return pairs
        .map((pair) => asRecord(pair))
        .map((pair) => (pair ? parsePair(pair) : null))
        .filter((pair): pair is DexScreenerTokenPair => Boolean(pair));
    } finally {
      clearTimeout(timeout);
    }
  }
}
