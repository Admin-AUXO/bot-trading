import bs58 from "bs58";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { env } from "../config/env.js";

const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD1H7mX9w8C7eE3L6ZB3bqx";

const SENDER_TIP_ACCOUNTS = [
  "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
  "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
  "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
  "5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn",
  "2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD",
  "2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ",
  "wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF",
  "3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT",
  "4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey",
  "4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or",
];

type JupiterQuoteResponse = {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  routePlan?: unknown[];
  slippageBps?: number;
};

type JupiterSwapResponse = {
  swapTransaction?: string;
};

type TokenBalanceDelta = {
  preRaw: bigint;
  postRaw: bigint;
  decimals: number;
};

export type LiveTradeExecution = {
  signature: string;
  entryPriceUsd: number;
  amountUsd: string;
  amountToken: string;
  tokenDecimals: number;
  quoteMint: string;
  quoteDecimals: number;
  metadata: Record<string, unknown>;
};

function parseSecretKey(secret: string): Uint8Array {
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as number[];
    return Uint8Array.from(parsed);
  }
  return bs58.decode(trimmed);
}

function rawUnitsToDecimalString(raw: bigint, decimals: number): string {
  const sign = raw < 0n ? "-" : "";
  const absolute = raw < 0n ? raw * -1n : raw;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;

  if (decimals === 0) {
    return `${sign}${whole.toString()}`;
  }

  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (!fractionText) {
    return `${sign}${whole.toString()}`;
  }

  return `${sign}${whole.toString()}.${fractionText}`;
}

function decimalToRawUnits(value: string | number, decimals: number): bigint {
  const text = typeof value === "number" ? value.toString() : value;
  const normalized = text.trim();
  if (!normalized) return 0n;

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const scaledFraction = `${fractionPart}${"0".repeat(decimals)}`.slice(0, decimals);
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt(scaledFraction || "0");
  const raw = (whole * (10n ** BigInt(decimals))) + fraction;
  return negative ? raw * -1n : raw;
}

function parsedAccountKeyToString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "pubkey" in value) {
    const pubkey = (value as { pubkey?: unknown }).pubkey;
    if (typeof pubkey === "string") return pubkey;
    if (pubkey instanceof PublicKey) return pubkey.toBase58();
  }
  return null;
}

function isStableQuoteMint(mint: string): boolean {
  return mint === DEFAULT_USDC_MINT || mint === DEFAULT_USDT_MINT;
}

function tokenBalanceSumRaw(
  balances: Array<{
    mint?: string;
    owner?: string;
    uiTokenAmount?: { amount?: string; decimals?: number };
  }> | null | undefined,
  owner: string,
  mint: string,
): TokenBalanceDelta {
  let total = 0n;
  let decimals = 0;

  for (const balance of balances ?? []) {
    if (balance.owner !== owner || balance.mint !== mint) continue;
    total += BigInt(balance.uiTokenAmount?.amount ?? "0");
    decimals = Number(balance.uiTokenAmount?.decimals ?? decimals);
  }

  return {
    preRaw: total,
    postRaw: total,
    decimals,
  };
}

function getWalletLamportsDelta(transaction: ParsedTransactionWithMeta | null, owner: string): bigint {
  if (!transaction?.meta) return 0n;
  const index = transaction.transaction.message.accountKeys.findIndex((key) => parsedAccountKeyToString(key) === owner);
  if (index < 0) return 0n;

  const pre = BigInt(transaction.meta.preBalances[index] ?? 0);
  const post = BigInt(transaction.meta.postBalances[index] ?? 0);
  return post - pre;
}

function toDecimalNumber(rawAmount: string | null | undefined, decimals: number): number | null {
  if (!rawAmount) return null;
  try {
    return Number(rawUnitsToDecimalString(BigInt(rawAmount), decimals));
  } catch {
    return null;
  }
}

