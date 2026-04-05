import { createHelius } from "helius-sdk";
import WebSocket from "ws";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import { CircuitBreaker } from "../utils/circuit-breaker.js";
import { RateLimiter, backoffWithJitter } from "../utils/rate-limiter.js";
import { ApiBudgetManager } from "../core/api-budget-manager.js";
import type { ApiRequestMeta } from "../utils/types.js";

const log = createChildLogger("helius");

type HeliusInstance = ReturnType<typeof createHelius>;

export class HeliusService {
  private helius: HeliusInstance;
  private ws: WebSocket | null = null;
  private subscriptions: Map<number, (data: unknown) => void> = new Map();
  private signatureCallbacks: Map<number, { signature: string; resolve: (confirmed: boolean) => void }> = new Map();
  private pendingSignatureRequests: Map<number, {
    signature: string;
    resolve: (confirmed: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private subIdCounter = 1;
  private reconnectAttempts = 0;
  private circuitBreaker: CircuitBreaker;
  private lastSlotByAddress: Map<string, number> = new Map();
  private wsMessageHandler: ((data: unknown) => void) | null = null;
  private rateLimiter: RateLimiter;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = Date.now();
  private inflight: Map<string, Promise<unknown>> = new Map();
  private accountSubscriptions: Map<number, string> = new Map();
  private subscribedAccounts: Set<string> = new Set();
  private subscribedPrograms: Set<string> = new Set();
  private subscribedLogs: Set<string> = new Set();

  constructor(private budgetManager: ApiBudgetManager) {
    this.helius = createHelius({ apiKey: config.helius.apiKey });
    this.circuitBreaker = new CircuitBreaker(
      "helius-rpc",
      config.circuitBreaker.heliusRpc.failureThreshold,
      config.circuitBreaker.heliusRpc.cooldownMs,
      config.circuitBreaker.heliusRpc.halfOpenMax,
    );
    this.rateLimiter = new RateLimiter(
      "helius-global",
      config.helius.rateLimitRps,
      config.helius.rateLimitWindowMs,
    );
  }

  async getPriorityFeeEstimate(meta?: ApiRequestMeta): Promise<number> {
    await this.rateLimiter.waitForSlot();
    try {
      return await this.circuitBreaker.execute(async () => {
        const res = await this.rpc("getPriorityFeeEstimate", [
          { accountKeys: [], options: { recommended: true } },
        ], config.apiBudgets.helius.credits.default, meta);
        return (res as { priorityFeeEstimate: number })?.priorityFeeEstimate ?? config.api.heliusPriorityFeeFallback;
      });
    } catch (err) {
      log.warn({ err }, "getPriorityFeeEstimate failed");
      return config.api.heliusPriorityFeeFallback;
    }
  }

  async getLatestBlockhash(meta?: ApiRequestMeta): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    await this.rateLimiter.waitForSlot();
    const result = await this.rpc("getLatestBlockhash", [
      { commitment: "confirmed" },
    ], config.apiBudgets.helius.credits.default, meta) as { value: { blockhash: string; lastValidBlockHeight: number } };
    return result.value;
  }

  async simulateTransaction(tx: string, meta?: ApiRequestMeta): Promise<{ success: boolean; unitsConsumed?: number }> {
    await this.rateLimiter.waitForSlot();
    try {
      const result = await this.rpc("simulateTransaction", [
        tx,
        { encoding: "base64", commitment: "confirmed", replaceRecentBlockhash: true, sigVerify: false },
      ], config.apiBudgets.helius.credits.default, meta) as { value: { err: unknown; unitsConsumed?: number } };

      return {
        success: !result.value.err,
        unitsConsumed: result.value.unitsConsumed,
      };
    } catch (err) {
      log.warn({ err }, "simulateTransaction failed");
      return { success: false };
    }
  }

  async sendTransaction(
    tx: string,
    opts?: { skipPreflight?: boolean; maxRetries?: number },
    meta?: ApiRequestMeta,
  ): Promise<string | null> {
    await this.rateLimiter.waitForSlot();
    try {
      return await this.circuitBreaker.execute(async () => {
        const res = await this.rpc("sendTransaction", [
          tx,
          {
            encoding: "base64",
            skipPreflight: opts?.skipPreflight ?? true,
            maxRetries: opts?.maxRetries ?? config.api.heliusMaxRetries,
          },
        ], config.apiBudgets.helius.credits.default, meta);
        return res as string;
      });
    } catch (err) {
      log.error({ err }, "sendTransaction failed");
      return null;
    }
  }

  async sendTransactionFast(tx: string, meta?: ApiRequestMeta): Promise<string | null> {
    await this.rateLimiter.waitForSlot();
    try {
      return await this.circuitBreaker.execute(async () => {
        const res = await this.rpc("sendTransaction", [
          tx,
          {
            encoding: "base64",
            skipPreflight: true,
            maxRetries: config.api.heliusFastMaxRetries,
          },
        ], config.apiBudgets.helius.credits.default, meta);
        return res as string;
      });
    } catch (err) {
      log.error({ err }, "sendTransactionFast failed");
      return null;
    }
  }

  async confirmTransaction(
    signature: string,
    _blockhashInfo?: { blockhash: string; lastValidBlockHeight: number },
    meta?: ApiRequestMeta,
    timeoutMs: number = config.api.heliusConfirmTimeoutMs,
  ): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.confirmViaSubscription(signature, timeoutMs);
    }
    return this.confirmViaPolling(signature, timeoutMs, meta);
  }

  private confirmViaSubscription(signature: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = this.subIdCounter++;
      const timer = setTimeout(() => {
        const pending = this.pendingSignatureRequests.get(requestId);
        if (pending) {
          this.pendingSignatureRequests.delete(requestId);
        } else {
          for (const [subId, entry] of this.signatureCallbacks.entries()) {
            if (entry.signature === signature) {
              this.signatureCallbacks.delete(subId);
              break;
            }
          }
        }
        resolve(false);
      }, timeoutMs);

      this.pendingSignatureRequests.set(requestId, {
        signature,
        resolve,
        timer,
      });

      this.ws?.send(JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "signatureSubscribe",
        params: [signature, { commitment: "confirmed" }],
      }));
    });
  }

  private async confirmViaPolling(signature: string, timeoutMs: number, meta?: ApiRequestMeta): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.rpc("getSignatureStatuses", [[signature]], config.apiBudgets.helius.credits.default, meta) as {
        value: Array<{ confirmationStatus: string } | null>;
      };
      const status = result?.value?.[0];
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        return true;
      }
      await new Promise((r) => setTimeout(r, config.api.heliusConfirmPollMs));
    }
    return false;
  }

  async getSignaturesForAddress(
    address: string,
    limit: number = config.helius.txHistoryDefaultLimit,
    meta?: ApiRequestMeta,
  ): Promise<unknown[]> {
    await this.rateLimiter.waitForSlot();
    const result = await this.rpc("getSignaturesForAddress", [
      address, { limit },
    ], config.apiBudgets.helius.credits.getSignaturesForAddress, meta) as unknown[];
    return result ?? [];
  }

  async getSignaturesForAddressIncremental(
    address: string,
    limit: number = config.helius.txHistoryDefaultLimit,
    meta?: ApiRequestMeta,
  ): Promise<unknown[]> {
    await this.rateLimiter.waitForSlot();
    const lastSlot = this.lastSlotByAddress.get(address);
    const params: Record<string, unknown> = { limit };
    if (lastSlot) {
      params.minContextSlot = lastSlot;
    }

    const result = await this.rpc("getSignaturesForAddress", [
      address, params,
    ], config.apiBudgets.helius.credits.getSignaturesForAddress, meta) as Array<Record<string, unknown>>;

    if (result?.length > 0) {
      const maxSlot = Math.max(...result.map((r) => (r.slot as number) ?? 0));
      if (maxSlot > 0) {
        this.updateSlot(address, maxSlot);
      }
    }

    return result ?? [];
  }

  async getTransactionsForAddress(address: string, opts?: {
    tokenAccounts?: "balanceChanged" | "all" | "none";
    limit?: number;
  }, meta?: ApiRequestMeta): Promise<unknown[]> {
    await this.rateLimiter.waitForSlot();
    try {
      return this.dedupedFetch(`txs:${address}`, () =>
        this.circuitBreaker.execute(async () => {
          const reservation = await this.budgetManager.reserve("HELIUS", config.apiBudgets.helius.credits.getTransactionsForAddress, meta);
          const startedAt = Date.now();
          const sdkOpts: Record<string, unknown> = {
            limit: opts?.limit ?? config.helius.txHistoryDefaultLimit,
          };
          if (opts?.tokenAccounts) {
            sdkOpts.filters = { tokenAccounts: opts.tokenAccounts };
          }

          try {
            const result = await this.helius.getTransactionsForAddress([address, sdkOpts]);
            reservation.commit({
              endpoint: "getTransactionsForAddress",
              credits: config.apiBudgets.helius.credits.getTransactionsForAddress,
              statusCode: 200,
              latencyMs: Date.now() - startedAt,
            });
            return (result as unknown as unknown[]) ?? [];
          } catch (err) {
            reservation.commit({
              endpoint: "getTransactionsForAddress",
              credits: config.apiBudgets.helius.credits.getTransactionsForAddress,
              statusCode: 0,
              latencyMs: Date.now() - startedAt,
              success: false,
            });
            throw err;
          }
        }),
      );
    } catch (err) {
      log.warn({ err, address }, "getTransactionsForAddress failed");
      return [];
    }
  }

  async getAssetsByOwner(owner: string, meta?: ApiRequestMeta): Promise<unknown[]> {
    await this.rateLimiter.waitForSlot();
    const result = await this.rpc("getAssetsByOwner", [
      {
        ownerAddress: owner,
        page: config.helius.assetsByOwnerPage,
        limit: config.helius.assetsByOwnerLimit,
      },
    ], config.apiBudgets.helius.credits.getAssetsByOwner, meta) as { items: unknown[] };
    return result?.items ?? [];
  }

  async getWalletBalanceSol(address: string = config.solana.publicKey, meta?: ApiRequestMeta): Promise<number | null> {
    await this.rateLimiter.waitForSlot();
    try {
      const result = await this.rpc("getBalance", [
        address,
        { commitment: "confirmed" },
      ], config.apiBudgets.helius.credits.default, meta) as { value: number };
      return ((result?.value ?? 0) as number) / 1e9;
    } catch (err) {
      log.warn({ err, address }, "getWalletBalanceSol failed");
      return null;
    }
  }

  async getAssetBatch(assetIds: string[], meta?: ApiRequestMeta): Promise<unknown[]> {
    if (assetIds.length === 0) return [];
    await this.rateLimiter.waitForSlot();

    try {
      return await this.circuitBreaker.execute(async () => {
        const reservation = await this.budgetManager.reserve("HELIUS", config.apiBudgets.helius.credits.getAssetBatch, { ...meta, batchSize: assetIds.length });
        const startedAt = Date.now();
        try {
          const result = await this.helius.getAssetBatch({
            ids: assetIds,
            options: { showFungible: true },
          });
          reservation.commit({
            endpoint: "getAssetBatch",
            credits: config.apiBudgets.helius.credits.getAssetBatch,
            statusCode: 200,
            latencyMs: Date.now() - startedAt,
            batchSize: assetIds.length,
          });
          return (result as unknown[]) ?? [];
        } catch (err) {
          reservation.commit({
            endpoint: "getAssetBatch",
            credits: config.apiBudgets.helius.credits.getAssetBatch,
            statusCode: 0,
            latencyMs: Date.now() - startedAt,
            success: false,
            batchSize: assetIds.length,
          });
          throw err;
        }
      });
    } catch (err) {
      log.warn({ err }, "getAssetBatch failed");
      return [];
    }
  }

  async parseTransaction(txSignature: string, meta?: ApiRequestMeta): Promise<unknown> {
    await this.rateLimiter.waitForSlot();
    const reservation = await this.budgetManager.reserve("HELIUS", config.apiBudgets.helius.credits.parseTransaction, meta);
    const startedAt = Date.now();
    try {
      const parsed = await this.circuitBreaker.execute(async () => {
        const res = await fetch(
          "https://api.helius.xyz/v0/transactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${config.helius.apiKey}`,
            },
            body: JSON.stringify({ transactions: [txSignature] }),
            signal: AbortSignal.timeout(config.api.heliusTimeoutMs),
          },
        );
        const data = (await res.json()) as unknown[];
        return data?.[0] ?? null;
      });
      reservation.commit({
        endpoint: "parseTransaction",
        credits: config.apiBudgets.helius.credits.parseTransaction,
        statusCode: 200,
        latencyMs: Date.now() - startedAt,
      });
      return parsed;
    } catch (err) {
      reservation.commit({
        endpoint: "parseTransaction",
        credits: config.apiBudgets.helius.credits.parseTransaction,
        statusCode: 0,
        latencyMs: Date.now() - startedAt,
        success: false,
      });
      log.warn({ err, txSignature }, "parseTransaction failed");
      return null;
    }
  }

  async getWalletFundingSource(address: string, meta?: ApiRequestMeta): Promise<unknown> {
    await this.rateLimiter.waitForSlot();
    const reservation = await this.budgetManager.reserve("HELIUS", config.apiBudgets.helius.credits.walletFundingSource, meta);
    const startedAt = Date.now();
    try {
      const result = await this.circuitBreaker.execute(async () => {
        const res = await fetch(
          `https://api.helius.xyz/v0/wallet/${address}/funding-source`,
          {
            headers: {
              "Authorization": `Bearer ${config.helius.apiKey}`,
            },
            signal: AbortSignal.timeout(config.api.heliusTimeoutMs),
          },
        );
        const data = (await res.json()) as unknown;
        return data;
      });
      reservation.commit({
        endpoint: "walletFundingSource",
        credits: config.apiBudgets.helius.credits.walletFundingSource,
        statusCode: 200,
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (err) {
      reservation.commit({
        endpoint: "walletFundingSource",
        credits: config.apiBudgets.helius.credits.walletFundingSource,
        statusCode: 0,
        latencyMs: Date.now() - startedAt,
        success: false,
      });
      log.warn({ err, address }, "getWalletFundingSource failed");
      return null;
    }
  }

  async getTransaction(signature: string, meta?: ApiRequestMeta): Promise<Record<string, unknown> | null> {
    await this.rateLimiter.waitForSlot();
    try {
      const result = await this.rpc("getTransaction", [
        signature,
        { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ], config.apiBudgets.helius.credits.getTransaction, meta) as Record<string, unknown> | null;
      return result;
    } catch (err) {
      log.warn({ err, signature }, "getTransaction failed");
      return null;
    }
  }

  async getWalletTradeFromSignature(
    signature: string,
    walletAddress: string,
    meta?: ApiRequestMeta,
  ): Promise<{ signature: string; tokenAddress: string; amountToken: number; amountSol: number; side: "BUY" | "SELL"; blockTime: number | null } | null> {
    const tx = await this.getTransaction(signature, meta);
    if (!tx) return null;

    const transaction = tx.transaction as Record<string, unknown> | undefined;
    const metaInfo = tx.meta as Record<string, unknown> | undefined;
    const message = transaction?.message as Record<string, unknown> | undefined;
    const accountKeys = (message?.accountKeys as unknown[]) ?? [];
    const walletIndex = accountKeys.findIndex((key) => extractAccountKey(key) === walletAddress);
    if (walletIndex < 0 || !metaInfo) return null;

    const preBalances = (metaInfo.preBalances as number[] | undefined) ?? [];
    const postBalances = (metaInfo.postBalances as number[] | undefined) ?? [];
    const lamportDelta = ((postBalances[walletIndex] ?? 0) - (preBalances[walletIndex] ?? 0)) / 1e9;

    const tokenDeltas = computeWalletTokenDeltas(
      walletAddress,
      (metaInfo.preTokenBalances as Array<Record<string, unknown>> | undefined) ?? [],
      (metaInfo.postTokenBalances as Array<Record<string, unknown>> | undefined) ?? [],
    );
    if (tokenDeltas.length === 0) return null;

    const primary = tokenDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (!primary || primary.delta === 0) return null;

    const side = primary.delta > 0 ? "BUY" : "SELL";
    const blockTime = Number(tx.blockTime ?? 0);
    return {
      signature,
      tokenAddress: primary.mint,
      amountToken: Math.abs(primary.delta),
      amountSol: Math.abs(lamportDelta),
      side,
      blockTime: blockTime > 0 ? blockTime : null,
    };
  }

  async getWalletTradeFillFromSignature(
    signature: string,
    walletAddress: string,
    tokenAddress: string,
    meta?: ApiRequestMeta,
  ): Promise<{ signature: string; tokenAddress: string; amountToken: number; amountSol: number; feeSol: number; side: "BUY" | "SELL" } | null> {
    const tx = await this.getTransaction(signature, meta);
    if (!tx) return null;

    const transaction = tx.transaction as Record<string, unknown> | undefined;
    const metaInfo = tx.meta as Record<string, unknown> | undefined;
    const message = transaction?.message as Record<string, unknown> | undefined;
    const accountKeys = (message?.accountKeys as unknown[]) ?? [];
    const walletIndex = accountKeys.findIndex((key) => extractAccountKey(key) === walletAddress);
    if (walletIndex < 0 || !metaInfo) return null;

    const preBalances = (metaInfo.preBalances as number[] | undefined) ?? [];
    const postBalances = (metaInfo.postBalances as number[] | undefined) ?? [];
    const lamportDelta = ((postBalances[walletIndex] ?? 0) - (preBalances[walletIndex] ?? 0)) / 1e9;
    const feeSol = Number(metaInfo.fee ?? 0) / 1e9;

    const tokenDeltas = computeWalletTokenDeltas(
      walletAddress,
      (metaInfo.preTokenBalances as Array<Record<string, unknown>> | undefined) ?? [],
      (metaInfo.postTokenBalances as Array<Record<string, unknown>> | undefined) ?? [],
    );
    const tokenDelta = tokenDeltas.find((entry) => entry.mint === tokenAddress)?.delta ?? 0;
    if (tokenDelta === 0) return null;

    const side = tokenDelta > 0 ? "BUY" : "SELL";
    const amountToken = Math.abs(tokenDelta);
    const amountSol = side === "BUY"
      ? Math.max(0, Math.abs(lamportDelta) - feeSol)
      : Math.max(0, lamportDelta + feeSol);

    if (amountToken <= 0 || amountSol <= 0) return null;

    return {
      signature,
      tokenAddress,
      amountToken,
      amountSol,
      feeSol,
      side,
    };
  }

  getLastSlot(address: string): number | undefined {
    return this.lastSlotByAddress.get(address);
  }

  setLastSlot(address: string, slot: number): void {
    this.lastSlotByAddress.set(address, slot);
  }

  connectWebSocket(onMessage: (data: unknown) => void): void {
    this.wsMessageHandler = onMessage;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }
    this.ws = new WebSocket(config.helius.wsUrl);

    this.ws.on("open", () => {
      log.info("websocket connected");
      this.reconnectAttempts = 0;
      this.lastPong = Date.now();
      this.accountSubscriptions.clear();
      this.heartbeatInterval = setInterval(() => {
        if (Date.now() - this.lastPong > config.helius.websocket.pongTimeoutMs) {
          log.warn("WebSocket pong timeout — reconnecting");
          this.reconnect();
          return;
        }
        this.ws?.ping();
      }, config.helius.websocket.heartbeatIntervalMs);
      for (const address of this.subscribedAccounts) {
        this.subscribeToAccount(address).catch(() => {});
      }
      for (const programId of this.subscribedPrograms) {
        this.subscribeToProgram(programId).catch(() => {});
      }
      for (const programId of this.subscribedLogs) {
        this.subscribeToLogs(programId).catch(() => {});
      }
    });

    this.ws.on("pong", () => {
      this.lastPong = Date.now();
    });

    this.ws.on("message", (raw: Buffer) => {
      try {
        const data = JSON.parse(raw.toString());

        if (data.method === "signatureNotification") {
          const subId = data.params?.subscription;
          const entry = this.signatureCallbacks.get(subId);
          if (entry) {
            const err = data.params?.result?.value?.err;
            entry.resolve(!err);
            this.signatureCallbacks.delete(subId);
          }
          return;
        }

        if (data.id && this.pendingSignatureRequests.has(data.id)) {
          const pending = this.pendingSignatureRequests.get(data.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingSignatureRequests.delete(data.id);
            this.signatureCallbacks.set(data.result as number, {
              signature: pending.signature,
              resolve: pending.resolve,
            });
          }
          return;
        }

        if (data.method === "accountNotification" || data.method === "logsNotification" || data.method === "programNotification") {
          if (data.method === "accountNotification") {
            const subscriptionAddress = this.accountSubscriptions.get(data.params?.subscription);
            if (subscriptionAddress) {
              data.subscriptionAddress = subscriptionAddress;
            }
          }
          onMessage(data);
        }

        if (data.id && this.subscriptions.has(data.id)) {
          this.subscriptions.get(data.id)!(data.result);
          this.subscriptions.delete(data.id);
        }
      } catch (err) {
        log.error({ err }, "ws message parse error");
      }
    });

    this.ws.on("close", () => {
      log.warn("websocket closed, reconnecting...");
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.reconnectAttempts < config.helius.websocket.reconnectMaxAttempts) {
        const delay = backoffWithJitter(
          this.reconnectAttempts,
          config.helius.websocket.reconnectBackoffBaseMs,
          config.helius.websocket.reconnectBackoffMaxMs,
        );
        this.reconnectAttempts++;
        if (this.reconnectAttempts === config.helius.websocket.reconnectWarnThreshold) {
          log.warn(
            { attempts: config.helius.websocket.reconnectWarnThreshold },
            `${config.helius.websocket.reconnectWarnThreshold} consecutive WebSocket reconnects — check Helius status`,
          );
        }
        setTimeout(() => {
          if (this.wsMessageHandler) this.connectWebSocket(this.wsMessageHandler);
        }, delay);
      } else {
        log.error("max websocket reconnect attempts reached — scheduling long-term recovery");
        this.reconnectAttempts = 0;
        setTimeout(() => {
          if (this.wsMessageHandler) this.connectWebSocket(this.wsMessageHandler);
        }, config.helius.websocket.longRecoveryDelayMs);
      }
    });

    this.ws.on("error", (err) => {
      log.error({ err }, "websocket error");
    });
  }

  async subscribe(method: string, params: unknown[]): Promise<number> {
    await this.waitForWebSocketOpen();
    return new Promise((resolve, reject) => {
      const id = this.subIdCounter++;
      const timeout = setTimeout(() => {
        this.subscriptions.delete(id);
        reject(new Error(`subscription timeout: ${method}`));
      }, config.helius.websocket.subscriptionTimeoutMs);
      this.subscriptions.set(id, (result) => {
        clearTimeout(timeout);
        resolve(result as number);
      });
      this.ws?.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  async subscribeToAccount(address: string): Promise<number> {
    this.subscribedAccounts.add(address);
    const subId = await this.subscribe("accountSubscribe", [
      address,
      {
        commitment: "confirmed",
        encoding: "jsonParsed",
        dataSlice: { offset: 0, length: 64 },
      },
    ]);
    this.accountSubscriptions.set(subId, address);
    return subId;
  }

  async subscribeToLogs(programId: string): Promise<number> {
    this.subscribedLogs.add(programId);
    return this.subscribe("logsSubscribe", [
      { mentions: [programId] },
      { commitment: "confirmed" },
    ]);
  }

  async subscribeToProgram(programId: string): Promise<number> {
    this.subscribedPrograms.add(programId);
    return this.subscribe("programSubscribe", [
      programId,
      {
        commitment: "confirmed",
        encoding: "jsonParsed",
        dataSlice: { offset: 0, length: 64 },
      },
    ]);
  }

  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const [, entry] of this.signatureCallbacks) {
      entry.resolve(false);
    }
    this.signatureCallbacks.clear();
    for (const [, pending] of this.pendingSignatureRequests) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.pendingSignatureRequests.clear();
    this.ws?.removeAllListeners();
    this.ws?.close();
    this.ws = null;
    this.wsMessageHandler = null;
  }

  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  private async rpc(
    method: string,
    params: unknown[],
    credits: number = config.apiBudgets.helius.credits.default,
    meta?: ApiRequestMeta,
  ): Promise<unknown> {
    const reservation = await this.budgetManager.reserve("HELIUS", credits, meta);
    const startedAt = Date.now();
    try {
      return await this.circuitBreaker.execute(async () => {
        const res = await fetch(config.helius.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
          signal: AbortSignal.timeout(config.api.heliusTimeoutMs),
        });
        const data = (await res.json()) as { result?: unknown; error?: { code: number; message: string } };

        if (data.error) {
          throw new Error(`RPC error ${data.error.code}: ${data.error.message}`);
        }
        reservation.commit({
          endpoint: method,
          credits,
          statusCode: res.status,
          latencyMs: Date.now() - startedAt,
          batchSize: meta?.batchSize,
        });
        return data.result;
      });
    } catch (err) {
      reservation.commit({
        endpoint: method,
        credits,
        statusCode: 0,
        latencyMs: Date.now() - startedAt,
        success: false,
        batchSize: meta?.batchSize,
      });
      throw err;
    }
  }

  private updateSlot(address: string, slot: number): void {
    this.lastSlotByAddress.delete(address);
    this.lastSlotByAddress.set(address, slot);
    if (this.lastSlotByAddress.size > config.helius.websocket.lastSlotCacheSize) {
      this.lastSlotByAddress.delete(this.lastSlotByAddress.keys().next().value!);
    }
  }

  private reconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wsMessageHandler) {
      this.connectWebSocket(this.wsMessageHandler);
    }
  }

  private dedupedFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async waitForWebSocketOpen(timeoutMs: number = config.helius.websocket.waitForOpenTimeoutMs): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (!this.ws) {
      throw new Error("websocket not connected");
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("websocket open timeout"));
      }, timeoutMs);

      const handleOpen = () => {
        cleanup();
        resolve();
      };

      const handleClose = () => {
        cleanup();
        reject(new Error("websocket closed before open"));
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.ws?.off("open", handleOpen);
        this.ws?.off("close", handleClose);
      };

      this.ws?.once("open", handleOpen);
      this.ws?.once("close", handleClose);
    });
  }
}

