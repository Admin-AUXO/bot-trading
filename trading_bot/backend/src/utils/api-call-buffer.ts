import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { createChildLogger } from "./logger.js";
import type { ApiCallPurpose, ApiService, Strategy, TradeMode } from "@prisma/client";

const log = createChildLogger("api-call-buffer");

interface ApiCallData {
  service: ApiService;
  endpoint: string;
  credits: number;
  requestedCredits?: number;
  strategy?: Strategy;
  mode?: TradeMode;
  configProfile?: string;
  purpose?: ApiCallPurpose;
  essential?: boolean;
  cacheHit?: boolean;
  batchSize?: number;
  statusCode?: number;
  latencyMs?: number;
  success?: boolean;
}

export class ApiCallBuffer {
  private buffer: ApiCallData[] = [];
  private flushHandle: ReturnType<typeof setInterval>;

  constructor(flushIntervalMs: number = config.api.apiCallBufferFlushIntervalMs) {
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
          service: c.service,
          endpoint: c.endpoint,
          credits: c.credits,
          requestedCredits: c.requestedCredits ?? c.credits,
          strategy: c.strategy ?? null,
          mode: c.mode ?? null,
          configProfile: c.configProfile ?? null,
          purpose: c.purpose ?? "OTHER",
          essential: c.essential ?? false,
          cacheHit: c.cacheHit ?? false,
          batchSize: c.batchSize ?? null,
          statusCode: c.statusCode ?? null,
          latencyMs: c.latencyMs ?? null,
          success: c.success ?? (c.statusCode ? c.statusCode < 400 : true),
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
