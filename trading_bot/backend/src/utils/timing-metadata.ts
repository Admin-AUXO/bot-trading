import type { JsonValue } from "./types.js";

interface SignalTimingMetadataOptions {
  detectedAtMs?: number | null;
  sourceBlockTimeMs?: number | null;
  filterStartedAtMs?: number | null;
  filterCompletedAtMs?: number | null;
  signalCreatedAtMs?: number | null;
  intentionalDelayMs?: number | null;
  cadenceMs?: number | null;
  extra?: Record<string, JsonValue>;
}

interface ExecutionTimingMetadataOptions {
  signalDetectedAtMs?: number | null;
  signalCreatedAtMs?: number | null;
  filterCompletedAtMs?: number | null;
  executionStartedAtMs?: number | null;
  executionCompletedAtMs?: number | null;
  exitDetectedAtMs?: number | null;
  positionOpenedAtMs?: number | null;
  copyLeadMs?: number | null;
  extra?: Record<string, JsonValue>;
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function durationMs(start: number | null, end: number | null): number | null {
  if (start == null || end == null) return null;
  return Math.max(0, Math.round(end - start));
}

function compactRecord(record: Record<string, JsonValue | undefined>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Record<string, JsonValue>;
}

export function buildSignalTimingMetadata(options: SignalTimingMetadataOptions): Record<string, JsonValue> {
  const detectedAtMs = normalizeNumber(options.detectedAtMs);
  const sourceBlockTimeMs = normalizeNumber(options.sourceBlockTimeMs);
  const filterStartedAtMs = normalizeNumber(options.filterStartedAtMs);
  const filterCompletedAtMs = normalizeNumber(options.filterCompletedAtMs);
  const signalCreatedAtMs = normalizeNumber(options.signalCreatedAtMs);
  const intentionalDelayMs = normalizeNumber(options.intentionalDelayMs);
  const cadenceMs = normalizeNumber(options.cadenceMs);

  return compactRecord({
    ...(options.extra ?? {}),
    detectedAtMs,
    sourceBlockTimeMs,
    sourceLagMs: durationMs(sourceBlockTimeMs, detectedAtMs),
    filterStartedAtMs,
    filterCompletedAtMs,
    filterLatencyMs: durationMs(filterStartedAtMs, filterCompletedAtMs),
    signalCreatedAtMs,
    detectionToSignalMs: durationMs(detectedAtMs, signalCreatedAtMs),
    intentionalDelayMs,
    cadenceMs,
  });
}

export function buildExecutionTimingMetadata(options: ExecutionTimingMetadataOptions): Record<string, JsonValue> {
  const signalDetectedAtMs = normalizeNumber(options.signalDetectedAtMs);
  const signalCreatedAtMs = normalizeNumber(options.signalCreatedAtMs);
  const filterCompletedAtMs = normalizeNumber(options.filterCompletedAtMs);
  const executionStartedAtMs = normalizeNumber(options.executionStartedAtMs);
  const executionCompletedAtMs = normalizeNumber(options.executionCompletedAtMs);
  const exitDetectedAtMs = normalizeNumber(options.exitDetectedAtMs);
  const positionOpenedAtMs = normalizeNumber(options.positionOpenedAtMs);
  const copyLeadMs = normalizeNumber(options.copyLeadMs);

  return compactRecord({
    ...(options.extra ?? {}),
    signalDetectedAtMs,
    signalCreatedAtMs,
    filterCompletedAtMs,
    executionStartedAtMs,
    executionCompletedAtMs,
    executionLatencyMs: durationMs(executionStartedAtMs, executionCompletedAtMs),
    signalToExecutionMs: durationMs(signalCreatedAtMs, executionCompletedAtMs),
    detectionToExecutionMs: durationMs(signalDetectedAtMs, executionCompletedAtMs),
    filterToExecutionMs: durationMs(filterCompletedAtMs, executionCompletedAtMs),
    exitDetectedAtMs,
    exitDecisionToExecutionMs: durationMs(exitDetectedAtMs, executionCompletedAtMs),
    positionOpenedAtMs,
    positionAgeMs: durationMs(positionOpenedAtMs, exitDetectedAtMs ?? executionCompletedAtMs),
    copyLeadMs,
  });
}
