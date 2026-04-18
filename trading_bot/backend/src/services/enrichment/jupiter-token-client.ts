import { asArray, asBoolean, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_JUPITER_TOKEN_BASE_URL = process.env.JUPITER_TOKEN_BASE_URL ?? "https://tokens.jup.ag";

function parseJson(text: string): unknown {
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function shouldReturnNull(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}

export type JupiterTokenFetchResult = {
  mint: string;
  symbol: string | null;
  name: string | null;
  strict: boolean;
  verified: boolean;
  tags: string[];
};

export class JupiterTokenClient {
  constructor(
    private readonly baseUrl: string = DEFAULT_JUPITER_TOKEN_BASE_URL,
    private readonly httpClient: HttpClient = fetch,
  ) {}

  async fetch(mint: string): Promise<JupiterTokenFetchResult | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const url = new URL(`/token/${normalizedMint}`, this.baseUrl);
    const response = await this.httpClient(url, { method: "GET", headers: { accept: "application/json" } });
    if (shouldReturnNull(response.status)) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Jupiter token fetch failed with status ${response.status}`);
    }

    const payload = parseJson(await response.text());
    const record = asRecord(payload);
    const tags = asArray(record?.tags)
      .map((entry) => asString(entry))
      .filter((entry): entry is string => typeof entry === "string");
    const strict = tags.includes("strict") || asBoolean(record?.strict) === true;
    const verified = tags.includes("verified") || asBoolean(record?.verified) === true;

    return {
      mint: normalizedMint,
      symbol: asString(record?.symbol),
      name: asString(record?.name),
      strict,
      verified,
      tags,
    };
  }
}

