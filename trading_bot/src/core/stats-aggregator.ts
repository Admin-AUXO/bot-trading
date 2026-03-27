import { fileURLToPath } from "node:url";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("stats-aggregator");

let worker: Worker | null = null;

function getWorkerPath(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../workers/stats-aggregator.js",
  );
}

export async function aggregateDailyStats(date: Date = new Date()): Promise<void> {
  const dateStr = date.toISOString().slice(0, 10);

  return new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker(getWorkerPath());

      worker.on("error", (err) => {
        log.error({ err }, "stats worker error");
        worker = null;
        reject(err);
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          log.warn({ code }, "stats worker exited unexpectedly");
        }
        worker = null;
      });
    }

    const timeout = setTimeout(() => {
      if (worker) worker.off("message", handler);
      reject(new Error("stats aggregation timeout after 30s"));
    }, 30_000);

    const handler = (msg: { result?: { success: boolean; date: string }; error?: string }) => {
      clearTimeout(timeout);

      if (msg.error) {
        log.error({ error: msg.error }, "stats aggregation failed in worker");
        reject(new Error(msg.error));
      } else {
        log.info({ date: msg.result?.date }, "daily stats aggregated (worker)");
        resolve();
      }
    };

    worker.once("message", handler);
    worker.postMessage({ date: dateStr });
  });
}

export function terminateStatsWorker(): void {
  worker?.terminate();
  worker = null;
}