function toBpsFromShortfall(
  quotedOutAmount: number | null,
  actualOutAmount: number | null,
): number | null {
  if (!Number.isFinite(quotedOutAmount) || !Number.isFinite(actualOutAmount)) {
    return null;
  }
  if ((quotedOutAmount ?? 0) <= 0 || (actualOutAmount ?? 0) <= 0) {
    return null;
  }
  const shortfallRatio = ((quotedOutAmount ?? 0) - (actualOutAmount ?? 0)) / (quotedOutAmount ?? 0);
  return Math.round(shortfallRatio * 10_000 * 100) / 100;
}

export function getLiveTradingReadiness(): { ready: boolean; reason?: string } {
  if (!env.TRADING_WALLET_PRIVATE_KEY_B58) {
    return { ready: false, reason: "TRADING_WALLET_PRIVATE_KEY_B58 is not configured" };
  }

  try {
    parseSecretKey(env.TRADING_WALLET_PRIVATE_KEY_B58);
  } catch {
    return { ready: false, reason: "TRADING_WALLET_PRIVATE_KEY_B58 is not valid base58 or JSON key material" };
  }

  if (!isStableQuoteMint(env.LIVE_QUOTE_MINT)) {
    return {
      ready: false,
      reason: `LIVE_QUOTE_MINT must be a supported stable mint for USD accounting (current: ${env.LIVE_QUOTE_MINT})`,
    };
  }

  return { ready: true };
}

export class LiveTradeExecutor {
  private readonly connection = new Connection(env.HELIUS_RPC_URL, "confirmed");
  private readonly wallet = env.TRADING_WALLET_PRIVATE_KEY_B58
    ? Keypair.fromSecretKey(parseSecretKey(env.TRADING_WALLET_PRIVATE_KEY_B58))
    : null;

  isConfigured(): boolean {
    return getLiveTradingReadiness().ready;
  }

  getWalletAddress(): string | null {
    return this.wallet?.publicKey.toBase58() ?? null;
  }

