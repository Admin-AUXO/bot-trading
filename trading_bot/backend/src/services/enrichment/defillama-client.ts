import { asArray, asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_DEFILLAMA_BASE_URL = process.env.DEFILLAMA_BASE_URL ?? "https://api.llama.fi";

function parseJson(text: string): unknown {
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function shouldReturnNull(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}

export type DefiLlamaFetchResult = {
  mint: string;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  volume7dUsd: number | null;
  protocols: string[];
};

export class DefiLlamaClient {
  constructor(
    private readonly baseUrl: string = DEFAULT_DEFILLAMA_BASE_URL,
    private readonly httpClient: HttpClient = fetch,
  ) {}

  async fetch(mint: string): Promise<DefiLlamaFetchResult | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const url = new URL(`/summary/dexs/${normalizedMint}`, this.baseUrl);
    const response = await this.httpClient(url, { method: "GET", headers: { accept: "application/json" } });
    if (shouldReturnNull(response.status)) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`DefiLlama fetch failed with status ${response.status}`);
    }

    const payload = parseJson(await response.text());
    const record = asRecord(payload);
    const protocols = asArray(record?.protocols ?? record?.dexes)
      .map((entry) => asString(asRecord(entry)?.name) ?? asString(entry))
      .filter((entry): entry is string => typeof entry === "string");

    return {
      mint: normalizedMint,
      tvlUsd: asNumber(record?.tvl) ?? asNumber(record?.tvlUsd),
      volume24hUsd: asNumber(record?.volume24h) ?? asNumber(record?.volume24hUsd),
      volume7dUsd: asNumber(record?.volume7d) ?? asNumber(record?.volume7dUsd),
      protocols,
    };
  }
}

