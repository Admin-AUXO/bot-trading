import Decimal from "decimal.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import { CircuitBreaker } from "../utils/circuit-breaker.js";
import { SOL_MINT, type SwapQuote } from "../utils/types.js";

const log = createChildLogger("jupiter");

const JUPITER_API = "https://quote-api.jup.ag/v6";

type ParsedMintAccountData = {
  parsed?: {
    info?: {
      decimals?: number;
    };
  };
};

class JupiterHttpError extends Error {
  constructor(public status: number, statusText: string) {
    super(`Jupiter HTTP ${status}: ${statusText}`);
  }
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new JupiterHttpError(res.status, res.statusText);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export class JupiterService {
  private solPriceCache: { price: number; ts: number } = { price: 0, ts: 0 };
  private quoteCb: CircuitBreaker;
  private executeCb: CircuitBreaker;
  private connection: Connection | null = null;
  private mintDecimals = new Map<string, number>();

  constructor() {
    this.quoteCb = new CircuitBreaker(
      "jupiter-quote",
      config.circuitBreaker.jupiterQuote.failureThreshold,
      config.circuitBreaker.jupiterQuote.cooldownMs,
      config.circuitBreaker.jupiterQuote.halfOpenMax,
    );
    this.executeCb = new CircuitBreaker(
      "jupiter-execute",
      config.circuitBreaker.jupiterExecute.failureThreshold,
      config.circuitBreaker.jupiterExecute.cooldownMs,
      config.circuitBreaker.jupiterExecute.halfOpenMax,
    );
  }

  private getConnection(): Connection {
    if (this.connection) return this.connection;

    const rpcUrl =
      process.env.HELIUS_RPC_URL ??
      process.env.HELIUS_RPC_HTTP_URL ??
      process.env.SOLANA_RPC_URL ??
      process.env.RPC_URL;
    if (!rpcUrl) {
      throw new Error("missing Solana RPC URL for mint decimal normalization");
    }

    this.connection = new Connection(rpcUrl, "confirmed");
    return this.connection;
  }

  private async getMintDecimals(mint: string): Promise<number | null> {
    const cached = this.mintDecimals.get(mint);
    if (cached !== undefined) return cached;

    try {
      const account = await this.getConnection().getParsedAccountInfo(new PublicKey(mint));
      const parsed = account.value?.data as ParsedMintAccountData | undefined;
      const decimals = parsed?.parsed?.info?.decimals;
      if (typeof decimals !== "number") {
        throw new Error("missing mint decimals");
      }
      this.mintDecimals.set(mint, decimals);
      return decimals;
    } catch (err) {
      log.warn({ err, mint }, "failed to load mint decimals");
      return null;
    }
  }

  async toBaseUnits(mint: string, amountUi: number): Promise<number | null> {
    const decimals = await this.getMintDecimals(mint);
    if (decimals === null) return null;
    return new Decimal(amountUi).mul(new Decimal(10).pow(decimals)).floor().toNumber();
  }

  async toUiAmount(mint: string, amountBase: string | number): Promise<number | null> {
    const decimals = await this.getMintDecimals(mint);
    if (decimals === null) return null;
    return new Decimal(amountBase).div(new Decimal(10).pow(decimals)).toNumber();
  }

  private async normalizeQuote(quote: SwapQuote): Promise<SwapQuote> {
    const [inputDecimals, outputDecimals, inputAmountUi, outputAmountUi] = await Promise.all([
      this.getMintDecimals(quote.inputMint),
      this.getMintDecimals(quote.outputMint),
      this.toUiAmount(quote.inputMint, quote.inAmount),
      this.toUiAmount(quote.outputMint, quote.outAmount),
    ]);

    if (
      inputDecimals === null ||
      outputDecimals === null ||
      inputAmountUi === null ||
      outputAmountUi === null
    ) {
      throw new Error("failed to normalize Jupiter quote amounts");
    }

    return {
      ...quote,
      inputDecimals,
      outputDecimals,
      inputAmountUi,
      outputAmountUi,
    };
  }

  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
  }): Promise<SwapQuote | null> {
    try {
      return await this.quoteCb.execute(async () => {
        const url = new URL(`${JUPITER_API}/quote`);
        url.searchParams.set("inputMint", params.inputMint);
        url.searchParams.set("outputMint", params.outputMint);
        url.searchParams.set("amount", String(params.amount));
        url.searchParams.set("slippageBps", String(params.slippageBps));
        url.searchParams.set("swapMode", "ExactIn");
        const data = await fetchJson<SwapQuote>(url.toString(), {}, config.api.jupiterTimeoutMs);
        if (!data?.inAmount || !data?.outAmount) {
          throw new Error("Invalid quote response: missing inAmount or outAmount");
        }
        return this.normalizeQuote(data);
      });
    } catch (err) {
      log.error({ err }, "getQuote failed");
      return null;
    }
  }

  async buildSwapTransaction(
    quote: SwapQuote,
    options: { priorityFee?: number; blockhash?: string },
  ): Promise<string | null> {
    try {
      return await this.executeCb.execute(async () => {
        const quoteResponse = {
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          inAmount: quote.inAmount,
          outAmount: quote.outAmount,
          priceImpactPct: quote.priceImpactPct,
          slippageBps: quote.slippageBps,
          routePlan: quote.routePlan,
        };

        const data = await fetchJson<{ swapTransaction?: string }>(
          `${JUPITER_API}/swap`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quoteResponse,
              userPublicKey: config.solana.publicKey,
              wrapAndUnwrapSol: true,
              computeUnitPriceMicroLamports: options.priorityFee ?? config.api.heliusPriorityFeeFallback,
              dynamicComputeUnitLimit: true,
            }),
          },
          config.api.jupiterTimeoutMs,
        );
        if (!data?.swapTransaction) {
          throw new Error("Invalid swap response: missing swapTransaction");
        }
        return data.swapTransaction;
      });
    } catch (err) {
      log.error({ err }, "buildSwapTransaction failed");
      return null;
    }
  }

  async getTokenPriceUsd(tokenAddress: string): Promise<number | null> {
    try {
      return await this.quoteCb.execute(async () => {
        const url = new URL("https://price.jup.ag/v6/price");
        url.searchParams.set("ids", tokenAddress);
        const data = await fetchJson<{ data?: Record<string, { price?: number }> }>(
          url.toString(), {}, config.api.jupiterTimeoutMs,
        );
        const price = data?.data?.[tokenAddress]?.price;
        if (!price) throw new Error("Invalid price response: missing price data");
        return price;
      });
    } catch (err) {
      log.warn({ err, tokenAddress }, "getTokenPriceUsd failed");
      return null;
    }
  }

  async getSolPriceUsd(): Promise<number | null> {
    const now = Date.now();
    if (now - this.solPriceCache.ts < config.api.jupiterSolPriceCacheTtlMs && this.solPriceCache.price > 0) {
      return this.solPriceCache.price;
    }

    try {
      return await this.quoteCb.execute(async () => {
        const url = new URL("https://price.jup.ag/v6/price");
        url.searchParams.set("ids", SOL_MINT);
        const data = await fetchJson<{ data?: Record<string, { price?: number }> }>(
          url.toString(), {}, config.api.jupiterTimeoutMs,
        );
        const price = data?.data?.[SOL_MINT]?.price;
        if (!price) throw new Error("Invalid SOL price response: missing price data");
        this.solPriceCache = { price, ts: now };
        return price;
      });
    } catch (err) {
      log.warn({ err }, "getSolPriceUsd failed");
      return this.solPriceCache.price > 0 ? this.solPriceCache.price : null;
    }
  }

  async getQuoteForPriceCheck(tokenAddress: string, amountLamports: number = 1_000_000): Promise<number | null> {
    try {
      return await this.quoteCb.execute(async () => {
        const quote = await this.getQuote({
          inputMint: tokenAddress,
          outputMint: SOL_MINT,
          amount: amountLamports,
          slippageBps: 300,
        });
        if (!quote) throw new Error("Failed to get quote for price check");
        return quote.outputAmountUi / quote.inputAmountUi;
      });
    } catch (err) {
      log.warn({ err, tokenAddress }, "getQuoteForPriceCheck failed");
      return null;
    }
  }
}