  async executeBuy(input: {
    mint: string;
    budgetUsd: number;
    tokenDecimalsHint?: number | null;
  }): Promise<LiveTradeExecution> {
    const startedAtMs = Date.now();
    const wallet = this.requireWallet();
    const quoteMint = env.LIVE_QUOTE_MINT;
    const quoteDecimals = env.LIVE_QUOTE_DECIMALS;
    const quoteAmountRaw = decimalToRawUnits(input.budgetUsd.toFixed(6), quoteDecimals);

    if (quoteAmountRaw <= 0n) {
      throw new Error("live buy budget must be positive");
    }

    await this.ensureWalletFunding(quoteMint, quoteAmountRaw);

    const quoteStartedAtMs = Date.now();
    const quote = await this.getQuote({
      inputMint: quoteMint,
      outputMint: input.mint,
      amount: quoteAmountRaw.toString(),
      slippageBps: env.LIVE_SLIPPAGE_BPS,
    });
    const quoteCompletedAtMs = Date.now();
    const swapStartedAtMs = quoteCompletedAtMs;
    const swap = await this.getSwapTransaction(quote, wallet.publicKey.toBase58());
    const swapCompletedAtMs = Date.now();
    const senderBuildStartedAtMs = swapCompletedAtMs;
    const senderTx = await this.buildSenderTransaction(swap, wallet);
    const senderBuildCompletedAtMs = Date.now();
    const broadcastStartedAtMs = senderBuildCompletedAtMs;
    const signature = await this.broadcastTransaction(senderTx);
    const broadcastCompletedAtMs = Date.now();
    const settlementStartedAtMs = broadcastCompletedAtMs;
    const settled = await this.parseSettlement({
      signature,
      walletAddress: wallet.publicKey.toBase58(),
      baseMint: input.mint,
      quoteMint,
      fallbackBaseRaw: BigInt(quote.outAmount ?? "0"),
      fallbackQuoteRaw: BigInt(quote.inAmount ?? quoteAmountRaw.toString()),
      baseDecimalsHint: input.tokenDecimalsHint ?? 0,
      quoteDecimalsHint: quoteDecimals,
      side: "BUY",
    });
    const settlementCompletedAtMs = Date.now();
    const quotedInAmountRaw = quote.inAmount ?? quoteAmountRaw.toString();
    const quotedOutAmountRaw = quote.outAmount ?? null;
    const actualInAmountRaw = settled.quoteAmountRaw;
    const actualOutAmountRaw = settled.baseAmountRaw;
    const quotedOutAmountToken = toDecimalNumber(quotedOutAmountRaw, settled.baseDecimals);
    const actualOutAmountToken = Number(settled.baseAmount);
    const executionSlippageBps = toBpsFromShortfall(quotedOutAmountToken, actualOutAmountToken);

    return {
      signature,
      entryPriceUsd: Number(settled.quoteAmount) / Math.max(Number(settled.baseAmount), Number.EPSILON),
      amountUsd: settled.quoteAmount,
      amountToken: settled.baseAmount,
      tokenDecimals: settled.baseDecimals,
      quoteMint,
      quoteDecimals,
      metadata: {
        mode: "LIVE",
        wallet: wallet.publicKey.toBase58(),
        quoteMint,
        quoteDecimals,
        quotedInAmountRaw,
        quotedOutAmountRaw,
        actualInAmountRaw,
        actualOutAmountRaw,
        quotedOutAmountToken,
        actualOutAmountToken,
        executionSlippageBps,
        quoteSlippageBps: quote.slippageBps ?? env.LIVE_SLIPPAGE_BPS,
        senderUrl: env.LIVE_HELIUS_SENDER_URL,
        walletLamportsDelta: settled.walletLamportsDelta,
        timing: {
          startedAt: new Date(startedAtMs).toISOString(),
          completedAt: new Date(settlementCompletedAtMs).toISOString(),
          totalMs: settlementCompletedAtMs - startedAtMs,
          quoteMs: quoteCompletedAtMs - quoteStartedAtMs,
          swapBuildMs: swapCompletedAtMs - swapStartedAtMs,
          senderBuildMs: senderBuildCompletedAtMs - senderBuildStartedAtMs,
          broadcastAndConfirmMs: broadcastCompletedAtMs - broadcastStartedAtMs,
          settlementReadMs: settlementCompletedAtMs - settlementStartedAtMs,
        },
      },
    };
  }

