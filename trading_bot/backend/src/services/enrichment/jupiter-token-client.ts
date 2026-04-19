import { asArray, asBoolean, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_JUPITER_TOKEN_BASE_URL = process.env.JUPITER_TOKEN_BASE_URL ?? "https://tokens.jup.ag";

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

    return null;
  }
}

