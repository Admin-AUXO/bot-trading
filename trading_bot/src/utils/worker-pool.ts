import { Worker } from "node:worker_threads";
import { createChildLogger } from "./logger.js";

const log = createChildLogger("worker-pool");

interface PendingTask<R> {
  resolve: (value: R) => void;
  reject: (err: Error) => void;
}

interface WorkerEntry {
  worker: Worker;
  busy: boolean;
}

export function createFailureLatch(): { claim: () => boolean; reset: () => void } {
  let claimed = false;
  return {
    claim(): boolean {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    reset(): void {
      claimed = false;
    },
  };
}

export class WorkerPool<T, R> {
  private workers: WorkerEntry[] = [];
  private queue: Array<{ data: T; pending: PendingTask<R> }> = [];
  private nextWorker = 0;
  private terminated = false;
  private respawnAttempts: Map<number, number> = new Map();
  private failureLatches: Map<number, ReturnType<typeof createFailureLatch>> = new Map();

  constructor(
    private scriptPath: string,
    private poolSize: number = 4,
    private workerData?: Record<string, unknown>,
  ) {
    for (let i = 0; i < poolSize; i++) {
      this.spawnWorker(i);
    }
    log.info({ script: scriptPath, size: poolSize }, "worker pool created");
  }

  private spawnWorker(index: number): void {
    const worker = new Worker(this.scriptPath, {
      workerData: { workerId: index, ...this.workerData },
    });

    const entry: WorkerEntry = { worker, busy: false };
    const failureLatch = createFailureLatch();
    this.failureLatches.set(index, failureLatch);

    const handleFailure = (kind: "error" | "exit", details: Error | number): void => {
      if (this.terminated || !failureLatch.claim()) return;
      entry.busy = false;
      if (kind === "error") {
        log.error({ err: details, workerId: index }, "worker error — respawning");
      } else {
        log.warn({ workerId: index, code: details }, "worker exited unexpectedly — respawning");
      }
      this.respawnWithBackoff(index);
    };

    worker.on("error", (err) => {
      handleFailure("error", err as Error);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        handleFailure("exit", code);
      } else {
        this.respawnAttempts.delete(index);
        failureLatch.reset();
      }
    });

    this.workers[index] = entry;
    this.respawnAttempts.delete(index);
  }

  private respawnWithBackoff(index: number): void {
    const attempts = this.respawnAttempts.get(index) ?? 0;
    const delay = Math.min(1000 * 2 ** attempts, 30_000);
    this.respawnAttempts.set(index, attempts + 1);
    log.info({ workerId: index, delay, attempt: attempts + 1 }, "respawning worker with backoff");
    setTimeout(() => {
      if (!this.terminated) this.spawnWorker(index);
    }, delay);
  }

  async execute(data: T): Promise<R> {
    if (this.terminated) throw new Error("worker pool terminated");

    return new Promise<R>((resolve, reject) => {
      const pending: PendingTask<R> = { resolve, reject };
      const idle = this.findIdleWorker();

      if (idle) {
        this.dispatchToWorker(idle, data, pending);
      } else {
        this.queue.push({ data, pending });
      }
    });
  }

  async executeAll(items: T[]): Promise<R[]> {
    return Promise.all(items.map((item) => this.execute(item)));
  }

  async executeBatch(items: T[], concurrency?: number): Promise<R[]> {
    const limit = concurrency ?? this.poolSize;
    const results: R[] = [];
    let idx = 0;

    const runNext = async (): Promise<void> => {
      while (idx < items.length) {
        const current = idx++;
        results[current] = await this.execute(items[current]);
      }
    };

    const runners = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
    await Promise.all(runners);
    return results;
  }

  private findIdleWorker(): WorkerEntry | null {
    for (let i = 0; i < this.poolSize; i++) {
      const idx = (this.nextWorker + i) % this.poolSize;
      if (!this.workers[idx]?.busy) {
        this.nextWorker = (idx + 1) % this.poolSize;
        return this.workers[idx];
      }
    }
    return null;
  }

  private dispatchToWorker(entry: WorkerEntry, data: T, pending: PendingTask<R>): void {
    entry.busy = true;

    const cleanup = () => {
      entry.worker.off("message", handler);
      entry.worker.off("error", errorHandler);
      entry.worker.off("exit", exitHandler);
      entry.busy = false;
    };

    const handler = (msg: { result?: R; error?: string }) => {
      cleanup();
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result as R);
      }

      const next = this.queue.shift();
      if (next) {
        this.dispatchToWorker(entry, next.data, next.pending);
      }
    };

    const errorHandler = (err: Error) => {
      cleanup();
      pending.reject(err);
    };

    const exitHandler = (code: number) => {
      cleanup();
      pending.reject(new Error(`worker exited with code ${code}`));
    };

    entry.worker.once("error", errorHandler);
    entry.worker.once("exit", exitHandler);
    entry.worker.once("message", handler);
    entry.worker.postMessage(data);
  }

  getStats(): { poolSize: number; queued: number; busy: number } {
    return {
      poolSize: this.poolSize,
      queued: this.queue.length,
      busy: this.workers.filter((w) => w.busy).length,
    };
  }

  async terminate(): Promise<void> {
    this.terminated = true;
    for (const { pending } of this.queue) {
      pending.reject(new Error("worker pool terminated"));
    }
    this.queue = [];
    this.failureLatches.clear();
    await Promise.all(this.workers.map((w) => w.worker.terminate()));
    log.info("worker pool terminated");
  }
}
