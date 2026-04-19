import { Connection, PublicKey } from "@solana/web3.js";
import { logger } from "../utils/logger.js";

function deriveWsEndpoint(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export class HeliusMigrationWatcher {
  private connection: Connection | null = null;
  private subscriptionIds: number[] = [];
  private lastSignalAt = 0;
  private lastObservedLogAt = 0;
  private observedLogCount = 0;
  private started = false;

  constructor(
    private readonly rpcUrl: string,
    private readonly programIds: string[],
    private readonly debounceMs: number,
    private readonly onSignal: (input: { programId: string; signature: string }) => Promise<void>,
    private readonly onTelemetry?: (event: HeliusMigrationWatcherTelemetryEvent) => void,
  ) {}

  async start(): Promise<void> {
    if (this.started || this.programIds.length === 0) {
      return;
    }

    this.started = true;
    this.connection = new Connection(this.rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: deriveWsEndpoint(this.rpcUrl),
    });

    for (const programId of this.programIds) {
      const publicKey = new PublicKey(programId);
      const subscriptionId = await this.connection.onLogs(publicKey, async (logs) => {
        if (!this.started || !logs.signature) {
          return;
        }

        const now = Date.now();
        this.lastObservedLogAt = now;
        this.observedLogCount += 1;
        this.onTelemetry?.({
          type: "log_observed",
          observedAt: now,
          programId,
          signature: logs.signature,
          payloadBytes: Buffer.byteLength(JSON.stringify(logs)),
        });
        if (now - this.lastSignalAt < this.debounceMs) {
          return;
        }
        this.lastSignalAt = now;

        try {
          await this.onSignal({ programId, signature: logs.signature });
          this.onTelemetry?.({
            type: "signal_delivered",
            observedAt: now,
            programId,
            signature: logs.signature,
          });
        } catch (error) {
          logger.error({ err: error, programId, signature: logs.signature }, "helius migration watcher signal handler failed");
        }
      }, "confirmed");
      this.subscriptionIds.push(subscriptionId);
      this.onTelemetry?.({
        type: "subscription_opened",
        observedAt: Date.now(),
        programId,
        subscriptionId,
      });
    }

    logger.info({ programIds: this.programIds }, "helius migration watcher started");
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.connection) {
      await Promise.all(this.subscriptionIds.map(async (subscriptionId) => {
        try {
          await this.connection?.removeOnLogsListener(subscriptionId);
        } catch (error) {
          logger.warn({ err: error, subscriptionId }, "failed removing helius watcher subscription");
        }
      }));
    }
    this.subscriptionIds = [];
    this.connection = null;
  }

  getStatus(): HeliusMigrationWatcherStatus {
    return {
      started: this.started,
      configuredProgramCount: this.programIds.length,
      activeSubscriptionCount: this.subscriptionIds.length,
      observedLogCount: this.observedLogCount,
      lastObservedLogAt: this.lastObservedLogAt > 0 ? new Date(this.lastObservedLogAt).toISOString() : null,
      lastDeliveredSignalAt: this.lastSignalAt > 0 ? new Date(this.lastSignalAt).toISOString() : null,
    };
  }
}

export type HeliusMigrationWatcherTelemetryEvent =
  | {
    type: "subscription_opened";
    observedAt: number;
    programId: string;
    subscriptionId: number;
  }
  | {
    type: "log_observed";
    observedAt: number;
    programId: string;
    signature: string;
    payloadBytes: number;
  }
  | {
    type: "signal_delivered";
    observedAt: number;
    programId: string;
    signature: string;
  };

export type HeliusMigrationWatcherStatus = {
  started: boolean;
  configuredProgramCount: number;
  activeSubscriptionCount: number;
  observedLogCount: number;
  lastObservedLogAt: string | null;
  lastDeliveredSignalAt: string | null;
};
