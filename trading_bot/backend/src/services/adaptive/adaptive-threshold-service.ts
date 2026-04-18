import type { BotSettings } from "../../types/domain.js";
import { db } from "../../db/client.js";
import type { AdaptiveContext } from "./adaptive-context-builder.js";

type FilterKeys = keyof BotSettings["filters"];
type ExitKeys = keyof BotSettings["exits"];

type AdaptiveAxes = {
  session?: boolean;
  performance?: boolean;
  drawdown?: boolean;
  consecutive?: boolean;
  exposure?: boolean;
  entryScoreFloor?: boolean;
};

type MutationTarget = {
  candidateId?: string;
  positionId?: string;
  packId?: string | null;
};

type AdaptiveMutationResult = {
  filters: BotSettings["filters"];
  entryScoreFloor: number | null;
  filterMult: number;
};

type AdaptiveExitMutationResult = {
  exits: BotSettings["exits"];
  filterMult: number;
};

type ActivityRow = {
  activity_hour: Date;
  axis: string;
  field: string;
  mutation_count: number;
  candidate_count: number;
  position_count: number;
  last_mutation_at: Date | null;
};

export type AdaptiveActivityPayload = {
  generatedAt: string;
  lastMutationAt: string | null;
  points: Array<{
    hour: string;
    axis: string;
    field: string;
    mutationCount: number;
    candidateCount: number;
    positionCount: number;
    lastMutationAt: string | null;
  }>;
};

const DEFAULT_AXES: Required<AdaptiveAxes> = {
  session: true,
  performance: true,
  drawdown: true,
  consecutive: true,
  exposure: true,
  entryScoreFloor: true,
};

export class AdaptiveThresholdService {
  async mutateFilters(
    settings: BotSettings,
    context: AdaptiveContext,
    target: MutationTarget,
  ): Promise<AdaptiveMutationResult> {
    const axes = await this.loadAxes(target.packId);
    const filterMult = computeFilterMult(context, axes);
    const nextFilters = { ...settings.filters };
    const logs: Array<Parameters<typeof mapLogEntry>[0]> = [];

    applyFloorMutation(nextFilters, "minLiquidityUsd", filterMult, "session_filter_mult", axes.session, target, context, logs);
    applyFloorMutation(nextFilters, "minHolders", filterMult, "session_filter_mult", axes.session, target, context, logs);
    applyFloorMutation(nextFilters, "minUniqueBuyers5m", filterMult, "session_filter_mult", axes.session, target, context, logs);
    applyFloorMutation(nextFilters, "minBuySellRatio", filterMult, "session_filter_mult", axes.session, target, context, logs);
    applyFloorMutation(nextFilters, "minVolume5mUsd", filterMult, "session_filter_mult", axes.session, target, context, logs);
    applyCeilingMutation(nextFilters, "maxMarketCapUsd", filterMult, "risk_filter_mult", axes.drawdown || axes.exposure || axes.performance, target, context, logs);
    applyCeilingMutation(nextFilters, "maxTop10HolderPercent", filterMult, "risk_filter_mult", axes.drawdown || axes.exposure || axes.performance, target, context, logs);
    applyCeilingMutation(nextFilters, "maxSingleHolderPercent", filterMult, "risk_filter_mult", axes.drawdown || axes.exposure || axes.performance, target, context, logs);
    applyCeilingMutation(nextFilters, "maxGraduationAgeSeconds", filterMult, "risk_filter_mult", axes.drawdown || axes.performance, target, context, logs);
    applyCeilingMutation(nextFilters, "maxNegativePriceChange5mPercent", filterMult, "risk_filter_mult", axes.drawdown || axes.consecutive, target, context, logs);

    const entryScoreFloor = axes.entryScoreFloor
      ? computeEntryScoreFloor(context)
      : null;
    if (entryScoreFloor != null) {
      logs.push({
        axis: "entry_score_floor",
        field: "entryScoreFloor",
        originalValue: 0,
        mutatedValue: entryScoreFloor,
        reasonCode: "adaptive_entry_floor",
        target,
        context,
      });
    }

    await this.persistLogs(logs);

    return {
      filters: nextFilters,
      entryScoreFloor,
      filterMult,
    };
  }

