import { asNumber, asRecord, asString } from "../../utils/types.js";
import { logger } from "../../utils/logger.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_PUMPFUN_BASE_URL = process.env.PUMPFUN_PUBLIC_BASE_URL ?? "https://frontend-api-v3.pump.fun";

const RETRY_DELAYS_MS = [500, 1000, 2000];

function parseJson(text: string): unknown {
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function isNotFound(status: number): boolean {
  return status === 404;
}

function isAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

function isTransientFailure(status: number): boolean {
  return status === 429 || status >= 500;
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

    let attempts = 0;
    while (attempts <= RETRY_DELAYS_MS.length) {
      const response = await this.httpClient(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          origin: "https://pump.fun",
        },
      });

      if (isNotFound(response.status)) {
        return null;
      }

      if (isAuthError(response.status)) {
        logger.warn("Pump.fun v3 API requires authentication - falling back to null");
        return null;
      }

      if (isTransientFailure(response.status) && attempts < RETRY_DELAYS_MS.length) {
        attempts++;
        const delayMs = RETRY_DELAYS_MS[attempts - 1];
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
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

    return null;
  }
}