  async executeSell(input: {
    mint: string;
    tokenAmount: string;
    tokenDecimals: number;
  }): Promise<LiveTradeExecution> {
    const startedAtMs = Date.now();
    const wallet = this.requireWallet();
    const quoteMint = env.LIVE_QUOTE_MINT;
    const quoteDecimals = env.LIVE_QUOTE_DECIMALS;
    const baseAmountRaw = decimalToRawUnits(input.tokenAmount, input.tokenDecimals);

    if (baseAmountRaw <= 0n) {
      throw new Error("live sell amount must be positive");
    }

    await this.ensureWalletFunding(quoteMint, 0n);
    await this.ensureTokenBalance(input.mint, baseAmountRaw);

    const quoteStartedAtMs = Date.now();
    const quote = await this.getQuote({
      inputMint: input.mint,
      outputMint: quoteMint,
      amount: baseAmountRaw.toString(),
      slippageBps: env.LIVE_SLIPPAGE_BPS,
    });
    const quoteCompletedAtMs = Date.now();
    const swapStartedAtMs = quoteCompletedAtMs;
    const swap = await this.getSwapTransaction(quote, wallet.publicKey.toBase58());
    const swapCompletedAtMs = Date.now();
    const senderBuildStartedAtMs = swapCompletedAtMs;
    const senderTx = await this.buildSenderTransaction(swap, wallet);
    const senderBuildCompletedAtMs = Date.now();
    const broadcastStartedAtMs = senderBuildCompletedAtMs;
    const signature = await this.broadcastTransaction(senderTx);
    const broadcastCompletedAtMs = Date.now();
    const settlementStartedAtMs = broadcastCompletedAtMs;
    const settled = await this.parseSettlement({
      signature,
      walletAddress: wallet.publicKey.toBase58(),
      baseMint: input.mint,
      quoteMint,
      fallbackBaseRaw: BigInt(quote.inAmount ?? baseAmountRaw.toString()),
      fallbackQuoteRaw: BigInt(quote.outAmount ?? "0"),
      baseDecimalsHint: input.tokenDecimals,
      quoteDecimalsHint: quoteDecimals,
      side: "SELL",
    });
    const settlementCompletedAtMs = Date.now();
    const quotedInAmountRaw = quote.inAmount ?? baseAmountRaw.toString();
    const quotedOutAmountRaw = quote.outAmount ?? null;
    const actualInAmountRaw = settled.baseAmountRaw;
    const actualOutAmountRaw = settled.quoteAmountRaw;
    const quotedOutAmountUsd = toDecimalNumber(quotedOutAmountRaw, quoteDecimals);
    const actualOutAmountUsd = Number(settled.quoteAmount);
    const executionSlippageBps = toBpsFromShortfall(quotedOutAmountUsd, actualOutAmountUsd);

    return {
      signature,
      entryPriceUsd: Number(settled.quoteAmount) / Math.max(Number(settled.baseAmount), Number.EPSILON),
      amountUsd: settled.quoteAmount,
      amountToken: settled.baseAmount,
      tokenDecimals: settled.baseDecimals,
      quoteMint,
      quoteDecimals,
      metadata: {
        mode: "LIVE",
        wallet: wallet.publicKey.toBase58(),
        quoteMint,
        quoteDecimals,
        quotedInAmountRaw,
        quotedOutAmountRaw,
        actualInAmountRaw,
        actualOutAmountRaw,
        quotedOutAmountUsd,
        actualOutAmountUsd,
        executionSlippageBps,
        quoteSlippageBps: quote.slippageBps ?? env.LIVE_SLIPPAGE_BPS,
        senderUrl: env.LIVE_HELIUS_SENDER_URL,
        walletLamportsDelta: settled.walletLamportsDelta,
        timing: {
          startedAt: new Date(startedAtMs).toISOString(),
          completedAt: new Date(settlementCompletedAtMs).toISOString(),
          totalMs: settlementCompletedAtMs - startedAtMs,
          quoteMs: quoteCompletedAtMs - quoteStartedAtMs,
          swapBuildMs: swapCompletedAtMs - swapStartedAtMs,
          senderBuildMs: senderBuildCompletedAtMs - senderBuildStartedAtMs,
          broadcastAndConfirmMs: broadcastCompletedAtMs - broadcastStartedAtMs,
          settlementReadMs: settlementCompletedAtMs - settlementStartedAtMs,
        },
      },
    };
  }

  private requireWallet(): Keypair {
    if (!this.wallet) {
      throw new Error("live trading wallet is not configured");
    }
    return this.wallet;
  }

  private async ensureWalletFunding(quoteMint: string, minimumQuoteRaw: bigint): Promise<void> {
    const wallet = this.requireWallet();
    const [lamports, quoteBalance] = await Promise.all([
      this.connection.getBalance(wallet.publicKey, "confirmed"),
      this.getTokenBalanceRaw(quoteMint),
    ]);

    const requiredLamports = decimalToRawUnits(
      env.LIVE_MIN_SOL_RESERVE_SOL.toString(),
      9,
    ) + BigInt(env.LIVE_TIP_LAMPORTS);

    if (BigInt(lamports) < requiredLamports) {
      throw new Error(
        `wallet SOL balance is below reserve: have ${rawUnitsToDecimalString(BigInt(lamports), 9)}, need at least ${rawUnitsToDecimalString(requiredLamports, 9)}`,
      );
    }

    if (quoteBalance.raw < minimumQuoteRaw) {
      throw new Error(
        `wallet quote balance is below required size: have ${rawUnitsToDecimalString(quoteBalance.raw, quoteBalance.decimals)}, need ${rawUnitsToDecimalString(minimumQuoteRaw, quoteBalance.decimals)}`,
      );
    }
  }

