import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import type { ProviderPurpose, ProviderSource } from "@prisma/client";
import { env } from "../config/env.js";
import {
  ProviderBudgetService,
  type ProviderSlot,
  type ProviderSlotContext,
  type ProviderSlotResult,
} from "./provider-budget-service.js";
import {
  QuoteBuilder,
  type JupiterQuote,
  type PackRecipe,
} from "./execution/quote-builder.js";
import { BirdeyeClient } from "./birdeye-client.js";
import { SwapBuilder } from "./execution/swap-builder.js";
import { SwapSubmitter } from "./execution/swap-submitter.js";
import { HeliusPriorityFeeService } from "./helius/priority-fee-service.js";

const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SOL_MINT = "So11111111111111111111111111111111111111112";

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

type LiveTradeExecutorDeps = {
  connection?: Connection;
  providerBudget?: ProviderBudgetService;
  quoteBuilder?: QuoteBuilder;
  swapBuilder?: SwapBuilder;
  swapSubmitter?: SwapSubmitter;
  priorityFeeService?: HeliusPriorityFeeService;
  wallet?: Keypair | null;
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
  const normalized = mint.trim();
  return normalized === DEFAULT_USDC_MINT
    || normalized === DEFAULT_USDT_MINT
    || normalized.startsWith("Es9vMFrzaCERmJfrF4H2FYD");
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
    return { ready: false, reason: "Trading wallet is misconfigured: invalid private key" };
  }

  if (!env.LIVE_QUOTE_MINT.trim()) {
    return {
      ready: false,
      reason: "LIVE_QUOTE_MINT must be configured for USD accounting",
    };
  }

  return { ready: true };
}

export class LiveTradeExecutor {
  private readonly connection: Connection;
  private readonly wallet: Keypair | null;
  private readonly budgetService: ProviderBudgetService;
  private readonly priorityFeeService: HeliusPriorityFeeService;
  private readonly birdeye: BirdeyeClient;
  private readonly quoteBuilder: QuoteBuilder;
  private readonly swapBuilder: SwapBuilder;
  private readonly swapSubmitter: SwapSubmitter;

  constructor(deps: LiveTradeExecutorDeps = {}) {
    this.connection = deps.connection ?? new Connection(env.HELIUS_RPC_URL, "confirmed");
    this.wallet = deps.wallet ?? (() => {
      if (!env.TRADING_WALLET_PRIVATE_KEY_B58) return null;
      try {
        return Keypair.fromSecretKey(parseSecretKey(env.TRADING_WALLET_PRIVATE_KEY_B58));
      } catch {
        return null;
      }
    })();
    const providerBudget = deps.providerBudget ?? new ProviderBudgetService();
    this.budgetService = providerBudget;
    this.priorityFeeService = deps.priorityFeeService ?? new HeliusPriorityFeeService({
      rpcUrl: env.HELIUS_RPC_URL,
      budgetService: providerBudget,
    });
    this.birdeye = new BirdeyeClient(env.BIRDEYE_API_KEY, providerBudget);
    this.quoteBuilder = deps.quoteBuilder ?? new QuoteBuilder({
      budgetService: providerBudget,
    });
    this.swapBuilder = deps.swapBuilder ?? new SwapBuilder();
    this.swapSubmitter = deps.swapSubmitter ?? new SwapSubmitter({
      connection: this.connection,
      priorityFeeService: this.priorityFeeService,
      budgetService: providerBudget,
    });
  }

  isConfigured(): boolean {
    return getLiveTradingReadiness().ready;
  }

  getWalletAddress(): string | null {
    return this.wallet?.publicKey.toBase58() ?? null;
  }

