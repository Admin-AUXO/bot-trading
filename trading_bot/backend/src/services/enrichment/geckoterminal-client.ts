import { asArray, asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_GECKOTERMINAL_BASE_URL = process.env.GECKOTERMINAL_BASE_URL ?? "https://api.geckoterminal.com/api/v2";

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

export type GeckoTerminalFetchResult = {
  mint: string;
  pools: Array<{
    address: string;
    dexName: string | null;
    createdAt: string | null;
    liquidityUsd: number | null;
    feeBps: number | null;
  }>;
};

export class GeckoTerminalClient {
  constructor(
    private readonly baseUrl: string = DEFAULT_GECKOTERMINAL_BASE_URL,
    private readonly httpClient: HttpClient = fetch,
  ) {}

  async fetch(mint: string): Promise<GeckoTerminalFetchResult | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const url = new URL(`/networks/solana/tokens/${normalizedMint}/pools`, this.baseUrl);

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
        throw new Error(`GeckoTerminal fetch failed with status ${response.status}`);
      }

      const payload = parseJson(await response.text());
      const record = asRecord(payload);
      const data = asArray(record?.data);
      const pools = data
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => {
          const attributes = asRecord(entry.attributes);
          return {
            address: asString(entry.id) ?? "",
            dexName: asString(attributes?.dex_name) ?? asString(attributes?.dexName),
            createdAt: asString(attributes?.pool_created_at) ?? asString(attributes?.created_at),
            liquidityUsd: asNumber(attributes?.reserve_in_usd) ?? asNumber(attributes?.liquidity_usd),
            feeBps: asNumber(attributes?.swap_fee_bps) ?? asNumber(attributes?.fee_bps),
          };
        })
        .filter((pool) => pool.address.length > 0);

      return {
        mint: normalizedMint,
        pools,
      };
    }

    return null;
  }
}

