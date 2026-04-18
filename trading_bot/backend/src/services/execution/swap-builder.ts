import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { env } from "../../config/env.js";
import type { JupiterQuote } from "./quote-builder.js";

type FetchLike = typeof fetch;

type SwapBuilderDeps = {
  jupiterBaseUrl?: string;
  fetchImpl?: FetchLike;
  nowMs?: () => number;
};

type JupiterSwapResponse = {
  swapTransaction?: string;
  error?: string;
  [key: string]: unknown;
};

export type BuildSwapInput = {
  quote: JupiterQuote;
  wallet: Keypair;
  priorityFeeMicroLamports: number;
};

export class SwapBuilder {
  private readonly jupiterBaseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly nowMs: () => number;

  constructor(deps: SwapBuilderDeps = {}) {
    this.jupiterBaseUrl = deps.jupiterBaseUrl ?? env.LIVE_JUPITER_API_BASE_URL;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.nowMs = deps.nowMs ?? Date.now;
  }

  async build(input: BuildSwapInput): Promise<VersionedTransaction | null> {
    const buildStartedAtMs = this.nowMs();
    const quoteAgeAtBuildStart = buildStartedAtMs - input.quote.fetchedAtMs;
    if (quoteAgeAtBuildStart >= 800) {
      return null;
    }

    const response = await this.fetchImpl(`${this.jupiterBaseUrl}/swap`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.jupiterHeaders(),
      },
      body: JSON.stringify({
        quoteResponse: input.quote.raw,
        userPublicKey: input.wallet.publicKey.toBase58(),
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          computeBudget: {
            microLamports: Math.max(5_000, Math.round(input.priorityFeeMicroLamports)),
          },
        },
      }),
    });

    const payload = await response.json() as JupiterSwapResponse;
    if (!response.ok || !payload.swapTransaction) {
      return null;
    }

    const transaction = VersionedTransaction.deserialize(Buffer.from(payload.swapTransaction, "base64"));
    if (this.nowMs() - input.quote.fetchedAtMs >= 800) {
      return null;
    }

    transaction.sign([input.wallet]);
    return transaction;
  }

  private jupiterHeaders(): Record<string, string> {
    return env.JUPITER_API_KEY ? { "x-api-key": env.JUPITER_API_KEY } : {};
  }
}