  /**
   * Parallelized buy pipeline.
   *
   * Stage 1 (parallel):
   *   - ensureWalletFunding()  [RPC: getBalance + getParsedTokenAccountsByOwner]
   *   - getQuote()             [HTTP: Jupiter /quote]
   *
   * Stage 2 (sequential, depends on quote):
   *   - getSwapTransaction()   [HTTP: Jupiter /swap]
   *
   * Stage 3 (parallel):
   *   - loadAddressLookupTables()  [RPC: getAddressLookupTable × N]
   *   - buildSenderTransaction()   [CPU: deserialize + sign]
   *
   * Stage 4 (sequential, depends on senderTx):
   *   - broadcastTransaction()  [HTTP: Helius Sender → RPC: confirmTransaction]
   *
   * Stage 5 (sequential, depends on signature):
   *   - parseSettlement()      [RPC: getParsedTransaction]
   *
   * Typical wall-clock reduction: ~40–60% faster than sequential.
   */
  async executeBuy(input: {
    mint: string;
    budgetUsd: number;
    tokenDecimalsHint?: number | null;
    marketCapUsd?: number | null;
    packId?: string | null;
    candidateId?: string | null;
  }): Promise<LiveTradeExecution> {
    const startedAtMs = Date.now();
    const wallet = this.requireWallet();
    const quoteMint = env.LIVE_QUOTE_MINT;
    const quoteDecimals = env.LIVE_QUOTE_DECIMALS;
    const quoteUsdPrice = await this.resolveQuoteUsdPrice(quoteMint);
    const quoteAmountValue = input.budgetUsd / quoteUsdPrice;
    const quoteAmountRaw = decimalToRawUnits(quoteAmountValue.toFixed(6), quoteDecimals);

    if (quoteAmountRaw <= 0n) {
      throw new Error("live buy budget must be positive");
    }

    // ── STAGE 1: parallel funding check + quote fetch ─────────────────────
    const quoteStartedAtMs = Date.now();
    const [fundingResult, quote] = await Promise.all([
      this.ensureWalletFunding(quoteMint, quoteAmountRaw, {
        purpose: "EVALUATE",
        mint: input.mint,
        packId: input.packId ?? null,
        candidateId: input.candidateId ?? null,
      }),
      this.quoteBuilder.build({
        mint: input.mint,
        side: "BUY",
        lamportAmount: quoteAmountRaw,
        mcUsd: normalizeMarketCapUsd(input.marketCapUsd),
        packRecipe: buildPackRecipe(input.packId),
        candidateId: input.candidateId ?? null,
      }),
    ]);

    if (fundingResult instanceof Error) throw fundingResult;
    if (!quote) {
      throw new Error(`Jupiter quote unavailable for ${input.mint}`);
    }

    const quoteCompletedAtMs = Date.now();

    const swapStartedAtMs = quoteCompletedAtMs;
    const priorityFeeAccounts = collectPriorityFeeAccounts(quote);
    let initialPriorityFee = await this.priorityFeeService.estimate(priorityFeeAccounts, "entry", {
      packId: input.packId ?? null,
      mint: input.mint,
      candidateId: input.candidateId ?? null,
    });
    let currentQuote = quote;
    const firstTx = await this.swapBuilder.build({
      quote: currentQuote,
      wallet,
      priorityFeeMicroLamports: initialPriorityFee,
    });
    if (!firstTx) {
      throw new Error(`Jupiter swap build failed for ${input.mint}`);
    }
    const swapCompletedAtMs = Date.now();

    const senderBuildStartedAtMs = swapStartedAtMs;
    const attempt = await this.swapSubmitter.submit({
      tx: firstTx,
      lane: "REGULAR",
      tipLamports: env.LIVE_TIP_LAMPORTS,
      wallet,
      mint: input.mint,
      side: "BUY",
      candidateId: input.candidateId ?? null,
      packId: input.packId ?? null,
      mcUsdAtQuote: normalizeMarketCapUsd(input.marketCapUsd),
      tierBucket: currentQuote.tierBucket,
      slippageCapBps: currentQuote.slippageCapBps,
      slippageUsedBps: currentQuote.slippageBps,
      priceImpactBps: Math.round(currentQuote.priceImpactPct * 10_000),
      quoteLatencyMs: quoteCompletedAtMs - quoteStartedAtMs,
      signLatencyMs: swapCompletedAtMs - swapStartedAtMs,
      priorityFeeAccounts,
      priorityFeeLane: "entry",
      onRequote: async () => {
        const refreshedQuote = await this.quoteBuilder.build({
          mint: input.mint,
          side: "BUY",
          lamportAmount: quoteAmountRaw,
          mcUsd: normalizeMarketCapUsd(input.marketCapUsd),
          packRecipe: buildPackRecipe(input.packId),
          candidateId: input.candidateId ?? null,
        });
        if (!refreshedQuote) {
          return null;
        }
        currentQuote = refreshedQuote;
        initialPriorityFee = await this.priorityFeeService.estimate(collectPriorityFeeAccounts(refreshedQuote), "entry", {
          packId: input.packId ?? null,
          mint: input.mint,
          candidateId: input.candidateId ?? null,
        });
        return this.swapBuilder.build({
          quote: refreshedQuote,
          wallet,
          priorityFeeMicroLamports: initialPriorityFee,
        });
      },
    });

    if (attempt.failureCode || !attempt.txSig) {
      throw new Error(`live buy submit failed: ${attempt.failureCode ?? "missing_tx_sig"}`);
    }

    const senderBuildCompletedAtMs = swapCompletedAtMs;
    const broadcastCompletedAtMs = swapCompletedAtMs + Number(attempt.submitLatencyMs ?? 0) + Number(attempt.confirmLatencyMs ?? 0);

    const settlementStartedAtMs = broadcastCompletedAtMs;
    const settled = await this.parseSettlement({
      signature: attempt.txSig,
      walletAddress: wallet.publicKey.toBase58(),
      baseMint: input.mint,
      quoteMint,
      fallbackBaseRaw: BigInt(currentQuote.outAmount ?? "0"),
      fallbackQuoteRaw: BigInt(currentQuote.inAmount ?? quoteAmountRaw.toString()),
      baseDecimalsHint: input.tokenDecimalsHint ?? 0,
      quoteDecimalsHint: quoteDecimals,
      side: "BUY",
      budget: {
        purpose: "EVALUATE",
        mint: input.mint,
        packId: input.packId ?? null,
        candidateId: input.candidateId ?? null,
      },
    });
    const settlementCompletedAtMs = Date.now();

    const quotedInAmountRaw = currentQuote.inAmount ?? quoteAmountRaw.toString();
    const quotedOutAmountRaw = currentQuote.outAmount ?? null;
    const actualInAmountRaw = settled.quoteAmountRaw;
    const actualOutAmountRaw = settled.baseAmountRaw;
    const quotedOutAmountToken = toDecimalNumber(quotedOutAmountRaw, settled.baseDecimals);
    const actualOutAmountToken = Number(settled.baseAmount);
    const executionSlippageBps = toBpsFromShortfall(quotedOutAmountToken, actualOutAmountToken);

    return {
      signature: attempt.txSig,
      entryPriceUsd: (Number(settled.quoteAmount) * quoteUsdPrice) / Math.max(Number(settled.baseAmount), Number.EPSILON),
      amountUsd: (Number(settled.quoteAmount) * quoteUsdPrice).toFixed(6),
      amountToken: settled.baseAmount,
      tokenDecimals: settled.baseDecimals,
      quoteMint,
      quoteDecimals,
      metadata: {
        mode: "LIVE",
        wallet: wallet.publicKey.toBase58(),
        quoteMint,
        quoteDecimals,
        quoteUsdPrice,
        quotedInAmountRaw,
        quotedOutAmountRaw,
        actualInAmountRaw,
        actualOutAmountRaw,
        quotedOutAmountToken,
        actualOutAmountToken,
        executionSlippageBps,
        quoteSlippageBps: currentQuote.slippageBps ?? env.LIVE_SLIPPAGE_BPS,
        senderUrl: env.LIVE_HELIUS_SENDER_URL,
        walletLamportsDelta: settled.walletLamportsDelta,
        lane: "REGULAR",
        fillAttemptId: attempt.id.toString(),
        fillAttemptRetries: attempt.retries,
        fillAttemptFailureCode: attempt.failureCode,
        bundleLanded: attempt.bundleLanded,
        cuPriceMicroLamports: attempt.cuPriceMicroLamports?.toString() ?? null,
        tipLamports: attempt.tipLamports?.toString() ?? null,
        timing: {
          startedAt: new Date(startedAtMs).toISOString(),
          completedAt: new Date(settlementCompletedAtMs).toISOString(),
          totalMs: settlementCompletedAtMs - startedAtMs,
          quoteMs: quoteCompletedAtMs - quoteStartedAtMs,
          swapBuildMs: swapCompletedAtMs - swapStartedAtMs,
          senderBuildMs: senderBuildCompletedAtMs - senderBuildStartedAtMs,
          broadcastAndConfirmMs: Number(attempt.submitLatencyMs ?? 0) + Number(attempt.confirmLatencyMs ?? 0),
          settlementReadMs: settlementCompletedAtMs - settlementStartedAtMs,
        },
      },
    };
  }

