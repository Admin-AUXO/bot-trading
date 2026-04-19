import { asArray, asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_CIELO_BASE_URL = process.env.CIELO_BASE_URL ?? "https://cielo.finance";
const CIELO_API_KEY = process.env.CIELO_API_KEY ?? "";

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

type CieloEventSide = "buy" | "sell" | null;

function normalizeSide(value: string | null): CieloEventSide {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "buy") return "buy";
  if (normalized === "sell") return "sell";
  return null;
}

export type CieloFetchResult = {
  mint: string;
  buys24h: number | null;
  sells24h: number | null;
  netFlowUsd24h: number | null;
  events: Array<{
    wallet: string;
    side: CieloEventSide;
    amountUsd: number | null;
    occurredAt: string | null;
  }>;
};

export class CieloClient {
  constructor(
    private readonly baseUrl: string = DEFAULT_CIELO_BASE_URL,
    private readonly httpClient: HttpClient = fetch,
  ) {}

  async fetch(mint: string): Promise<CieloFetchResult | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const url = new URL("/v1/feed", this.baseUrl);
    url.searchParams.set("token", normalizedMint);

    const headers: Record<string, string> = { accept: "application/json" };
    if (CIELO_API_KEY) {
      headers["X-API-Key"] = CIELO_API_KEY;
    }

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
        throw new Error(`Cielo fetch failed with status ${response.status}`);
      }

      const payload = parseJson(await response.text());
      const record = asRecord(payload);
      const entries = asArray(record?.items ?? record?.feed ?? record?.events);
      const events = entries
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => ({
          wallet: asString(entry.wallet) ?? asString(entry.owner) ?? "",
          side: normalizeSide(asString(entry.side) ?? asString(entry.action)),
          amountUsd: asNumber(entry.amountUsd) ?? asNumber(entry.usdAmount),
          occurredAt: asString(entry.timestamp) ?? asString(entry.occurredAt),
        }))
        .filter((event) => event.wallet.length > 0);

      const buys24h = events.filter((event) => event.side === "buy").length;
      const sells24h = events.filter((event) => event.side === "sell").length;
      const netFlowUsd24h = events.reduce((sum, event) => {
        if (event.amountUsd === null) return sum;
        if (event.side === "buy") return sum + event.amountUsd;
        if (event.side === "sell") return sum - event.amountUsd;
        return sum;
      }, 0);

      return {
        mint: normalizedMint,
        buys24h,
        sells24h,
        netFlowUsd24h: Number.isFinite(netFlowUsd24h) ? netFlowUsd24h : null,
        events: events.slice(0, 20),
      };
    }

    return null;
  }
}

