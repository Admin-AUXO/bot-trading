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
  private started = false;

  constructor(
    private readonly rpcUrl: string,
    private readonly programIds: string[],
    private readonly debounceMs: number,
    private readonly onSignal: (input: { programId: string; signature: string }) => Promise<void>,
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
        if (now - this.lastSignalAt < this.debounceMs) {
          return;
        }
        this.lastSignalAt = now;

        try {
          await this.onSignal({ programId, signature: logs.signature });
        } catch (error) {
          logger.error({ err: error, programId, signature: logs.signature }, "helius migration watcher signal handler failed");
        }
      }, "confirmed");
      this.subscriptionIds.push(subscriptionId);
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
}
