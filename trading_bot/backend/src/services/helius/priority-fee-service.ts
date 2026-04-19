import type { ProviderPurpose, ProviderSource } from "@prisma/client";
import { env } from "../../config/env.js";
import { ProviderBudgetService } from "../provider-budget-service.js";
import { logger } from "../../utils/logger.js";

export type PriorityFeeLane = "entry" | "exit" | "sl";

type PriorityFeeEstimateInput = {
  accounts: string[];
  lane: PriorityFeeLane;
  sessionId?: string | null;
  packId?: string | null;
  configVersion?: number | null;
  mint?: string | null;
  candidateId?: string | null;
  positionId?: string | null;
};

type SlotBudgetService = ProviderBudgetService & {
  requestSlot?: (provider: ProviderSource, purpose: ProviderPurpose, ctx?: Record<string, unknown>) => Promise<unknown>;
  releaseSlot?: (slot: unknown, result: Record<string, unknown>) => Promise<void>;
};

type FetchLike = typeof fetch;

type PriorityFeeDeps = {
  rpcUrl?: string;
  budgetService?: SlotBudgetService;
  fetchImpl?: FetchLike;
  nowMs?: () => number;
};

type HeliusPriorityFeeResponse = {
  jsonrpc?: string;
  id?: string | number;
  result?: {
    priorityFeeEstimate?: number;
    priorityFeeLevels?: {
      min?: number;
      low?: number;
      medium?: number;
      high?: number;
      veryHigh?: number;
      unsafeMax?: number;
    };
  };
  error?: { code?: number; message?: string };
};

type CacheEntry = {
  microLamports: number;
  expiresAtMs: number;
};

const LANE_MULTIPLIER: Record<PriorityFeeLane, number> = {
  entry: 1.5,
  exit: 2,
  sl: 2.5,
};

const CACHE_TTL_MS = 2_000;
const MIN_FEE_MICRO_LAMPORTS = 5_000;

function sanitizeMicroLamports(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return MIN_FEE_MICRO_LAMPORTS;
  }
  return Math.max(MIN_FEE_MICRO_LAMPORTS, Math.round(value));
}

function parseEstimate(payload: HeliusPriorityFeeResponse): number | null {
  const direct = payload.result?.priorityFeeEstimate;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
    return sanitizeMicroLamports(direct);
  }

  const levels = payload.result?.priorityFeeLevels;
  const candidates = [
    levels?.medium,
    levels?.high,
    levels?.veryHigh,
    levels?.low,
    levels?.min,
    levels?.unsafeMax,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return sanitizeMicroLamports(candidate);
    }
  }

  return null;
}

export class HeliusPriorityFeeService {
  private readonly rpcUrl: string;
  private readonly budgetService: SlotBudgetService;
  private readonly fetchImpl: FetchLike;
  private readonly nowMs: () => number;
  private readonly cache = new Map<PriorityFeeLane, CacheEntry>();
  private lastP50 = MIN_FEE_MICRO_LAMPORTS;

  constructor(deps: PriorityFeeDeps = {}) {
    this.rpcUrl = deps.rpcUrl ?? env.HELIUS_RPC_URL;
    this.budgetService = deps.budgetService ?? new ProviderBudgetService();
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.nowMs = deps.nowMs ?? Date.now;
  }

  async estimate(
    accounts: string[],
    lane: PriorityFeeLane,
    context: Omit<PriorityFeeEstimateInput, "accounts" | "lane"> = {},
  ): Promise<number> {
    const now = this.nowMs();
    const cached = this.cache.get(lane);
    if (cached && cached.expiresAtMs > now) {
      return cached.microLamports;
    }

    const slot = await this.safeRequestSlot({
      provider: "HELIUS",
      purpose: "PRIORITY_FEE",
      lane,
      endpoint: "getPriorityFeeEstimate",
      ...context,
    });

    const startedAt = this.nowMs();
    let httpStatus = 500;
    let latencyMs = 0;
    let errorCode: string | null = null;
    let microLamports: number | null = null;

    try {
      const response = await this.fetchImpl(this.rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `${this.nowMs()}`,
          method: "getPriorityFeeEstimate",
          params: [{
            accountKeys: accounts,
            options: {
              recommended: true,
            },
          }],
        }),
      });

      httpStatus = response.status;
      latencyMs = this.nowMs() - startedAt;
      const payload = await response.json() as HeliusPriorityFeeResponse;

      if (!response.ok) {
        const message = payload.error?.message ?? `http_${response.status}`;
        errorCode = message;
        if (response.status >= 500) {
          microLamports = this.fallbackForLane(lane);
        } else {
          throw new Error(message);
        }
      } else if (payload.error?.message) {
        errorCode = payload.error.message;
        throw new Error(payload.error.message);
      } else {
        microLamports = parseEstimate(payload);
        if (microLamports === null) {
          errorCode = "missing_estimate";
          throw new Error("Helius priority fee estimate missing");
        }
      }
    } catch (error) {
      latencyMs = latencyMs > 0 ? latencyMs : this.nowMs() - startedAt;
      if (microLamports === null) {
        throw error;
      }
      logger.warn(
        { err: error, lane, fallbackMicroLamports: microLamports },
        "priority fee estimate fallback path used after Helius 5xx",
      );
    } finally {
      const finalMicroLamports = sanitizeMicroLamports(microLamports ?? this.fallbackForLane(lane));
      this.lastP50 = finalMicroLamports;
      this.cache.set(lane, {
        microLamports: finalMicroLamports,
        expiresAtMs: this.nowMs() + CACHE_TTL_MS,
      });

      await this.safeReleaseSlot(slot, {
        provider: "HELIUS",
        endpoint: "getPriorityFeeEstimate",
        purpose: "PRIORITY_FEE",
        creditsUsed: 1,
        httpStatus,
        latencyMs,
        errorCode,
      });
    }

    return this.cache.get(lane)?.microLamports ?? this.fallbackForLane(lane);
  }

  private fallbackForLane(lane: PriorityFeeLane): number {
    const multiplier = LANE_MULTIPLIER[lane];
    return sanitizeMicroLamports(Math.max(MIN_FEE_MICRO_LAMPORTS, this.lastP50 * multiplier));
  }

  private async safeRequestSlot(ctx: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.budgetService.requestSlot?.("HELIUS", "PRIORITY_FEE", ctx);
    } catch (error) {
      logger.warn({ err: error, ctx }, "provider budget requestSlot failed open for priority fee");
      return null;
    }
  }

  private async safeReleaseSlot(slot: unknown, result: Record<string, unknown>): Promise<void> {
    if (!slot || !this.budgetService.releaseSlot) {
      return;
    }
    try {
      const slotId = typeof slot === "object" && slot !== null && "id" in slot && typeof slot.id === "string"
        ? slot.id
        : null;
      if (!slotId) {
        return;
      }
      await this.budgetService.releaseSlot(slotId, result);
    } catch (error) {
      logger.warn({ err: error, result }, "provider budget releaseSlot failed open for priority fee");
    }
  }

}
