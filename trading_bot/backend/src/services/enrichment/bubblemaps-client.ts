import { asArray, asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_BUBBLEMAPS_BASE_URL = process.env.BUBBLEMAPS_BASE_URL ?? "https://api-legacy.bubblemaps.io";

function parseJson(text: string): unknown {
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function shouldReturnNull(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
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

  async fetch(mint: string): Promise<BubblemapsFetchResult | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const url = new URL("/map-data", this.baseUrl);
    url.searchParams.set("token", normalizedMint);
    url.searchParams.set("chain", "sol");

    const response = await this.httpClient(url, { method: "GET", headers: { accept: "application/json" } });
    if (shouldReturnNull(response.status)) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Bubblemaps fetch failed with status ${response.status}`);
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
      mint: normalizedMint,
      topClusterPct,
      clusterCount: clusters.length,
      clusters,
    };
  }
}

