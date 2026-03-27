import { createHmac, timingSafeEqual } from "node:crypto";
import { createHelius } from "helius-sdk";
import WebSocket from "ws";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import { ApiCallBuffer } from "../utils/api-call-buffer.js";
import { CircuitBreaker } from "../utils/circuit-breaker.js";
import { RateLimiter, backoffWithJitter } from "../utils/rate-limiter.js";

const log = createChildLogger("helius");

type HeliusInstance = ReturnType<typeof createHelius>;

export class HeliusService {
  private helius: HeliusInstance;
  private ws: WebSocket | null = null;
  private subscriptions: Map<number, (data: unknown) => void> = new Map();
  private signatureCallbacks: Map<number, { signature: string; resolve: (confirmed: boolean) => void }> = new Map();
  private subIdCounter = 1;
  private reconnectAttempts = 0;
  private apiBuffer: ApiCallBuffer;
  private circuitBreaker: CircuitBreaker;
  private lastSlotByAddress: Map<string, number> = new Map();
  private wsMessageHandler: ((data: unknown) => void) | null = null;
  private rateLimiter: RateLimiter;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = Date.now();
  private inflight: Map<string, Promise<unknown>> = new Map();

  constructor(apiBuffer?: ApiCallBuffer) {
    this.apiBuffer = apiBuffer ?? new ApiCallBuffer();
    this.helius = createHelius({ apiKey: config.helius.apiKey });
    this.circuitBreaker = new CircuitBreaker(
      "helius-rpc",
      config.circuitBreaker.heliusRpc.failureThreshold,
      config.circuitBreaker.heliusRpc.cooldownMs,
      config.circuitBreaker.heliusRpc.halfOpenMax,
    );
    this.rateLimiter = new RateLimiter("helius-global", 30, 60_000);
  }

  async getPriorityFeeEstimate(): Promise<number> {
    await this.rateLimiter.waitForSlot();
    try {
      return await this.circuitBreaker.execute(async () => {
        const res = await this.rpc("getPriorityFeeEstimate", [
          { accountKeys: [], options: { recommended: true } },
        ]);
        return (res as { priorityFeeEstimate: number })?.priorityFeeEstimate ?? config.api.heliusPriorityFeeFallback;
      });
    } catch (err) {
      log.warn({ err }, "getPriorityFeeEstimate failed");
      return config.api.heliusPriorityFeeFallback;
    }
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    await this.rateLimiter.waitForSlot();
    const result = await this.rpc("getLatestBlockhash", [
      { commitment: "confirmed" },
    ]) as { value: { blockhash: string; lastValidBlockHeight: number } };
    return result.value;
  }

  async simulateTransaction(tx: string): Promise<{ success: boolean; unitsConsumed?: number }> {
    await this.rateLimiter.waitForSlot();
    try {
      const result = await this.rpc("simulateTransaction", [
        tx,
        { encoding: "base64", commitment: "confirmed", replaceRecentBlockhash: true, sigVerify: false },
      ]) as { value: { err: unknown; unitsConsumed?: number } };

      return {
        success: !result.value.err,
        unitsConsumed: result.value.unitsConsumed,
      };
    } catch (err) {
      log.warn({ err }, "simulateTransaction failed");
      return { success: false };
    }
  }

  async sendTransaction(tx: string, opts?: { skipPreflight?: boolean; maxRetries?: number }): Promise<string | null> {
    await this.rateLimiter.waitForSlot();
    try {
      return await this.circuitBreaker.execute(async () => {
        const res = await this.rpc("sendTransaction", [
          tx,
          {
            encoding: "base64",
            skipPreflight: opts?.skipPreflight ?? true,
            maxRetries: opts?.maxRetries ?? 3,
          },
        ]);
        return res as string;
      });
    } catch (err) {
      log.error({ err }, "sendTransaction failed");
      return null;
    }
  }

  async sendTransactionFast(tx: string): Promise<string | null> {
    await this.rateLimiter.waitForSlot();
    try {
      return await this.circuitBreaker.execute(async () => {
        const res = await this.rpc("sendTransaction", [
          tx,
          {
            encoding: "base64",
            skipPreflight: true,
            maxRetries: 0,
          },
        ]);
        return res as string;
      });
    } catch (err) {
      log.error({ err }, "sendTransactionFast failed");
      return null;
    }
  }

