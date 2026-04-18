import type { ProviderPurpose, ProviderSource } from "@prisma/client";
import { env } from "../../config/env.js";
import { ProviderBudgetService } from "../provider-budget-service.js";
import { logger } from "../../utils/logger.js";

export type QuoteSide = "BUY" | "SELL";

export type PackRecipeRouting = {
  dexes?: string[];
};

export type PackRecipe = {
  id?: string;
  routing?: PackRecipeRouting;
};

export type BuildQuoteInput = {
  mint: string;
  side: QuoteSide;
  lamportAmount: number | bigint;
  mcUsd: number;
  packRecipe?: PackRecipe | null;
  sessionId?: string | null;
  candidateId?: string | null;
  positionId?: string | null;
};

type SlotBudgetService = ProviderBudgetService & {
  requestSlot?: (provider: ProviderSource, purpose: ProviderPurpose, ctx?: Record<string, unknown>) => Promise<unknown>;
  releaseSlot?: (slot: unknown, result: Record<string, unknown>) => Promise<void>;
};

type FetchLike = typeof fetch;

type QuoteBuilderDeps = {
  jupiterBaseUrl?: string;
  quoteMint?: string;
  budgetService?: SlotBudgetService;
  fetchImpl?: FetchLike;
  nowMs?: () => number;
};

type QuoteRouteLeg = {
  percent?: number;
  swapInfo?: {
    ammKey?: string;
    label?: string;
    inputMint?: string;
    outputMint?: string;
    inAmount?: string;
    outAmount?: string;
    feeAmount?: string;
    feeMint?: string;
  };
};

export type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold?: string;
  priceImpactPct: number;
  routePlan: QuoteRouteLeg[];
  slippageBps: number;
  slippageCapBps: number;
  maxAccounts: number;
  tierBucket: string;
  fetchedAtMs: number;
  raw: Record<string, unknown>;
};

type JupiterQuoteResponse = {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  otherAmountThreshold?: string;
  priceImpactPct?: string;
  routePlan?: QuoteRouteLeg[];
  slippageBps?: number;
  error?: string;
  [key: string]: unknown;
};

type TierConfig = {
  maxMcUsd: number;
  bucket: string;
  baseSlippageBps: number;
  maxSlippageBps: number;
  maxAccounts: number;
  maxImpactBps: number;
  priorityLevel: "veryHigh" | "high" | "medium";
};

const DEFAULT_DEX_ALLOWLIST = ["Raydium", "Meteora", "Pump.fun", "Orca", "Phoenix", "Lifinity"];
const SOL_MINT = "So11111111111111111111111111111111111111112";

const MC_TIERS: TierConfig[] = [
  { maxMcUsd: 10_000, bucket: "lte_10k", baseSlippageBps: 500, maxSlippageBps: 1500, maxAccounts: 24, maxImpactBps: 1500, priorityLevel: "veryHigh" },
  { maxMcUsd: 50_000, bucket: "10k_50k", baseSlippageBps: 300, maxSlippageBps: 800, maxAccounts: 24, maxImpactBps: 800, priorityLevel: "veryHigh" },
  { maxMcUsd: 250_000, bucket: "50k_250k", baseSlippageBps: 150, maxSlippageBps: 400, maxAccounts: 40, maxImpactBps: 400, priorityLevel: "high" },
  { maxMcUsd: 1_000_000, bucket: "250k_1m", baseSlippageBps: 100, maxSlippageBps: 250, maxAccounts: 40, maxImpactBps: 250, priorityLevel: "high" },
  { maxMcUsd: 10_000_000, bucket: "1m_10m", baseSlippageBps: 75, maxSlippageBps: 150, maxAccounts: 40, maxImpactBps: 150, priorityLevel: "medium" },
  { maxMcUsd: Number.POSITIVE_INFINITY, bucket: "gte_10m", baseSlippageBps: 50, maxSlippageBps: 100, maxAccounts: 40, maxImpactBps: 100, priorityLevel: "medium" },
];

function parseImpactToBps(priceImpactPct: string | undefined): number {
  if (!priceImpactPct) {
    return 0;
  }
  const parsed = Number(priceImpactPct);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  if (parsed <= 1) {
    return Math.round(parsed * 10_000);
  }
  return Math.round(parsed * 100);
}

function toLamportAmount(input: number | bigint): string {
  if (typeof input === "bigint") {
    if (input <= 0n) {
      throw new Error("lamportAmount must be positive");
    }
    return input.toString();
  }
  if (!Number.isFinite(input) || input <= 0) {
    throw new Error("lamportAmount must be positive");
  }
  return Math.floor(input).toString();
}

function resolveTier(mcUsd: number): TierConfig {
  for (const tier of MC_TIERS) {
    if (mcUsd <= tier.maxMcUsd) {
      return tier;
    }
  }
  return MC_TIERS[MC_TIERS.length - 1]!;
}

export class QuoteBuilder {
  private readonly jupiterBaseUrl: string;
  private readonly quoteMint: string;
  private readonly budgetService: SlotBudgetService;
  private readonly fetchImpl: FetchLike;
  private readonly nowMs: () => number;

