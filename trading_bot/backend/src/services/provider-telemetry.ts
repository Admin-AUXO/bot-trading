import type { ProviderName } from "@prisma/client";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { toJsonValue } from "../utils/json.js";

function queueTelemetryWrite(write: () => Promise<unknown>): void {
  queueMicrotask(() => {
    void write().catch(() => undefined);
  });
}

export function recordApiEvent(input: {
  provider: ProviderName;
  endpoint: string;
  units: number;
  success: boolean;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}): void {
  queueTelemetryWrite(() => db.apiEvent.create({
    data: {
      provider: input.provider,
      endpoint: input.endpoint,
      units: input.units,
      success: input.success,
      latencyMs: input.latencyMs,
      metadata: input.metadata ? toJsonValue(input.metadata) : undefined,
    },
  }));
}

export function recordRawApiPayload(input: {
  provider: ProviderName;
  endpoint: string;
  requestMethod: string;
  success: boolean;
  statusCode?: number | null;
  latencyMs?: number | null;
  entityKey?: string | null;
  requestParams?: unknown;
  responseBody?: unknown;
  errorMessage?: string | null;
}): void {
  if (input.success && !env.CAPTURE_SUCCESS_RAW_PAYLOADS) {
    return;
  }

  queueTelemetryWrite(() => {
    const requestParams = input.requestParams === undefined ? undefined : toJsonValue(input.requestParams);
    const responseBody = input.responseBody === undefined ? undefined : toJsonValue(input.responseBody);

    return db.rawApiPayload.create({
      data: {
        provider: input.provider,
        endpoint: input.endpoint,
        requestMethod: input.requestMethod,
        entityKey: input.entityKey ?? null,
        success: input.success,
        statusCode: input.statusCode ?? null,
        latencyMs: input.latencyMs ?? null,
        errorMessage: input.errorMessage ?? null,
        ...(requestParams !== undefined ? { requestParams } : {}),
        ...(responseBody !== undefined ? { responseBody } : {}),
      },
    });
  });
}