  private async ensureTokenBalance(mint: string, minimumRaw: bigint): Promise<void> {
    const balance = await this.getTokenBalanceRaw(mint);
    if (balance.raw < minimumRaw) {
      throw new Error(
        `wallet token balance is below required size: have ${rawUnitsToDecimalString(balance.raw, balance.decimals)}, need ${rawUnitsToDecimalString(minimumRaw, balance.decimals)}`,
      );
    }
  }

  private async getTokenBalanceRaw(mint: string): Promise<{ raw: bigint; decimals: number }> {
    const wallet = this.requireWallet();
    const response = await this.connection.getParsedTokenAccountsByOwner(
      wallet.publicKey,
      { mint: new PublicKey(mint) },
      "confirmed",
    );

    let raw = 0n;
    let decimals = mint === env.LIVE_QUOTE_MINT ? env.LIVE_QUOTE_DECIMALS : 0;
    for (const account of response.value) {
      const parsed = account.account.data.parsed;
      const tokenAmount = parsed.info?.tokenAmount;
      raw += BigInt(tokenAmount?.amount ?? "0");
      decimals = Number(tokenAmount?.decimals ?? decimals);
    }

    return { raw, decimals };
  }

  private async getQuote(input: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps: number;
  }): Promise<JupiterQuoteResponse> {
    const url = new URL(`${env.LIVE_JUPITER_API_BASE_URL}/quote`);
    url.searchParams.set("inputMint", input.inputMint);
    url.searchParams.set("outputMint", input.outputMint);
    url.searchParams.set("amount", input.amount);
    url.searchParams.set("slippageBps", String(input.slippageBps));
    url.searchParams.set("restrictIntermediateTokens", String(env.LIVE_RESTRICT_INTERMEDIATE_TOKENS));

    const response = await fetch(url, {
      headers: this.jupiterHeaders(),
    });
    const payload = await response.json() as JupiterQuoteResponse & { error?: string };
    if (!response.ok || !payload.outAmount || !Array.isArray(payload.routePlan) || payload.routePlan.length === 0) {
      throw new Error(payload.error ?? `Jupiter quote failed with ${response.status}`);
    }

    return payload;
  }

  private async getSwapTransaction(quote: JupiterQuoteResponse, userPublicKey: string): Promise<JupiterSwapResponse> {
    const response = await fetch(`${env.LIVE_JUPITER_API_BASE_URL}/swap`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.jupiterHeaders(),
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            priorityLevel: env.LIVE_PRIORITY_LEVEL,
            maxLamports: env.LIVE_MAX_PRIORITY_FEE_LAMPORTS,
          },
        },
      }),
    });

    const payload = await response.json() as JupiterSwapResponse & { error?: string };
    if (!response.ok || !payload.swapTransaction) {
      throw new Error(payload.error ?? `Jupiter swap build failed with ${response.status}`);
    }

    return payload;
  }

  private async buildSenderTransaction(swap: JupiterSwapResponse, wallet: Keypair): Promise<VersionedTransaction> {
    const jupiterTx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction!, "base64"));
    const altAccounts = await this.loadAddressLookupTables(jupiterTx);
    const message = TransactionMessage.decompile(jupiterTx.message, {
      addressLookupTableAccounts: altAccounts,
    });

    message.instructions.push(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(SENDER_TIP_ACCOUNTS[Math.floor(Math.random() * SENDER_TIP_ACCOUNTS.length)]!),
        lamports: env.LIVE_TIP_LAMPORTS,
      }),
    );

    const finalTx = new VersionedTransaction(message.compileToV0Message(altAccounts));
    finalTx.sign([wallet]);
    return finalTx;
  }

  private async loadAddressLookupTables(transaction: VersionedTransaction): Promise<AddressLookupTableAccount[]> {
    if (transaction.message.addressTableLookups.length === 0) {
      return [];
    }

    const responses = await Promise.all(
      transaction.message.addressTableLookups.map((lookup) => this.connection.getAddressLookupTable(lookup.accountKey)),
    );

    return responses.map((response) => {
      if (!response.value) {
        throw new Error("address lookup table is unavailable");
      }
      return response.value;
    });
  }

  private async broadcastTransaction(transaction: VersionedTransaction): Promise<string> {
    const response = await fetch(env.LIVE_HELIUS_SENDER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now().toString(),
        method: "sendTransaction",
        params: [
          Buffer.from(transaction.serialize()).toString("base64"),
          {
            encoding: "base64",
            skipPreflight: true,
            maxRetries: 0,
          },
        ],
      }),
    });

    const payload = await response.json() as { result?: string; error?: { message?: string } };
    if (!response.ok || payload.error?.message || !payload.result) {
      throw new Error(payload.error?.message ?? `Helius Sender failed with ${response.status}`);
    }

    const confirmation = await this.connection.confirmTransaction(payload.result, "confirmed");
    if (confirmation.value.err) {
      throw new Error(`transaction ${payload.result} failed confirmation`);
    }

    return payload.result;
  }

  private async parseSettlement(input: {
    signature: string;
    walletAddress: string;
    baseMint: string;
    quoteMint: string;
    fallbackBaseRaw: bigint;
    fallbackQuoteRaw: bigint;
    baseDecimalsHint: number;
    quoteDecimalsHint: number;
    side: "BUY" | "SELL";
  }): Promise<{
    baseAmount: string;
    baseAmountRaw: string;
    quoteAmount: string;
    quoteAmountRaw: string;
    baseDecimals: number;
    walletLamportsDelta: string;
  }> {
    const parsed = await this.connection.getParsedTransaction(input.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    const basePre = tokenBalanceSumRaw(parsed?.meta?.preTokenBalances as never, input.walletAddress, input.baseMint);
    const basePost = tokenBalanceSumRaw(parsed?.meta?.postTokenBalances as never, input.walletAddress, input.baseMint);
    const quotePre = tokenBalanceSumRaw(parsed?.meta?.preTokenBalances as never, input.walletAddress, input.quoteMint);
    const quotePost = tokenBalanceSumRaw(parsed?.meta?.postTokenBalances as never, input.walletAddress, input.quoteMint);

    const baseDecimals = basePost.decimals || basePre.decimals || input.baseDecimalsHint;
    const quoteDecimals = quotePost.decimals || quotePre.decimals || input.quoteDecimalsHint;

    const actualBaseRaw = input.side === "BUY"
      ? basePost.postRaw - basePre.preRaw
      : basePre.preRaw >= basePost.postRaw
        ? basePre.preRaw - basePost.postRaw
        : input.fallbackBaseRaw;
    const actualQuoteRaw = input.side === "BUY"
      ? quotePre.preRaw >= quotePost.postRaw
        ? quotePre.preRaw - quotePost.postRaw
        : input.fallbackQuoteRaw
      : quotePost.postRaw - quotePre.preRaw;

    const safeBaseRaw = actualBaseRaw > 0n ? actualBaseRaw : input.fallbackBaseRaw;
    const safeQuoteRaw = actualQuoteRaw > 0n ? actualQuoteRaw : input.fallbackQuoteRaw;

    return {
      baseAmount: rawUnitsToDecimalString(safeBaseRaw, baseDecimals),
      baseAmountRaw: safeBaseRaw.toString(),
      quoteAmount: rawUnitsToDecimalString(safeQuoteRaw, quoteDecimals),
      quoteAmountRaw: safeQuoteRaw.toString(),
      baseDecimals,
      walletLamportsDelta: rawUnitsToDecimalString(getWalletLamportsDelta(parsed, input.walletAddress), 9),
    };
  }

  private jupiterHeaders(): Record<string, string> {
    return env.JUPITER_API_KEY ? { "x-api-key": env.JUPITER_API_KEY } : {};
  }
}
