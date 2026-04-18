import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
} from "@solana/web3.js";
import type { FillAttempt, FillSide, SubmitLane } from "@prisma/client";
import { db } from "../../db/client.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import {
  HeliusPriorityFeeService,
  type PriorityFeeLane,
} from "../helius/priority-fee-service.js";

const DEFAULT_JITO_BUNDLE_URL = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";

const JITO_TIP_ACCOUNTS = [
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

type FetchLike = typeof fetch;

type SwapSubmitterDeps = {
  connection?: Connection;
  senderUrl?: string;
  jitoBundleUrl?: string;
  fetchImpl?: FetchLike;
  nowMs?: () => number;
  priorityFeeService?: HeliusPriorityFeeService;
  randomInt?: (maxExclusive: number) => number;
};

export type SubmitSwapInput = {
  tx: VersionedTransaction;
  lane: SubmitLane;
  tipLamports?: number;
  mint: string;
  sessionId?: string | null;
  packId?: string | null;
  packVersion?: number | null;
  side?: FillSide;
  positionId?: string | null;
  candidateId?: string | null;
  mcUsdAtQuote?: number | null;
  tierBucket?: string | null;
  slippageCapBps?: number | null;
  slippageUsedBps?: number | null;
  priceImpactBps?: number | null;
  quoteLatencyMs?: number | null;
  signLatencyMs?: number | null;
  priorityFeeAccounts?: string[];
  priorityFeeLane?: PriorityFeeLane;
  wallet?: Keypair;
  isExitAttempt?: boolean;
  onRequote?: () => Promise<VersionedTransaction | null>;
};

type SenderResponse = {
  result?: string;
  error?: { message?: string };
};

type JitoBundleResponse = {
  result?: string;
  error?: { message?: string };
};

type SubmitErrorCode = "BLOCKHASH_EXPIRED" | "JITO_DROPPED" | "LAND_FAILED" | "REQUOTE_FAILED";

type AttemptSuccess = {
  txSig: string;
  submitLatencyMs: number;
  confirmLatencyMs: number;
  bundleLanded: boolean | null;
  cuPriceMicroLamports: number;
};

class SubmitError extends Error {
  constructor(readonly code: SubmitErrorCode, message: string) {
    super(message);
  }
}

export class SwapSubmitter {
  private readonly connection: Connection;
  private readonly senderUrl: string;
  private readonly jitoBundleUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly nowMs: () => number;
  private readonly priorityFeeService: HeliusPriorityFeeService;
  private readonly randomInt: (maxExclusive: number) => number;

  constructor(deps: SwapSubmitterDeps = {}) {
    this.connection = deps.connection ?? new Connection(env.HELIUS_RPC_URL, "confirmed");
    this.senderUrl = deps.senderUrl ?? env.LIVE_HELIUS_SENDER_URL;
    this.jitoBundleUrl = deps.jitoBundleUrl ?? DEFAULT_JITO_BUNDLE_URL;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.nowMs = deps.nowMs ?? Date.now;
    this.priorityFeeService = deps.priorityFeeService ?? new HeliusPriorityFeeService();
    this.randomInt = deps.randomInt ?? ((maxExclusive: number) => Math.floor(Math.random() * maxExclusive));
  }

  async submit(input: SubmitSwapInput): Promise<FillAttempt> {
    let tx = input.tx;
    let retries = 0;
    let blockhashRetryUsed = false;
    let jitoRetryUsed = false;
    let currentTipLamports = Math.max(0, Math.round(input.tipLamports ?? env.LIVE_TIP_LAMPORTS));
    let cuPriceMicroLamports = 5_000;
    let failureCode: string | null = null;

    while (true) {
      try {
        const feeLane = input.priorityFeeLane ?? (input.isExitAttempt ? "exit" : "entry");
        cuPriceMicroLamports = await this.priorityFeeService.estimate(
          input.priorityFeeAccounts ?? [],
          feeLane,
          {
            sessionId: input.sessionId ?? null,
            packId: input.packId ?? null,
            mint: input.mint,
            candidateId: input.candidateId ?? null,
            positionId: input.positionId ?? null,
          },
        );

        const attemptResult = input.lane === "REGULAR"
          ? await this.submitRegular(tx)
          : await this.submitJitoBundle({
              tx,
              wallet: input.wallet,
              tipLamports: currentTipLamports,
              cuPriceMicroLamports,
            });

        return db.fillAttempt.create({
          data: {
            positionId: input.positionId ?? null,
            candidateId: input.candidateId ?? null,
            side: input.side ?? "BUY",
            packId: input.packId ?? null,
            packVersion: input.packVersion ?? null,
            sessionId: input.sessionId ?? null,
            mint: input.mint,
            mcUsdAtQuote: input.mcUsdAtQuote ?? null,
            tierBucket: input.tierBucket ?? null,
            slippageCapBps: input.slippageCapBps ?? null,
            slippageUsedBps: input.slippageUsedBps ?? null,
            priceImpactBps: input.priceImpactBps ?? null,
            cuPriceMicroLamports: BigInt(Math.round(cuPriceMicroLamports)),
            tipLamports: input.lane === "JITO_BUNDLE" ? BigInt(currentTipLamports) : null,
            lane: input.lane,
            bundleLanded: attemptResult.bundleLanded,
            quoteLatencyMs: input.quoteLatencyMs ?? null,
            signLatencyMs: input.signLatencyMs ?? null,
            submitLatencyMs: attemptResult.submitLatencyMs,
            confirmLatencyMs: attemptResult.confirmLatencyMs,
            retries,
            failureCode: null,
            txSig: attemptResult.txSig,
          },
        });
      } catch (error) {
        const normalized = this.normalizeSubmitError(error);
        failureCode = normalized.code;

        if (normalized.code === "BLOCKHASH_EXPIRED" && !blockhashRetryUsed) {
          blockhashRetryUsed = true;
          retries += 1;
          tx = await this.requoteOrFail(input.onRequote);
          continue;
        }

        if (normalized.code === "JITO_DROPPED" && input.lane === "JITO_BUNDLE" && !jitoRetryUsed) {
          jitoRetryUsed = true;
          retries += 1;
          currentTipLamports = Math.max(1, Math.round(currentTipLamports * 1.25));
          continue;
        }

        if (input.isExitAttempt && retries >= 2) {
          // P2 scope only. This repo still has PositionStatus OPEN/CLOSED, so STALE_EXIT requires engine/state extension.
          logger.warn(
            { positionId: input.positionId, mint: input.mint, failureCode: normalized.code },
            "exit failed twice; STALE_EXIT transition is deferred to engine-state wiring",
          );
        }

        return db.fillAttempt.create({
          data: {
            positionId: input.positionId ?? null,
            candidateId: input.candidateId ?? null,
            side: input.side ?? "BUY",
            packId: input.packId ?? null,
            packVersion: input.packVersion ?? null,
            sessionId: input.sessionId ?? null,
            mint: input.mint,
            mcUsdAtQuote: input.mcUsdAtQuote ?? null,
            tierBucket: input.tierBucket ?? null,
            slippageCapBps: input.slippageCapBps ?? null,
            slippageUsedBps: input.slippageUsedBps ?? null,
            priceImpactBps: input.priceImpactBps ?? null,
            cuPriceMicroLamports: BigInt(Math.round(cuPriceMicroLamports)),
            tipLamports: input.lane === "JITO_BUNDLE" ? BigInt(currentTipLamports) : null,
            lane: input.lane,
            bundleLanded: input.lane === "JITO_BUNDLE" ? false : null,
            quoteLatencyMs: input.quoteLatencyMs ?? null,
            signLatencyMs: input.signLatencyMs ?? null,
            submitLatencyMs: null,
            confirmLatencyMs: null,
            retries,
            failureCode,
            txSig: null,
          },
        });
      }
    }
  }

  private async requoteOrFail(onRequote: SubmitSwapInput["onRequote"]): Promise<VersionedTransaction> {
    if (!onRequote) {
      throw new SubmitError("REQUOTE_FAILED", "blockhash expired but re-quote callback is missing");
    }
    const refreshedTx = await onRequote();
    if (!refreshedTx) {
      throw new SubmitError("REQUOTE_FAILED", "blockhash retry requested but re-quote returned null");
    }
    return refreshedTx;
  }

  private async submitRegular(tx: VersionedTransaction): Promise<AttemptSuccess> {
    const serialized = Buffer.from(tx.serialize()).toString("base64");
    const submitStartedAt = this.nowMs();
    const response = await this.fetchImpl(this.senderUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${this.nowMs()}`,
        method: "sendTransaction",
        params: [
          serialized,
          {
            encoding: "base64",
            skipPreflight: true,
            maxRetries: 0,
          },
        ],
      }),
    });
    const submitLatencyMs = this.nowMs() - submitStartedAt;
    const payload = await response.json() as SenderResponse;
    const rpcError = payload.error?.message ?? null;
    if (!response.ok || rpcError || !payload.result) {
      throw this.classifyError(rpcError ?? `sender_http_${response.status}`);
    }

    const confirmStartedAt = this.nowMs();
    const confirmation = await this.connection.confirmTransaction(payload.result, "confirmed");
    const confirmLatencyMs = this.nowMs() - confirmStartedAt;
    if (confirmation.value.err) {
      throw this.classifyError("sender_confirmation_failed");
    }

    return {
      txSig: payload.result,
      submitLatencyMs,
      confirmLatencyMs,
      bundleLanded: null,
      cuPriceMicroLamports: 0,
    };
  }

  private async submitJitoBundle(input: {
    tx: VersionedTransaction;
    wallet?: Keypair;
    tipLamports: number;
    cuPriceMicroLamports: number;
  }): Promise<AttemptSuccess> {
    const txForBundle = await this.buildBundleTransaction(input.tx, input.wallet, input.tipLamports, input.cuPriceMicroLamports);
    const serialized = Buffer.from(txForBundle.serialize()).toString("base64");
    const submitStartedAt = this.nowMs();
    const response = await this.fetchImpl(this.jitoBundleUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${this.nowMs()}`,
        method: "sendBundle",
        params: [[serialized]],
      }),
    });
    const submitLatencyMs = this.nowMs() - submitStartedAt;
    const payload = await response.json() as JitoBundleResponse;
    const error = payload.error?.message ?? null;
    if (!response.ok || error) {
      throw this.classifyError(error ?? `jito_http_${response.status}`);
    }

    const txSig = bs58.encode(txForBundle.signatures[0] ?? new Uint8Array());
    const confirmStartedAt = this.nowMs();
    const confirmation = await this.connection.confirmTransaction(txSig, "confirmed");
    const confirmLatencyMs = this.nowMs() - confirmStartedAt;
    if (confirmation.value.err) {
      throw this.classifyError("jito_confirmation_failed");
    }

    return {
      txSig,
      submitLatencyMs,
      confirmLatencyMs,
      bundleLanded: true,
      cuPriceMicroLamports: input.cuPriceMicroLamports,
    };
  }

  private async buildBundleTransaction(
    tx: VersionedTransaction,
    wallet: Keypair | undefined,
    tipLamports: number,
    cuPriceMicroLamports: number,
  ): Promise<VersionedTransaction> {
    if (!wallet) {
      return tx;
    }

    const altAccounts = await this.loadAddressLookupTables(tx);
    const message = TransactionMessage.decompile(tx.message, {
      addressLookupTableAccounts: altAccounts,
    });
    message.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: BigInt(Math.max(5_000, Math.round(cuPriceMicroLamports))),
      }),
    );
    message.instructions.push(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(JITO_TIP_ACCOUNTS[this.randomInt(JITO_TIP_ACCOUNTS.length)]!),
        lamports: Math.max(0, Math.round(tipLamports)),
      }),
    );

    const nextTx = new VersionedTransaction(message.compileToV0Message(altAccounts));
    nextTx.sign([wallet]);
    return nextTx;
  }

  private async loadAddressLookupTables(transaction: VersionedTransaction): Promise<AddressLookupTableAccount[]> {
    if (transaction.message.addressTableLookups.length === 0) {
      return [];
    }
    const responses = await Promise.all(
      transaction.message.addressTableLookups.map((lookup) => this.connection.getAddressLookupTable(lookup.accountKey)),
    );
    return responses
      .map((response) => response.value)
      .filter((value): value is AddressLookupTableAccount => value !== null);
  }

  private classifyError(message: string): SubmitError {
    const lowered = message.toLowerCase();
    if (lowered.includes("blockhash")) {
      return new SubmitError("BLOCKHASH_EXPIRED", message);
    }
    if (lowered.includes("dropped") || lowered.includes("drop")) {
      return new SubmitError("JITO_DROPPED", message);
    }
    return new SubmitError("LAND_FAILED", message);
  }

  private normalizeSubmitError(error: unknown): SubmitError {
    if (error instanceof SubmitError) {
      return error;
    }
    if (error instanceof Error) {
      return this.classifyError(error.message);
    }
    return new SubmitError("LAND_FAILED", String(error));
  }
}
