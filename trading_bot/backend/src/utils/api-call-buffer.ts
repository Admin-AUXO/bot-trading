import { db } from "../db/client.js";
import { createChildLogger } from "./logger.js";
import type { ApiService, Strategy } from "@prisma/client";

const log = createChildLogger("api-call-buffer");

interface ApiCallData {
  service: string;
  endpoint: string;
  credits: number;
  strategy?: string;
  statusCode?: number;
  latencyMs?: number;
}

export class ApiCallBuffer {
  private buffer: ApiCallData[] = [];
  private flushHandle: ReturnType<typeof setInterval>;

  constructor(flushIntervalMs: number = 5_000) {
    this.flushHandle = setInterval(() => this.flush(), flushIntervalMs);
  }

  log(call: ApiCallData): void {
    this.buffer.push(call);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    try {
      await db.apiCall.createMany({
        data: batch.map((c) => ({
          service: c.service as ApiService,
          endpoint: c.endpoint,
          credits: c.credits,
          strategy: (c.strategy as Strategy) ?? null,
          statusCode: c.statusCode ?? null,
          latencyMs: c.latencyMs ?? null,
        })),
      });
      this.buffer.splice(0, batch.length);
    } catch (err) {
      log.error({ err, count: batch.length }, "failed to flush api call buffer — will retry");
    }
  }

  stop(): void {
    clearInterval(this.flushHandle);
    this.flush().catch((err) => {
      log.error({ err }, "failed to flush api calls on shutdown");
    });
  }
}