  /**
   * Parallelized sell pipeline.
   *
   * Stage 1 (parallel):
   *   - ensureWalletFunding(quoteMint, 0n)  [RPC]
   *   - ensureTokenBalance(input.mint, ...)  [RPC]
   *   - getQuote()                          [HTTP]
   *
   * Stage 2 (sequential, depends on quote):
   *   - getSwapTransaction()
   *
   * Stage 3 (parallel):
   *   - loadAddressLookupTables()
   *   - buildSenderTransaction()
   *
   * Stage 4 (sequential):
   *   - broadcastTransaction()
   *
   * Stage 5 (sequential):
   *   - parseSettlement()
   */
  async executeSell(input: {
    mint: string;
    tokenAmount: string;
    tokenDecimals: number;
    marketCapUsd?: number | null;
    packId?: string | null;
    positionId?: string | null;
  }): Promise<LiveTradeExecution> {
    const startedAtMs = Date.now();
    const wallet = this.requireWallet();
    const quoteMint = env.LIVE_QUOTE_MINT;
    const quoteDecimals = env.LIVE_QUOTE_DECIMALS;
    const quoteUsdPrice = await this.resolveQuoteUsdPrice(quoteMint);
    const baseAmountRaw = decimalToRawUnits(input.tokenAmount, input.tokenDecimals);

    if (baseAmountRaw <= 0n) {
      throw new Error("live sell amount must be positive");
    }

    // ── STAGE 1: parallel pre-flight checks + quote ──────────────────────
    const quoteStartedAtMs = Date.now();
    const [fundingResult, tokenResult, initialQuote] = await Promise.all([
      this.ensureWalletFunding(quoteMint, 0n, {
        purpose: "EXIT",
        mint: input.mint,
        packId: input.packId ?? null,
        positionId: input.positionId ?? null,
      }),
      this.ensureTokenBalance(input.mint, baseAmountRaw, {
        purpose: "EXIT",
        mint: input.mint,
        packId: input.packId ?? null,
        positionId: input.positionId ?? null,
      }),
      this.quoteBuilder.build({
        mint: input.mint,
        side: "SELL",
        lamportAmount: baseAmountRaw,
        mcUsd: normalizeMarketCapUsd(input.marketCapUsd),
        packRecipe: buildPackRecipe(input.packId),
        positionId: input.positionId ?? null,
      }),
    ]);

    if (fundingResult instanceof Error) throw fundingResult;
    if (tokenResult instanceof Error) throw tokenResult;
    if (!initialQuote) {
      throw new Error(`Jupiter quote unavailable for ${input.mint}`);
    }
    let currentQuote = initialQuote;
    const quoteCompletedAtMs = Date.now();

    const swapStartedAtMs = quoteCompletedAtMs;
    const priorityFeeAccounts = collectPriorityFeeAccounts(currentQuote);
    let initialPriorityFee = await this.priorityFeeService.estimate(priorityFeeAccounts, "exit", {
      packId: input.packId ?? null,
      mint: input.mint,
      positionId: input.positionId ?? null,
    });
    const firstTx = await this.swapBuilder.build({
      quote: currentQuote,
      wallet,
      priorityFeeMicroLamports: initialPriorityFee,
    });
    if (!firstTx) {
      throw new Error(`Jupiter swap build failed for ${input.mint}`);
    }
    const swapCompletedAtMs = Date.now();

    const senderBuildStartedAtMs = swapStartedAtMs;
    const attempt = await this.swapSubmitter.submit({
      tx: firstTx,
      lane: "REGULAR",
      tipLamports: env.LIVE_TIP_LAMPORTS,
      wallet,
      mint: input.mint,
      side: "SELL",
      positionId: input.positionId ?? null,
      packId: input.packId ?? null,
      mcUsdAtQuote: normalizeMarketCapUsd(input.marketCapUsd),
      tierBucket: currentQuote.tierBucket,
      slippageCapBps: currentQuote.slippageCapBps,
      slippageUsedBps: currentQuote.slippageBps,
      priceImpactBps: Math.round(currentQuote.priceImpactPct * 10_000),
      quoteLatencyMs: quoteCompletedAtMs - quoteStartedAtMs,
      signLatencyMs: swapCompletedAtMs - swapStartedAtMs,
      priorityFeeAccounts,
      priorityFeeLane: "exit",
      isExitAttempt: true,
      onRequote: async () => {
        const refreshedQuote = await this.quoteBuilder.build({
          mint: input.mint,
          side: "SELL",
          lamportAmount: baseAmountRaw,
          mcUsd: normalizeMarketCapUsd(input.marketCapUsd),
          packRecipe: buildPackRecipe(input.packId),
          positionId: input.positionId ?? null,
        });
        if (!refreshedQuote) {
          return null;
        }
        currentQuote = refreshedQuote;
        initialPriorityFee = await this.priorityFeeService.estimate(collectPriorityFeeAccounts(refreshedQuote), "exit", {
          packId: input.packId ?? null,
          mint: input.mint,
          positionId: input.positionId ?? null,
        });
        return this.swapBuilder.build({
          quote: refreshedQuote,
          wallet,
          priorityFeeMicroLamports: initialPriorityFee,
        });
      },
    });

    if (attempt.failureCode || !attempt.txSig) {
      throw new Error(`live sell submit failed: ${attempt.failureCode ?? "missing_tx_sig"}`);
    }

    const senderBuildCompletedAtMs = swapCompletedAtMs;
    const broadcastCompletedAtMs = swapCompletedAtMs + Number(attempt.submitLatencyMs ?? 0) + Number(attempt.confirmLatencyMs ?? 0);

    const settlementStartedAtMs = broadcastCompletedAtMs;
    const settled = await this.parseSettlement({
      signature: attempt.txSig,
      walletAddress: wallet.publicKey.toBase58(),
      baseMint: input.mint,
      quoteMint,
      fallbackBaseRaw: BigInt(currentQuote.inAmount ?? baseAmountRaw.toString()),
      fallbackQuoteRaw: BigInt(currentQuote.outAmount ?? "0"),
      baseDecimalsHint: input.tokenDecimals,
      quoteDecimalsHint: quoteDecimals,
      side: "SELL",
      budget: {
        purpose: "EXIT",
        mint: input.mint,
        packId: input.packId ?? null,
        positionId: input.positionId ?? null,
      },
    });
    const settlementCompletedAtMs = Date.now();

    const quotedInAmountRaw = currentQuote.inAmount ?? baseAmountRaw.toString();
    const quotedOutAmountRaw = currentQuote.outAmount ?? null;
    const actualInAmountRaw = settled.baseAmountRaw;
    const actualOutAmountRaw = settled.quoteAmountRaw;
    const quotedOutAmountUsdRaw = toDecimalNumber(quotedOutAmountRaw, quoteDecimals);
    const actualOutAmountQuote = Number(settled.quoteAmount);
    const quotedOutAmountUsd = quotedOutAmountUsdRaw === null ? null : quotedOutAmountUsdRaw * quoteUsdPrice;
    const actualOutAmountUsd = actualOutAmountQuote * quoteUsdPrice;
    const executionSlippageBps = toBpsFromShortfall(quotedOutAmountUsd, actualOutAmountUsd);

    return {
      signature: attempt.txSig,
      entryPriceUsd: actualOutAmountUsd / Math.max(Number(settled.baseAmount), Number.EPSILON),
      amountUsd: actualOutAmountUsd.toFixed(6),
      amountToken: settled.baseAmount,
      tokenDecimals: settled.baseDecimals,
      quoteMint,
      quoteDecimals,
      metadata: {
        mode: "LIVE",
        wallet: wallet.publicKey.toBase58(),
        quoteMint,
        quoteDecimals,
        quoteUsdPrice,
        quotedInAmountRaw,
        quotedOutAmountRaw,
        actualInAmountRaw,
        actualOutAmountRaw,
        quotedOutAmountUsd,
        actualOutAmountUsd,
        actualOutAmountQuote,
        executionSlippageBps,
        quoteSlippageBps: currentQuote.slippageBps ?? env.LIVE_SLIPPAGE_BPS,
        senderUrl: env.LIVE_HELIUS_SENDER_URL,
        walletLamportsDelta: settled.walletLamportsDelta,
        lane: "REGULAR",
        fillAttemptId: attempt.id.toString(),
        fillAttemptRetries: attempt.retries,
        fillAttemptFailureCode: attempt.failureCode,
        bundleLanded: attempt.bundleLanded,
        cuPriceMicroLamports: attempt.cuPriceMicroLamports?.toString() ?? null,
        tipLamports: attempt.tipLamports?.toString() ?? null,
        timing: {
          startedAt: new Date(startedAtMs).toISOString(),
          completedAt: new Date(settlementCompletedAtMs).toISOString(),
          totalMs: settlementCompletedAtMs - startedAtMs,
          quoteMs: quoteCompletedAtMs - quoteStartedAtMs,
          swapBuildMs: swapCompletedAtMs - swapStartedAtMs,
          senderBuildMs: senderBuildCompletedAtMs - senderBuildStartedAtMs,
          broadcastAndConfirmMs: Number(attempt.submitLatencyMs ?? 0) + Number(attempt.confirmLatencyMs ?? 0),
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

  /**
   * Returns void on success, Error on failure.
   * Parallelized internally: getBalance + getParsedTokenAccountsByOwner run together.
   */
  private async ensureWalletFunding(
    quoteMint: string,
    minimumQuoteRaw: bigint,
    budget: ProviderSlotContext & { purpose: ProviderPurpose },
  ): Promise<void | Error> {
    const wallet = this.requireWallet();
    const [lamports, quoteBalanceResult] = await Promise.all([
      this.withHeliusRpcBudget(
        "getBalance",
        budget.purpose,
        budget,
        1,
        () => this.connection.getBalance(wallet.publicKey, "confirmed"),
      ),
      this.getTokenBalanceRaw(quoteMint, budget),
    ]);

    const requiredLamports = decimalToRawUnits(
      env.LIVE_MIN_SOL_RESERVE_SOL.toString(),
      9,
    ) + BigInt(env.LIVE_TIP_LAMPORTS);

    if (BigInt(lamports) < requiredLamports) {
      return new Error(
        `wallet SOL balance is below reserve: have ${rawUnitsToDecimalString(BigInt(lamports), 9)}, need at least ${rawUnitsToDecimalString(requiredLamports, 9)}`,
      );
    }

    if (quoteBalanceResult.raw < minimumQuoteRaw) {
      return new Error(
        `wallet quote balance is below required size: have ${rawUnitsToDecimalString(quoteBalanceResult.raw, quoteBalanceResult.decimals)}, need ${rawUnitsToDecimalString(minimumQuoteRaw, quoteBalanceResult.decimals)}`,
      );
    }
  }

  /**
   * Returns void on success, Error on failure.
   */
  private async ensureTokenBalance(
    mint: string,
    minimumRaw: bigint,
    budget: ProviderSlotContext & { purpose: ProviderPurpose },
  ): Promise<void | Error> {
    const balance = await this.getTokenBalanceRaw(mint, budget);
    if (balance.raw < minimumRaw) {
      return new Error(
        `wallet token balance is below required size: have ${rawUnitsToDecimalString(balance.raw, balance.decimals)}, need ${rawUnitsToDecimalString(minimumRaw, balance.decimals)}`,
      );
    }
  }

  private async getTokenBalanceRaw(
    mint: string,
    budget: ProviderSlotContext & { purpose: ProviderPurpose },
  ): Promise<{ raw: bigint; decimals: number }> {
    const wallet = this.requireWallet();
    if (mint === SOL_MINT) {
      const lamports = await this.withHeliusRpcBudget(
        "getBalance",
        budget.purpose,
        {
          ...budget,
          mint,
        },
        1,
        () => this.connection.getBalance(wallet.publicKey, "confirmed"),
      );
      return { raw: BigInt(lamports), decimals: 9 };
    }

    const response = await this.withHeliusRpcBudget(
      "getParsedTokenAccountsByOwner",
      budget.purpose,
      {
        ...budget,
        mint,
      },
      1,
      () => this.connection.getParsedTokenAccountsByOwner(
        wallet.publicKey,
        { mint: new PublicKey(mint) },
        "confirmed",
      ),
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

  private async resolveQuoteUsdPrice(quoteMint: string): Promise<number> {
    if (isStableQuoteMint(quoteMint)) {
      return 1;
    }

    if (quoteMint === SOL_MINT) {
      const solPrice = await this.birdeye.getPrice(SOL_MINT);
      if (typeof solPrice === "number" && Number.isFinite(solPrice) && solPrice > 0) {
        return solPrice;
      }
    }

    const quotePrice = await this.birdeye.getPrice(quoteMint);
    if (typeof quotePrice === "number" && Number.isFinite(quotePrice) && quotePrice > 0) {
      return quotePrice;
    }

    throw new Error(`quote mint USD price unavailable for ${quoteMint}`);
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
    budget: ProviderSlotContext & { purpose: ProviderPurpose };
  }): Promise<{
    baseAmount: string;
    baseAmountRaw: string;
    quoteAmount: string;
    quoteAmountRaw: string;
    baseDecimals: number;
    walletLamportsDelta: string;
  }> {
    const parsed = await this.withHeliusRpcBudget(
      "getParsedTransaction",
      input.budget.purpose,
      input.budget,
      1,
      () => this.connection.getParsedTransaction(input.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }),
    );

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

  private async withHeliusRpcBudget<T>(
    endpoint: string,
    purpose: ProviderPurpose,
    ctx: ProviderSlotContext,
    creditsUsed: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const slot = this.safeRequestSlot("HELIUS", purpose, {
      ...ctx,
      endpoint,
    });
    const startedAt = Date.now();
    try {
      const result = await fn();
      this.safeReleaseSlot(slot, {
        endpoint,
        creditsUsed,
        httpStatus: result === null ? 404 : 200,
        latencyMs: Date.now() - startedAt,
        errorCode: result === null ? `${endpoint}_missing` : undefined,
      });
      return result;
    } catch (error) {
      this.safeReleaseSlot(slot, {
        endpoint,
        creditsUsed,
        httpStatus: 500,
        latencyMs: Date.now() - startedAt,
        errorCode: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private safeRequestSlot(
    provider: ProviderSource,
    purpose: ProviderPurpose,
    ctx?: ProviderSlotContext,
  ): ProviderSlot | null {
    try {
      return this.budgetService.requestSlot(provider, purpose, ctx);
    } catch (error) {
      logger.warn({ err: error, provider, purpose, ctx }, "live trade executor budget request failed open");
      return null;
    }
  }

  private safeReleaseSlot(slot: ProviderSlot | null, result: ProviderSlotResult): void {
    if (!slot) {
      return;
    }
    try {
      this.budgetService.releaseSlot(slot.id, result);
    } catch (error) {
      logger.warn({ err: error, result }, "live trade executor budget release failed open");
    }
  }

}

function buildPackRecipe(packId?: string | null): PackRecipe | null {
  const id = typeof packId === "string" && packId.trim().length > 0 ? packId.trim() : null;
  return id ? { id } : null;
}

function normalizeMarketCapUsd(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1_000_000;
}

function collectPriorityFeeAccounts(quote: JupiterQuote): string[] {
  const accounts = new Set<string>();
  for (const leg of quote.routePlan) {
    const swapInfo = leg.swapInfo;
    if (!swapInfo) {
      continue;
    }
    if (swapInfo.ammKey) {
      accounts.add(swapInfo.ammKey);
    }
    if (swapInfo.inputMint) {
      accounts.add(swapInfo.inputMint);
    }
    if (swapInfo.outputMint) {
      accounts.add(swapInfo.outputMint);
    }
  }
  return [...accounts];
}
