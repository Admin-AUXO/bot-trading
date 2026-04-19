import { asArray, asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_DEFILLAMA_BASE_URL = process.env.DEFILLAMA_BASE_URL ?? "https://api.llama.fi";

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

    return null;
  }
}