  async mutateExits(
    settings: BotSettings,
    context: AdaptiveContext,
    target: MutationTarget,
  ): Promise<AdaptiveExitMutationResult> {
    const axes = await this.loadAxes(target.packId);
    const filterMult = computeFilterMult(context, axes);
    const stressMult = Math.max(filterMult, 1);
    const nextExits = { ...settings.exits };
    const logs: Array<Parameters<typeof mapLogEntry>[0]> = [];

    if (stressMult > 1.001) {
      tightenExit(nextExits, "stopLossPercent", 1 / stressMult, "adaptive_exit_tighten", target, context, logs);
      tightenExit(nextExits, "tp1Multiplier", 1 / stressMult, "adaptive_exit_tighten", target, context, logs);
      tightenExit(nextExits, "tp2Multiplier", 1 / stressMult, "adaptive_exit_tighten", target, context, logs);
      tightenExit(nextExits, "trailingStopPercent", 1 / stressMult, "adaptive_exit_tighten", target, context, logs);
      tightenExit(nextExits, "timeStopMinutes", 1 / stressMult, "adaptive_exit_tighten", target, context, logs);
      tightenExit(nextExits, "timeLimitMinutes", 1 / stressMult, "adaptive_exit_tighten", target, context, logs);
    }

    await this.persistLogs(logs);

    return {
      exits: nextExits,
      filterMult,
    };
  }

  async getActivity(limit = 24): Promise<AdaptiveActivityPayload> {
    const rows = await db.$queryRawUnsafe<ActivityRow[]>(`
      SELECT *
      FROM v_adaptive_threshold_activity
      WHERE activity_hour >= NOW() - INTERVAL '${Math.max(1, Math.min(limit, 168))} hours'
      ORDER BY activity_hour DESC, axis, field
      LIMIT 120
    `);
    return {
      generatedAt: new Date().toISOString(),
      lastMutationAt: rows.find((row) => row.last_mutation_at)?.last_mutation_at?.toISOString() ?? null,
      points: rows.map((row) => ({
        hour: row.activity_hour.toISOString(),
        axis: row.axis,
        field: row.field,
        mutationCount: Number(row.mutation_count),
        candidateCount: Number(row.candidate_count),
        positionCount: Number(row.position_count),
        lastMutationAt: row.last_mutation_at?.toISOString() ?? null,
      })),
    };
  }

  private async loadAxes(packId?: string | null): Promise<Required<AdaptiveAxes>> {
    if (!packId) {
      return DEFAULT_AXES;
    }
    const row = await db.strategyPack.findUnique({
      where: { id: packId },
      select: { adaptiveAxes: true },
    });
    if (!row?.adaptiveAxes || typeof row.adaptiveAxes !== "object" || Array.isArray(row.adaptiveAxes)) {
      return DEFAULT_AXES;
    }
    const axes = row.adaptiveAxes as AdaptiveAxes;
    return {
      session: axes.session ?? DEFAULT_AXES.session,
      performance: axes.performance ?? DEFAULT_AXES.performance,
      drawdown: axes.drawdown ?? DEFAULT_AXES.drawdown,
      consecutive: axes.consecutive ?? DEFAULT_AXES.consecutive,
      exposure: axes.exposure ?? DEFAULT_AXES.exposure,
      entryScoreFloor: axes.entryScoreFloor ?? DEFAULT_AXES.entryScoreFloor,
    };
  }

  private async persistLogs(logs: Array<Parameters<typeof mapLogEntry>[0]>): Promise<void> {
    if (logs.length === 0) {
      return;
    }
    await db.adaptiveThresholdLog.createMany({
      data: logs.map(mapLogEntry),
    });
  }
}