  async confirmTransaction(
    signature: string,
    blockhashInfo?: { blockhash: string; lastValidBlockHeight: number },
    timeoutMs: number = config.api.heliusConfirmTimeoutMs,
  ): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.confirmViaSubscription(signature, timeoutMs);
    }
    return this.confirmViaPolling(signature, timeoutMs);
  }

  private confirmViaSubscription(signature: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        for (const [subId, entry] of this.signatureCallbacks.entries()) {
          if (entry.signature === signature) {
            this.signatureCallbacks.delete(subId);
            break;
          }
        }
        resolve(false);
      }, timeoutMs);

      const id = this.subIdCounter++;

      this.signatureCallbacks.set(id, {
        signature,
        resolve: (confirmed) => {
          clearTimeout(timer);
          resolve(confirmed);
        },
      });

      this.ws?.send(JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "signatureSubscribe",
        params: [signature, { commitment: "confirmed" }],
      }));
      this.trackApiCall("helius", "signatureSubscribe", 0);
    });
  }

  private async confirmViaPolling(signature: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.rpc("getSignatureStatuses", [[signature]]) as {
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

  async getSignaturesForAddress(address: string, limit: number = 100): Promise<unknown[]> {
    await this.rateLimiter.waitForSlot();
    const result = await this.rpc("getSignaturesForAddress", [
      address, { limit },
    ], 10) as unknown[];
    return result ?? [];
  }

  async getSignaturesForAddressIncremental(address: string, limit: number = 100): Promise<unknown[]> {
    await this.rateLimiter.waitForSlot();
    const lastSlot = this.lastSlotByAddress.get(address);
    const params: Record<string, unknown> = { limit };
    if (lastSlot) {
      params.minContextSlot = lastSlot;
    }

    const result = await this.rpc("getSignaturesForAddress", [
      address, params,
    ], 10) as Array<Record<string, unknown>>;

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
  }): Promise<unknown[]> {
    await this.rateLimiter.waitForSlot();
    try {
      return this.dedupedFetch(`txs:${address}`, () =>
        this.circuitBreaker.execute(async () => {
          const sdkOpts: Record<string, unknown> = {
            limit: opts?.limit ?? 100,
          };
          if (opts?.tokenAccounts) {
            sdkOpts.filters = { tokenAccounts: opts.tokenAccounts };
          }

          const result = await this.helius.getTransactionsForAddress([address, sdkOpts]);
          this.trackApiCall("helius", "getTransactionsForAddress", 100);
          return (result as unknown as unknown[]) ?? [];
        }),
      );
    } catch (err) {
      log.warn({ err, address }, "getTransactionsForAddress failed");
      return [];
    }
  }

  async getAssetsByOwner(owner: string): Promise<unknown[]> {
    await this.rateLimiter.waitForSlot();
    const result = await this.rpc("getAssetsByOwner", [
      { ownerAddress: owner, page: 1, limit: 100 },
    ], 10) as { items: unknown[] };
    return result?.items ?? [];
  }

  async getAssetBatch(assetIds: string[]): Promise<unknown[]> {
    if (assetIds.length === 0) return [];
    await this.rateLimiter.waitForSlot();

    try {
      return await this.circuitBreaker.execute(async () => {
        const result = await this.helius.getAssetBatch({
          ids: assetIds,
          options: { showFungible: true },
        });
        this.trackApiCall("helius", "getAssetBatch", assetIds.length);
        return (result as unknown[]) ?? [];
      });
    } catch (err) {
      log.warn({ err }, "getAssetBatch failed");
      return [];
    }
  }

  async parseTransaction(txSignature: string): Promise<unknown> {
    await this.rateLimiter.waitForSlot();
    try {
      return await this.circuitBreaker.execute(async () => {
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
        this.trackApiCall("helius", "parseTransaction", 100);
        return data?.[0] ?? null;
      });
    } catch (err) {
      log.warn({ err, txSignature }, "parseTransaction failed");
      return null;
    }
  }

  async getWalletFundingSource(address: string): Promise<unknown> {
    await this.rateLimiter.waitForSlot();
    try {
      return await this.circuitBreaker.execute(async () => {
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
        this.trackApiCall("helius", "walletFundingSource", 100);
        return data;
      });
    } catch (err) {
      log.warn({ err, address }, "getWalletFundingSource failed");
      return null;
    }
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
      this.heartbeatInterval = setInterval(() => {
        if (Date.now() - this.lastPong > 35_000) {
          log.warn("WebSocket pong timeout — reconnecting");
          this.reconnect();
          return;
        }
        this.ws?.ping();
      }, 30_000);
      for (const address of this.lastSlotByAddress.keys()) {
        this.subscribeToAccount(address).catch(() => {});
      }
    });

    this.ws.on("pong", () => {
      this.lastPong = Date.now();
    });

    this.ws.on("message", (raw: Buffer) => {
      if (config.helius.webhookSecret) {
        const sig = raw.toString("hex");
        const expected = createHmac("sha256", config.helius.webhookSecret)
          .update(raw)
          .digest("hex");
        let verified = false;
        try {
          verified = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
        } catch {
          verified = false;
        }
        if (!verified) {
          log.warn("webhook signature mismatch — dropping message");
          return;
        }
      }
      try {
        const data = JSON.parse(raw.toString());

        if (data.method === "signatureNotification") {
          const subId = data.params?.subscription;
          for (const [storedId, entry] of this.signatureCallbacks.entries()) {
            if (storedId === subId || this.signatureCallbacks.size === 1) {
              const err = data.params?.result?.value?.err;
              entry.resolve(!err);
              this.signatureCallbacks.delete(storedId);
              break;
            }
          }
          return;
        }

        if (data.method === "accountNotification" || data.method === "logsNotification" || data.method === "programNotification") {
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
      if (this.reconnectAttempts < 10) {
        const delay = backoffWithJitter(this.reconnectAttempts, 3000, 60_000);
        this.reconnectAttempts++;
        if (this.reconnectAttempts === 3) {
          log.warn({ attempts: 3 }, "3 consecutive WebSocket reconnects — check Helius status");
        }
        setTimeout(() => {
          if (this.wsMessageHandler) this.connectWebSocket(this.wsMessageHandler);
        }, delay);
      } else {
        log.error("max websocket reconnect attempts reached — scheduling long-term recovery");
        this.reconnectAttempts = 0;
        setTimeout(() => {
          if (this.wsMessageHandler) this.connectWebSocket(this.wsMessageHandler);
        }, 300_000);
      }
    });

    this.ws.on("error", (err) => {
      log.error({ err }, "websocket error");
    });
  }

  async subscribe(method: string, params: unknown[]): Promise<number> {
    return new Promise((resolve, reject) => {
      const id = this.subIdCounter++;
      const timeout = setTimeout(() => {
        this.subscriptions.delete(id);
        reject(new Error(`subscription timeout: ${method}`));
      }, 5000);
      this.subscriptions.set(id, (result) => {
        clearTimeout(timeout);
        resolve(result as number);
      });
      this.ws?.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  async subscribeToAccount(address: string): Promise<number> {
    return this.subscribe("accountSubscribe", [
      address,
      {
        commitment: "confirmed",
        encoding: "jsonParsed",
        dataSlice: { offset: 0, length: 64 },
      },
    ]);
  }

  async subscribeToLogs(programId: string): Promise<number> {
    return this.subscribe("logsSubscribe", [
      { mentions: [programId] },
      { commitment: "confirmed" },
    ]);
  }

  async subscribeToProgram(programId: string): Promise<number> {
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
    this.ws?.removeAllListeners();
    this.ws?.close();
    this.ws = null;
    this.wsMessageHandler = null;
  }

  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  private async rpc(method: string, params: unknown[], credits: number = 1): Promise<unknown> {
    return this.circuitBreaker.execute(async () => {
      const res = await fetch(config.helius.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        signal: AbortSignal.timeout(config.api.heliusTimeoutMs),
      });
      const data = (await res.json()) as { result?: unknown; error?: { code: number; message: string } };
      this.trackApiCall("helius", method, credits);

      if (data.error) {
        throw new Error(`RPC error ${data.error.code}: ${data.error.message}`);
      }
      return data.result;
    });
  }

  private trackApiCall(service: string, endpoint: string, credits: number): void {
    this.apiBuffer.log({
      service: service === "helius" ? "HELIUS" : "BIRDEYE",
      endpoint,
      credits,
    });
  }

  private updateSlot(address: string, slot: number): void {
    this.lastSlotByAddress.delete(address);
    this.lastSlotByAddress.set(address, slot);
    if (this.lastSlotByAddress.size > 1000) {
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

  async flushApiCalls(): Promise<void> {
    await this.apiBuffer.flush();
  }
}
