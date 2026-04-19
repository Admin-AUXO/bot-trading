import { asArray, asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_BUBBLEMAPS_BASE_URL = process.env.BUBBLEMAPS_BASE_URL ?? "https://api.bubblemaps.io";
const LEGACY_BUBBLEMAPS_BASE_URL = "https://api-legacy.bubblemaps.io";

const RETRY_DELAYS_MS = [500, 1000, 2000];

function parseJson(text: string): unknown {
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function isNotFound(status: number): boolean {
  return status === 404;
}

function isTransientFailure(status: number): boolean {
  return status === 429 || status >= 500;
}

export type BubblemapsFetchResult = {
  mint: string;
  topClusterPct: number | null;
  clusterCount: number | null;
  clusters: Array<{
    id: string;
    holderCount: number | null;
    supplyPct: number | null;
  }>;
};

export class BubblemapsClient {
  constructor(
    private readonly baseUrl: string = DEFAULT_BUBBLEMAPS_BASE_URL,
    private readonly httpClient: HttpClient = fetch,
  ) {}

  private get apiKey(): string {
    return process.env.BUBBLEMAPS_API_KEY ?? "";
  }

  async fetch(mint: string): Promise<BubblemapsFetchResult | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    if (this.apiKey) {
      return this.fetchWithKey(normalizedMint);
    }

    return this.fetchLegacy(normalizedMint);
  }

  private async fetchWithKey(mint: string): Promise<BubblemapsFetchResult | null> {
    const url = new URL(`/v1/token/${mint}/holders`, this.baseUrl);

    const headers: Record<string, string> = {
      accept: "application/json",
      "X-ApiKey": this.apiKey,
    };

    let attempts = 0;
    while (attempts <= RETRY_DELAYS_MS.length) {
      const response = await this.httpClient(url, { method: "GET", headers });

      if (isNotFound(response.status)) {
        return null;
      }

      if (isTransientFailure(response.status) && attempts < RETRY_DELAYS_MS.length) {
        attempts++;
        const delayMs = RETRY_DELAYS_MS[attempts - 1];
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Bubblemaps fetch failed with status ${response.status}`);
      }

      const payload = parseJson(await response.text());
      const record = asRecord(payload);
      const clustersRaw = asArray(record?.clusters ?? record?.clusterData ?? record?.nodes ?? record?.holders);
      const clusters = clustersRaw
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => ({
          id: asString(entry.id) ?? asString(entry.clusterId) ?? asString(entry.name) ?? "",
          holderCount: asNumber(entry.holderCount) ?? asNumber(entry.holders) ?? asNumber(entry.wallets) ?? asNumber(entry.count),
          supplyPct: asNumber(entry.supplyPct) ?? asNumber(entry.percentage) ?? asNumber(entry.weight) ?? asNumber(entry.share),
        }))
        .filter((entry) => entry.id.length > 0);

      const topClusterPct = clusters
        .map((cluster) => cluster.supplyPct)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
        .sort((left, right) => right - left)[0] ?? null;

      return {
        mint,
        topClusterPct,
        clusterCount: clusters.length,
        clusters,
      };
    }

    return null;
  }

  private async fetchLegacy(mint: string): Promise<BubblemapsFetchResult | null> {
    const legacyUrl = this.baseUrl === DEFAULT_BUBBLEMAPS_BASE_URL ? LEGACY_BUBBLEMAPS_BASE_URL : this.baseUrl;
    const url = new URL("/map-data", legacyUrl);
    url.searchParams.set("token", mint);
    url.searchParams.set("chain", "sol");

    let attempts = 0;
    while (attempts <= RETRY_DELAYS_MS.length) {
      const response = await this.httpClient(url, { method: "GET", headers: { accept: "application/json" } });

      if (isNotFound(response.status)) {
        return null;
      }

      if (isTransientFailure(response.status) && attempts < RETRY_DELAYS_MS.length) {
        attempts++;
        const delayMs = RETRY_DELAYS_MS[attempts - 1];
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!response.ok) {
        return null;
      }

      const payload = parseJson(await response.text());
      const record = asRecord(payload);
      const clustersRaw = asArray(record?.clusters ?? record?.clusterData ?? record?.nodes);
      const clusters = clustersRaw
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => ({
          id: asString(entry.id) ?? asString(entry.clusterId) ?? asString(entry.name) ?? "",
          holderCount: asNumber(entry.holderCount) ?? asNumber(entry.holders) ?? asNumber(entry.wallets),
          supplyPct: asNumber(entry.supplyPct) ?? asNumber(entry.percentage) ?? asNumber(entry.weight),
        }))
        .filter((entry) => entry.id.length > 0);

      const topClusterPct = clusters
        .map((cluster) => cluster.supplyPct)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
        .sort((left, right) => right - left)[0] ?? null;

      return {
        mint,
        topClusterPct,
        clusterCount: clusters.length,
        clusters,
      };
    }

    return null;
  }
}