function computeFilterMult(context: AdaptiveContext, axes: Required<AdaptiveAxes>): number {
  let mult = 1;
  if (axes.session) {
    mult *= context.sessionBucket === "peak"
      ? 0.85
      : context.sessionBucket === "active"
        ? 1
        : context.sessionBucket === "off"
          ? 1.2
          : 1.5;
  }
  if (axes.performance && context.trailingWinRate != null) {
    mult *= context.trailingWinRate < 0.35
      ? 1.35
      : context.trailingWinRate < 0.45
        ? 1.15
        : context.trailingWinRate > 0.65
          ? 0.9
          : 1;
  }
  if (axes.drawdown) {
    mult *= context.dailyPnlPct <= -10
      ? 1.4
      : context.dailyPnlPct <= -5
        ? 1.18
        : 1;
  }
  if (axes.consecutive) {
    mult *= context.consecutiveLosses >= 4
      ? 1.25
      : context.consecutiveLosses >= 2
        ? 1.1
        : 1;
  }
  if (axes.exposure) {
    mult *= context.openExposurePct >= 70
      ? 1.2
      : context.openExposurePct >= 40
        ? 1.08
        : 1;
  }
  return round(mult);
}

function computeEntryScoreFloor(context: AdaptiveContext): number {
  let floor = 0;
  floor += Math.min(context.consecutiveLosses, 4) * 0.03;
  if (context.dailyPnlPct <= -10) {
    floor += 0.07;
  } else if (context.dailyPnlPct <= -5) {
    floor += 0.04;
  }
  if (context.openExposurePct >= 70) {
    floor += 0.05;
  } else if (context.openExposurePct >= 40) {
    floor += 0.02;
  }
  return round(Math.min(floor, 0.1));
}

function applyFloorMutation(
  filters: BotSettings["filters"],
  field: FilterKeys,
  multiplier: number,
  reasonCode: string,
  enabled: boolean,
  target: MutationTarget,
  context: AdaptiveContext,
  logs: Array<Parameters<typeof mapLogEntry>[0]>,
): void {
  if (!enabled) {
    return;
  }
  const originalValue = Number(filters[field]);
  const mutatedValue = round(originalValue * multiplier);
  if (Math.abs(mutatedValue - originalValue) < 0.0001) {
    return;
  }
  filters[field] = mutatedValue as never;
  logs.push({
    axis: field.includes("max") ? "risk" : "filter",
    field,
    originalValue,
    mutatedValue,
    reasonCode,
    target,
    context,
  });
}

function applyCeilingMutation(
  filters: BotSettings["filters"],
  field: FilterKeys,
  multiplier: number,
  reasonCode: string,
  enabled: boolean,
  target: MutationTarget,
  context: AdaptiveContext,
  logs: Array<Parameters<typeof mapLogEntry>[0]>,
): void {
  if (!enabled) {
    return;
  }
  const originalValue = Number(filters[field]);
  const mutatedValue = round(originalValue / Math.max(multiplier, 0.85));
  if (Math.abs(mutatedValue - originalValue) < 0.0001) {
    return;
  }
  filters[field] = mutatedValue as never;
  logs.push({
    axis: "risk",
    field,
    originalValue,
    mutatedValue,
    reasonCode,
    target,
    context,
  });
}

function tightenExit(
  exits: BotSettings["exits"],
  field: ExitKeys,
  multiplier: number,
  reasonCode: string,
  target: MutationTarget,
  context: AdaptiveContext,
  logs: Array<Parameters<typeof mapLogEntry>[0]>,
): void {
  const originalValue = Number(exits[field]);
  const mutatedValue = round(originalValue * multiplier);
  if (Math.abs(mutatedValue - originalValue) < 0.0001) {
    return;
  }
  exits[field] = mutatedValue as never;
  logs.push({
    axis: "exit",
    field,
    originalValue,
    mutatedValue,
    reasonCode,
    target,
    context,
  });
}

function mapLogEntry(input: {
  axis: string;
  field: string;
  originalValue: number;
  mutatedValue: number;
  reasonCode: string;
  target: MutationTarget;
  context: AdaptiveContext;
}) {
  return {
    candidateId: input.target.candidateId,
    positionId: input.target.positionId,
    axis: input.axis,
    field: input.field,
    originalValue: input.originalValue,
    mutatedValue: input.mutatedValue,
    reasonCode: input.reasonCode,
    ctxJson: {
      sessionBucket: input.context.sessionBucket,
      trailingWinRate: input.context.trailingWinRate,
      dailyPnlPct: input.context.dailyPnlPct,
      consecutiveLosses: input.context.consecutiveLosses,
      openExposurePct: input.context.openExposurePct,
      packId: input.target.packId ?? null,
    },
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
