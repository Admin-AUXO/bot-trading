import { asArray, asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_SOLSNIFFER_BASE_URL = process.env.SOLSNIFFER_BASE_URL ?? "https://solsniffer.com";

function parseJson(text: string): unknown {
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function shouldReturnNull(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
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
    const response = await this.httpClient(url, { method: "GET", headers: { accept: "application/json" } });
    if (shouldReturnNull(response.status)) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Solsniffer fetch failed with status ${response.status}`);
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
}

