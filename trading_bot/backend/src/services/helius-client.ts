import { recordApiEvent, recordRawApiPayload } from "./provider-telemetry.js";
import type { HolderConcentration, MintAuthoritySnapshot } from "../types/domain.js";

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  return 0n;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class HeliusClient {
  constructor(private readonly rpcUrl: string) {}

  private record(
    endpoint: string,
    units: number,
    success: boolean,
    latencyMs: number,
    metadata?: Record<string, unknown>,
  ) {
    recordApiEvent({
      provider: "HELIUS",
      endpoint,
      units,
      success,
      latencyMs,
      metadata,
    });
  }

  private async rpc<T>(method: string, params: unknown[], units: number): Promise<T> {
    const startedAt = Date.now();
    let rawPayloadCaptured = false;

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `${Date.now()}`,
          method,
          params,
        }),
      });

      const latencyMs = Date.now() - startedAt;
      const payload = await parseResponseBody(response) as { result?: T; error?: { message?: string } } | string | null;
      const rpcError = payload && typeof payload === "object" && "error" in payload
        ? payload.error?.message ?? "unknown rpc error"
        : null;
      const responseBody = payload && typeof payload === "object" && "result" in payload
        ? payload.result
        : payload;

      recordRawApiPayload({
        provider: "HELIUS",
        endpoint: method,
        requestMethod: "POST",
        entityKey: typeof params[0] === "string" ? params[0] : null,
        success: response.ok && !rpcError,
        statusCode: response.status,
        latencyMs,
        requestParams: { params },
        responseBody,
        errorMessage: rpcError,
      });
      rawPayloadCaptured = true;

      if (!response.ok || rpcError) {
        this.record(method, units, false, latencyMs, {
          status: response.status,
          error: rpcError ?? "unknown rpc error",
        });
        throw new Error(`Helius ${method} failed: ${rpcError ?? response.status}`);
      }

      this.record(method, units, true, latencyMs);
      return (payload as { result?: T }).result as T;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      if (!rawPayloadCaptured) {
        recordRawApiPayload({
          provider: "HELIUS",
          endpoint: method,
          requestMethod: "POST",
          entityKey: typeof params[0] === "string" ? params[0] : null,
          success: false,
          latencyMs,
          requestParams: { params },
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      this.record(method, units, false, latencyMs, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getMintAuthorities(mint: string): Promise<MintAuthoritySnapshot | null> {
    const result = await this.rpc<{
      value?: {
        data?: {
          parsed?: {
            info?: {
              mintAuthority?: string | null;
              freezeAuthority?: string | null;
              supply?: string;
              decimals?: number;
              isInitialized?: boolean;
            };
          };
        };
      } | null;
    }>(
      "getAccountInfo",
      [mint, { encoding: "jsonParsed", commitment: "confirmed" }],
      1,
    );

    const info = result.value?.data?.parsed?.info;
    if (!info) return null;

    return {
      mintAuthority: info.mintAuthority ?? null,
      freezeAuthority: info.freezeAuthority ?? null,
      supplyRaw: asBigInt(info.supply).toString(),
      decimals: Number(info.decimals ?? 0),
      isInitialized: info.isInitialized !== false,
    };
  }

  async getHolderConcentration(mint: string, supplyRawInput?: string): Promise<HolderConcentration | null> {
    const largestAccounts = await this.rpc<{
      value?: Array<{ address?: string; amount?: string }>;
    }>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }], 1);

    const supplyRaw = asBigInt(supplyRawInput);
    if (supplyRaw <= 0n) return null;

    const values = largestAccounts.value ?? [];
    const topTenRaw = values
      .slice(0, 10)
      .reduce((sum, row) => sum + asBigInt(row.amount), 0n);
    const largestRaw = values.length > 0 ? asBigInt(values[0]?.amount) : 0n;
    const supply = Number(supplyRaw);

    if (!Number.isFinite(supply) || supply <= 0) return null;

    return {
      top10Percent: Number(topTenRaw) / supply * 100,
      largestHolderPercent: Number(largestRaw) / supply * 100,
      largestAccountsCount: values.length,
      largestHolderAddress: typeof values[0]?.address === "string" ? values[0].address : null,
    };
  }
}