function extractAccountKey(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "pubkey" in value) {
    const pubkey = (value as { pubkey?: unknown }).pubkey;
    return typeof pubkey === "string" ? pubkey : "";
  }
  return "";
}

function parseUiAmount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const ui = value as { uiAmount?: unknown; uiAmountString?: unknown };
  if (typeof ui.uiAmount === "number") return ui.uiAmount;
  if (typeof ui.uiAmountString === "string") {
    const parsed = Number(ui.uiAmountString);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function computeWalletTokenDeltas(
  walletAddress: string,
  preBalances: Array<Record<string, unknown>>,
  postBalances: Array<Record<string, unknown>>,
): Array<{ mint: string; delta: number }> {
  const deltas = new Map<string, number>();

  const apply = (balances: Array<Record<string, unknown>>, multiplier: -1 | 1) => {
    for (const balance of balances) {
      const owner = typeof balance.owner === "string" ? balance.owner : "";
      if (owner !== walletAddress) continue;
      const mint = typeof balance.mint === "string" ? balance.mint : "";
      if (!mint) continue;
      const amount = parseUiAmount(balance.uiTokenAmount);
      deltas.set(mint, (deltas.get(mint) ?? 0) + amount * multiplier);
    }
  };

  apply(preBalances, -1);
  apply(postBalances, 1);

  return [...deltas.entries()]
    .filter(([, delta]) => delta !== 0)
    .map(([mint, delta]) => ({ mint, delta }));
}
