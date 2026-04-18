import { asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_PUMPFUN_BASE_URL = process.env.PUMPFUN_PUBLIC_BASE_URL ?? "https://frontend-api.pump.fun";

function parseJson(text: string): unknown {
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function shouldReturnNull(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}

function toIsoFromMs(ms: number | null): string | null {
  if (ms === null) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export type PumpfunPublicFetchResult = {
  mint: string;
  symbol: string | null;
  creator: string | null;
  graduatedAt: string | null;
  kothDurationSeconds: number | null;
  replyCount: number | null;
  initialBuySol: number | null;
};

export class PumpfunPublicClient {
  constructor(
    private readonly baseUrl: string = DEFAULT_PUMPFUN_BASE_URL,
    private readonly httpClient: HttpClient = fetch,
  ) {}

  async fetch(mint: string): Promise<PumpfunPublicFetchResult | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const url = new URL(`/coins/${normalizedMint}`, this.baseUrl);
    const response = await this.httpClient(url, { method: "GET", headers: { accept: "application/json" } });
    if (shouldReturnNull(response.status)) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Pump.fun fetch failed with status ${response.status}`);
    }

    const payload = parseJson(await response.text());
    const record = asRecord(payload);
    const createdTimestamp = asNumber(record?.created_timestamp) ?? asNumber(record?.createdAt);
    const completeTimestamp = asNumber(record?.complete_timestamp) ?? asNumber(record?.graduatedAt);

    return {
      mint: normalizedMint,
      symbol: asString(record?.symbol),
      creator: asString(record?.creator),
      graduatedAt: toIsoFromMs(completeTimestamp),
      kothDurationSeconds: createdTimestamp !== null && completeTimestamp !== null
        ? Math.max(0, Math.round((completeTimestamp - createdTimestamp) / 1000))
        : null,
      replyCount: asNumber(record?.reply_count) ?? asNumber(record?.replies),
      initialBuySol: asNumber(record?.initial_buy) ?? asNumber(record?.creator_buy),
    };
  }
}

