import { asArray, asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_SOLSNIFFER_BASE_URL = process.env.SOLSNIFFER_BASE_URL ?? "https://solsniffer.com";

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

export type SolsnifferFetchResult = {
  mint: string;
  score: number | null;
  topFlags: string[];
};

export class SolsnifferClient {
  constructor(
    private readonly baseUrl: string = DEFAULT_SOLSNIFFER_BASE_URL,
    private readonly httpClient: HttpClient = fetch,
  ) {}

  async fetch(mint: string): Promise<SolsnifferFetchResult | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const url = new URL(`/api/v2/token/${normalizedMint}`, this.baseUrl);

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
      const flags = asArray(record?.flags ?? record?.riskFlags ?? record?.indicators)
        .map((entry) => {
          const item = asRecord(entry);
          return asString(item?.name) ?? asString(item?.label) ?? asString(entry);
        })
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, 3);

      return {
        mint: normalizedMint,
        score: asNumber(record?.score) ?? asNumber(record?.riskScore),
        topFlags: flags,
      };
    }

    return null;
  }
}