  constructor(deps: QuoteBuilderDeps = {}) {
    this.jupiterBaseUrl = deps.jupiterBaseUrl ?? env.LIVE_JUPITER_API_BASE_URL;
    this.quoteMint = deps.quoteMint ?? env.LIVE_QUOTE_MINT;
    this.budgetService = deps.budgetService ?? new ProviderBudgetService();
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.nowMs = deps.nowMs ?? Date.now;
  }

  async build(input: BuildQuoteInput): Promise<JupiterQuote | null> {
    const amount = toLamportAmount(input.lamportAmount);
    const tier = resolveTier(input.mcUsd);
    const dexes = input.packRecipe?.routing?.dexes?.length
      ? input.packRecipe.routing.dexes
      : DEFAULT_DEX_ALLOWLIST;
    const [inputMint, outputMint] = input.side === "BUY"
      ? [this.quoteMint, input.mint]
      : [input.mint, this.quoteMint];

    const slot = await this.safeRequestSlot("JUPITER", "EVALUATE", {
      endpoint: "quote",
      mint: input.mint,
      side: input.side,
      packId: input.packRecipe?.id ?? null,
      sessionId: input.sessionId ?? null,
      candidateId: input.candidateId ?? null,
      positionId: input.positionId ?? null,
    });

    const startedAt = this.nowMs();
    let statusCode = 500;
    let errorCode: string | null = null;

    try {
      const url = new URL(`${this.jupiterBaseUrl}/quote`);
      url.searchParams.set("inputMint", inputMint);
      url.searchParams.set("outputMint", outputMint);
      url.searchParams.set("amount", amount);
      url.searchParams.set("swapMode", "ExactIn");
      url.searchParams.set("onlyDirectRoutes", "false");
      url.searchParams.set("restrictIntermediateTokens", "true");
      url.searchParams.set("slippageBps", String(tier.baseSlippageBps));
      url.searchParams.set("maxAccounts", String(tier.maxAccounts));
      url.searchParams.set("dexes", dexes.join(","));
      url.searchParams.set("asLegacyTransaction", "false");
      url.searchParams.set("dynamicSlippage", "true");
      url.searchParams.set("dynamicSlippageMaxBps", String(tier.maxSlippageBps));
      url.searchParams.set("pricePriorityLevel", tier.priorityLevel);

      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: this.jupiterHeaders(),
      });
      statusCode = response.status;
      const payload = await response.json() as JupiterQuoteResponse;

      if (!response.ok) {
        errorCode = payload.error ?? `http_${response.status}`;
        return null;
      }

      const routePlan = Array.isArray(payload.routePlan) ? payload.routePlan : [];
      if (!payload.outAmount || routePlan.length === 0 || !payload.inputMint || !payload.outputMint || !payload.inAmount) {
        errorCode = "no_route";
        return null;
      }

      const impactBps = parseImpactToBps(payload.priceImpactPct);
      if (impactBps > tier.maxImpactBps) {
        errorCode = "impact_too_high";
        return null;
      }

      return {
        inputMint: payload.inputMint,
        outputMint: payload.outputMint,
        inAmount: payload.inAmount,
        outAmount: payload.outAmount,
        otherAmountThreshold: payload.otherAmountThreshold,
        priceImpactPct: Number(payload.priceImpactPct ?? "0"),
        routePlan,
        slippageBps: Number(payload.slippageBps ?? tier.baseSlippageBps),
        slippageCapBps: tier.maxSlippageBps,
        maxAccounts: tier.maxAccounts,
        tierBucket: tier.bucket,
        fetchedAtMs: this.nowMs(),
        raw: payload,
      };
    } catch (error) {
      errorCode = error instanceof Error ? error.message : "unknown_error";
      logger.warn({ err: error, mint: input.mint, side: input.side }, "quote builder failed");
      return null;
    } finally {
      const latencyMs = Math.max(0, this.nowMs() - startedAt);
      await this.safeReleaseSlot(slot, {
        provider: "JUPITER",
        endpoint: "quote",
        purpose: "EVALUATE",
        creditsUsed: 0,
        httpStatus: statusCode,
        latencyMs,
        errorCode,
      });
    }
  }

  private jupiterHeaders(): Record<string, string> {
    return env.JUPITER_API_KEY ? { "x-api-key": env.JUPITER_API_KEY } : {};
  }

  private async safeRequestSlot(
    provider: ProviderSource,
    purpose: ProviderPurpose,
    ctx: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      return await this.budgetService.requestSlot?.(provider, purpose, ctx);
    } catch (error) {
      logger.warn({ err: error, provider, purpose }, "provider budget requestSlot failed open in quote builder");
      return null;
    }
  }

  private async safeReleaseSlot(slot: unknown, result: Record<string, unknown>): Promise<void> {
    if (!slot || !this.budgetService.releaseSlot) {
      return;
    }
    try {
      await this.budgetService.releaseSlot(slot, result);
    } catch (error) {
      logger.warn({ err: error, result }, "provider budget releaseSlot failed open in quote builder");
    }
  }
}

export const QUOTE_BUILDER_DEFAULTS = {
  defaultDexAllowlist: DEFAULT_DEX_ALLOWLIST,
  defaultInputMint: SOL_MINT,
  mcTiers: MC_TIERS,
};
