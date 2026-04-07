import Decimal from "decimal.js";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type AccountMeta,
  type AddressLookupTableAccount,
} from "@solana/web3.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import { CircuitBreaker } from "../utils/circuit-breaker.js";
import { SOL_MINT, type MultiPriceResult, type SwapQuote } from "../utils/types.js";
import { loadSolanaKeypair } from "../utils/solana-keypair.js";

const log = createChildLogger("jupiter");

type ParsedMintAccountData = {
  parsed?: {
    info?: {
      decimals?: number;
    };
  };
};

type JupiterTokenMarket = Record<string, unknown>;
type JupiterInstruction = {
  programId: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
};
type JupiterSwapInstructionsResponse = {
  tokenLedgerInstruction?: JupiterInstruction;
  computeBudgetInstructions?: JupiterInstruction[];
  otherInstructions?: JupiterInstruction[];
  setupInstructions?: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction?: JupiterInstruction | null;
  addressLookupTableAddresses?: string[];
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
  private signer = null as ReturnType<typeof loadSolanaKeypair> | null;

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

  private buildHeaders(contentType?: string): Headers {
    const headers = new Headers();
    if (contentType) headers.set("Content-Type", contentType);
    if (config.jupiter.apiKey) headers.set("x-api-key", config.jupiter.apiKey);
    return headers;
  }

  private buildUrl(path: string): URL {
    return new URL(path.replace(/^\//, ""), `${config.jupiter.baseUrl.replace(/\/+$/, "")}/`);
  }

  private async getCategoryTokens(category: string, params?: { interval?: string; limit?: number }): Promise<JupiterTokenMarket[]> {
    try {
      return await this.quoteCb.execute(async () => {
        const interval = params?.interval ?? (category === "recent" ? undefined : "1h");
        const path = interval
          ? `${config.jupiter.tokensPath}/${category}/${interval}`
          : `${config.jupiter.tokensPath}/${category}`;
        const url = this.buildUrl(path);
        if (params?.limit) url.searchParams.set("limit", String(params.limit));

        const data = await fetchJson<JupiterTokenMarket[] | { data?: JupiterTokenMarket[] }>(
          url.toString(),
          { headers: this.buildHeaders() },
          config.api.jupiterTimeoutMs,
        );

        return Array.isArray(data) ? data : data.data ?? [];
      });
    } catch (err) {
      log.warn({ err, category }, "getCategoryTokens failed");
      return [];
    }
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
        const url = this.buildUrl(`${config.jupiter.swapPath}/quote`);
        url.searchParams.set("inputMint", params.inputMint);
        url.searchParams.set("outputMint", params.outputMint);
        url.searchParams.set("amount", String(params.amount));
        url.searchParams.set("slippageBps", String(params.slippageBps));
        url.searchParams.set("swapMode", "ExactIn");
        const data = await fetchJson<SwapQuote>(
          url.toString(),
          { headers: this.buildHeaders() },
          config.api.jupiterTimeoutMs,
        );
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
    options: { priorityFee?: number; blockhash?: string; tipLamports?: number; tipAccount?: string | null },
  ): Promise<string | null> {
    try {
      return await this.executeCb.execute(async () => {
        const signer = this.getSigner();
        const quoteResponse = {
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          inAmount: quote.inAmount,
          outAmount: quote.outAmount,
          priceImpactPct: quote.priceImpactPct,
          slippageBps: quote.slippageBps,
          routePlan: quote.routePlan,
        };

        const data = await fetchJson<JupiterSwapInstructionsResponse>(
          this.buildUrl(`${config.jupiter.swapPath}/swap-instructions`).toString(),
          {
            method: "POST",
            headers: this.buildHeaders("application/json"),
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

        const instructions: TransactionInstruction[] = [
          ...(data.computeBudgetInstructions ?? []).map((instruction) => this.toTransactionInstruction(instruction)),
          ...(data.otherInstructions ?? []).map((instruction) => this.toTransactionInstruction(instruction)),
          ...(data.setupInstructions ?? []).map((instruction) => this.toTransactionInstruction(instruction)),
        ];

        if (data.tokenLedgerInstruction) {
          instructions.push(this.toTransactionInstruction(data.tokenLedgerInstruction));
        }

        instructions.push(this.toTransactionInstruction(data.swapInstruction));

        if (options.tipLamports && options.tipLamports > 0 && options.tipAccount) {
          instructions.push(SystemProgram.transfer({
            fromPubkey: signer.publicKey,
            toPubkey: new PublicKey(options.tipAccount),
            lamports: options.tipLamports,
          }));
        }

        if (data.cleanupInstruction) {
          instructions.push(this.toTransactionInstruction(data.cleanupInstruction));
        }

        const recentBlockhash = options.blockhash ?? (await this.getConnection().getLatestBlockhash("confirmed")).blockhash;
        const lookupTableAccounts = await this.getLookupTableAccounts(data.addressLookupTableAddresses ?? []);
        const message = new TransactionMessage({
          payerKey: signer.publicKey,
          recentBlockhash,
          instructions,
        }).compileToV0Message(lookupTableAccounts);
        const transaction = new VersionedTransaction(message);
        transaction.sign([signer]);
        return Buffer.from(transaction.serialize()).toString("base64");
      });
    } catch (err) {
      log.error({ err }, "buildSwapTransaction failed");
      return null;
    }
  }

  private toTransactionInstruction(instruction: JupiterInstruction): TransactionInstruction {
    const keys: AccountMeta[] = instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    }));

    return new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys,
      data: Buffer.from(instruction.data, "base64"),
    });
  }

  private async getLookupTableAccounts(addresses: string[]): Promise<AddressLookupTableAccount[]> {
    if (addresses.length === 0) return [];

    const lookupTables = await Promise.all(addresses.map(async (address) => {
      const table = await this.getConnection().getAddressLookupTable(new PublicKey(address));
      return table.value;
    }));

    return lookupTables.filter((table): table is AddressLookupTableAccount => table !== null);
  }

  private getSigner() {
    if (!this.signer) {
      this.signer = loadSolanaKeypair(config.solana.privateKey);
    }
    return this.signer;
  }

  async getPricesUsd(tokenAddresses: string[]): Promise<Map<string, MultiPriceResult>> {
    const unique = [...new Set(tokenAddresses.filter(Boolean))];
    const prices = new Map<string, MultiPriceResult>();
    if (unique.length === 0) return prices;

    try {
      return await this.quoteCb.execute(async () => {
        const url = this.buildUrl(config.jupiter.pricePath);
        url.searchParams.set("ids", unique.join(","));
        const data = await fetchJson<Record<string, Record<string, unknown>> | { data?: Record<string, Record<string, unknown>> }>(
          url.toString(),
          { headers: this.buildHeaders() },
          config.api.jupiterTimeoutMs,
        );
        const entries = "data" in data && data.data ? data.data : data;

        for (const [tokenAddress, rawEntry] of Object.entries(entries)) {
          const entry = rawEntry as Record<string, unknown>;
          prices.set(tokenAddress, {
            value: Number(entry.usdPrice ?? entry.price ?? 0),
            priceChange24h: Number(entry.priceChange24h ?? 0),
            liquidity: Number(entry.liquidity ?? 0),
            updateUnixTime: Number(entry.blockId ?? entry.updatedAt ?? 0),
          });
        }

        return prices;
      });
    } catch (err) {
      log.warn({ err, count: unique.length }, "getPricesUsd failed");
      return prices;
    }
  }

  async getTokenPriceUsd(tokenAddress: string): Promise<number | null> {
    const prices = await this.getPricesUsd([tokenAddress]);
    return prices.get(tokenAddress)?.value ?? null;
  }

  async getSolPriceUsd(): Promise<number | null> {
    const now = Date.now();
    if (now - this.solPriceCache.ts < config.api.jupiterSolPriceCacheTtlMs && this.solPriceCache.price > 0) {
      return this.solPriceCache.price;
    }

    const prices = await this.getPricesUsd([SOL_MINT]);
    const price = prices.get(SOL_MINT)?.value ?? null;
    if (price) {
      this.solPriceCache = { price, ts: now };
      return price;
    }

    log.warn("getSolPriceUsd fell back to cached price");
    return this.solPriceCache.price > 0 ? this.solPriceCache.price : null;
  }

  async getTopTrendingTokens(params?: { interval?: string; limit?: number }): Promise<JupiterTokenMarket[]> {
    return this.getCategoryTokens("toptrending", params);
  }

  async getTopTradedTokens(params?: { interval?: string; limit?: number }): Promise<JupiterTokenMarket[]> {
    return this.getCategoryTokens("toptraded", params);
  }

  async getRecentTokens(params?: { limit?: number }): Promise<JupiterTokenMarket[]> {
    return this.getCategoryTokens("recent", params);
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
