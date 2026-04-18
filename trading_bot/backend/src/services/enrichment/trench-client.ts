import { asArray, asBoolean, asNumber, asRecord, asString } from "../../utils/types.js";

type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_TRENCH_BASE_URL = process.env.TRENCH_BASE_URL ?? "https://api.trench.bot";

function parseJson(text: string): unknown {
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function shouldReturnNull(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}

export type TrenchFetchResult = {
  mint: string;
  bundleSupplyPct: number | null;
  sniperCount: number | null;
  devBundle: boolean | null;
  bundles: Array<{
    wallet: string;
    holdingPct: number | null;
    soldPct: number | null;
  }>;
};

export class TrenchClient {
  constructor(
    private readonly baseUrl: string = DEFAULT_TRENCH_BASE_URL,
    private readonly httpClient: HttpClient = fetch,
  ) {}

  async fetch(mint: string): Promise<TrenchFetchResult | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      throw new Error("mint is required");
    }

    const url = new URL(`/api/v1/bundle/bundle_advanced/${normalizedMint}`, this.baseUrl);
    const response = await this.httpClient(url, { method: "GET", headers: { accept: "application/json" } });
    if (shouldReturnNull(response.status)) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Trench fetch failed with status ${response.status}`);
    }

    const payload = parseJson(await response.text());
    const record = asRecord(payload);
    const bundlesRaw = asArray(record?.bundles);
    const bundles = bundlesRaw
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => ({
        wallet: asString(entry.wallet) ?? asString(entry.address) ?? "",
        holdingPct: asNumber(entry.holdingPct) ?? asNumber(entry.bundleHoldingPct) ?? asNumber(entry.supplyPct),
        soldPct: asNumber(entry.soldPct) ?? asNumber(entry.soldPercent),
      }))
      .filter((entry) => entry.wallet.length > 0);

    return {
      mint: normalizedMint,
      bundleSupplyPct: asNumber(record?.bundleSupplyPct) ?? asNumber(record?.bundle_supply_pct),
      sniperCount: asNumber(record?.sniperCount) ?? asNumber(record?.sniper_count),
      devBundle: asBoolean(record?.devBundle) ?? asBoolean(record?.dev_bundle),
      bundles,
    };
  }
}

