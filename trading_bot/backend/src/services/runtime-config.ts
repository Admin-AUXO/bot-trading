import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db/client.js";
import { env } from "../config/env.js";
import type { BotSettings } from "../types/domain.js";
import { toJsonValue } from "../utils/json.js";

export type SettingsValidationIssue = {
  path: string;
  message: string;
};

export type SettingsDryRunSummary = {
  ranAt: string;
  basedOnUpdatedAt: string;
  changedPaths: string[];
  liveAffectingPaths: string[];
  currentGate: {
    allowed: boolean;
    reason: string | null;
  };
  draftGate: {
    allowed: boolean;
    reason: string | null;
  };
  openPositions: number;
  queuedCandidates: number;
  noNewBlocker: boolean;
  safeToPromote: boolean;
};

export type SettingsControlState = {
  active: BotSettings;
  draft: BotSettings | null;
  dirty: boolean;
  changedPaths: string[];
  liveAffectingPaths: string[];
  validation: {
    ok: boolean;
    issues: SettingsValidationIssue[];
  };
  dryRun: SettingsDryRunSummary | null;
  activeUpdatedAt: string;
  basedOnUpdatedAt: string | null;
  sections: Array<{
    id: "capital" | "entry" | "exit" | "research" | "advanced";
    label: string;
    editable: boolean;
    paths: string[];
  }>;
};

type ApplySettingsMetadata = {
  appliedBy: "bootstrap" | "backfill" | "direct_patch" | "draft_promote";
  changedPaths?: string[];
  liveAffectingPaths?: string[];
  dryRunSummary?: SettingsDryRunSummary | null;
  basedOnUpdatedAt?: string | null;
};

const SETTINGS_SECTIONS: SettingsControlState["sections"] = [
  {
    id: "capital",
    label: "Capital",
    editable: true,
    paths: ["tradeMode", "capital.capitalUsd", "capital.positionSizeUsd", "capital.maxOpenPositions"],
  },
  {
    id: "entry",
    label: "Entry",
    editable: true,
    paths: [
      "filters.minLiquidityUsd",
      "filters.maxMarketCapUsd",
      "filters.minHolders",
      "filters.minUniqueBuyers5m",
      "filters.minBuySellRatio",
      "filters.maxTop10HolderPercent",
      "filters.maxSingleHolderPercent",
      "filters.maxGraduationAgeSeconds",
      "filters.minVolume5mUsd",
      "filters.maxNegativePriceChange5mPercent",
      "filters.securityCheckMinLiquidityUsd",
      "filters.securityCheckVolumeMultiplier",
      "filters.maxTransferFeePercent",
    ],
  },
  {
    id: "exit",
    label: "Exit",
    editable: true,
    paths: [
      "exits.stopLossPercent",
      "exits.tp1Multiplier",
      "exits.tp2Multiplier",
      "exits.tp1SellFraction",
      "exits.tp2SellFraction",
      "exits.postTp1RetracePercent",
      "exits.trailingStopPercent",
      "exits.timeStopMinutes",
      "exits.timeStopMinReturnPercent",
      "exits.timeLimitMinutes",
    ],
  },
  {
    id: "research",
    label: "Research",
    editable: true,
    paths: [
      "research.discoveryLimit",
      "research.fullEvaluationLimit",
      "research.maxMockPositions",
      "research.fixedPositionSizeUsd",
      "research.pollIntervalMs",
      "research.maxRunDurationMs",
      "research.birdeyeUnitCap",
      "research.heliusUnitCap",
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    editable: false,
    paths: [
      "cadence.discoveryIntervalMs",
      "cadence.offHoursDiscoveryIntervalMs",
      "cadence.evaluationIntervalMs",
      "cadence.idleEvaluationIntervalMs",
      "cadence.exitIntervalMs",
      "cadence.entryDelayMs",
      "cadence.evaluationConcurrency",
    ],
  },
];

const LIVE_AFFECTING_PREFIXES = ["tradeMode", "capital.", "filters.", "exits.", "research."];

const botSettingsSchema = z.object({
  tradeMode: z.enum(["DRY_RUN", "LIVE"]),
  cadence: z.object({
    discoveryIntervalMs: z.number().int().positive(),
    offHoursDiscoveryIntervalMs: z.number().int().positive(),
    evaluationIntervalMs: z.number().int().positive(),
    idleEvaluationIntervalMs: z.number().int().positive(),
    exitIntervalMs: z.number().int().positive(),
    entryDelayMs: z.number().int().nonnegative(),
    evaluationConcurrency: z.number().int().positive().max(10),
  }),
  research: z.object({
    discoveryLimit: z.number().int().positive().max(100),
    fullEvaluationLimit: z.number().int().positive().max(100),
    maxMockPositions: z.number().int().positive().max(20),
    fixedPositionSizeUsd: z.number().positive(),
    pollIntervalMs: z.number().int().positive(),
    maxRunDurationMs: z.number().int().positive(),
    birdeyeUnitCap: z.number().int().positive(),
    heliusUnitCap: z.number().int().positive(),
  }),
  capital: z.object({
    capitalUsd: z.number().positive(),
    positionSizeUsd: z.number().positive(),
    maxOpenPositions: z.number().int().positive(),
  }),
  filters: z.object({
    minLiquidityUsd: z.number().nonnegative(),
    maxMarketCapUsd: z.number().positive(),
    minHolders: z.number().int().nonnegative(),
    minUniqueBuyers5m: z.number().int().nonnegative(),
    minBuySellRatio: z.number().nonnegative(),
    maxTop10HolderPercent: z.number().nonnegative().max(100),
    maxSingleHolderPercent: z.number().nonnegative().max(100),
    maxGraduationAgeSeconds: z.number().int().positive(),
    minVolume5mUsd: z.number().nonnegative(),
    maxNegativePriceChange5mPercent: z.number().nonnegative(),
    securityCheckMinLiquidityUsd: z.number().nonnegative(),
    securityCheckVolumeMultiplier: z.number().positive(),
    maxTransferFeePercent: z.number().nonnegative().max(100),
  }),
  exits: z.object({
    stopLossPercent: z.number().positive().max(100),
    tp1Multiplier: z.number().positive(),
    tp2Multiplier: z.number().positive(),
    tp1SellFraction: z.number().positive().max(1),
    tp2SellFraction: z.number().positive().max(1),
    postTp1RetracePercent: z.number().positive().max(100),
    trailingStopPercent: z.number().positive().max(100),
    timeStopMinutes: z.number().positive(),
    timeStopMinReturnPercent: z.number().nonnegative(),
    timeLimitMinutes: z.number().positive(),
  }),
}).superRefine((settings, ctx) => {
  if (settings.capital.positionSizeUsd > settings.capital.capitalUsd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "position size cannot exceed total capital",
      path: ["capital", "positionSizeUsd"],
    });
  }

  if (settings.research.fullEvaluationLimit > settings.research.discoveryLimit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "research shortlist cannot exceed research discovery limit",
      path: ["research", "fullEvaluationLimit"],
    });
  }

  if (settings.research.maxMockPositions > settings.research.fullEvaluationLimit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "research mock-position cap cannot exceed research shortlist size",
      path: ["research", "maxMockPositions"],
    });
  }

  if (settings.research.pollIntervalMs > settings.research.maxRunDurationMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "research poll interval cannot exceed max research run duration",
      path: ["research", "pollIntervalMs"],
    });
  }

  if (settings.filters.maxSingleHolderPercent > settings.filters.maxTop10HolderPercent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "largest-holder ceiling cannot exceed top10 ceiling",
      path: ["filters", "maxSingleHolderPercent"],
    });
  }

  if (settings.exits.tp2Multiplier <= settings.exits.tp1Multiplier) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TP2 multiplier must be greater than TP1 multiplier",
      path: ["exits", "tp2Multiplier"],
    });
  }

  if (settings.exits.tp1SellFraction + settings.exits.tp2SellFraction > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "combined TP sell fractions cannot exceed 1",
      path: ["exits", "tp2SellFraction"],
    });
  }

  if (settings.exits.timeLimitMinutes < settings.exits.timeStopMinutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "hard time limit must be greater than or equal to the soft time stop",
      path: ["exits", "timeLimitMinutes"],
    });
  }
});

export function buildDefaultSettings(): BotSettings {
  return {
    tradeMode: env.TRADE_MODE,
    cadence: {
      discoveryIntervalMs: env.DISCOVERY_INTERVAL_MS,
      offHoursDiscoveryIntervalMs: env.OFF_HOURS_DISCOVERY_INTERVAL_MS,
      evaluationIntervalMs: env.EVALUATION_INTERVAL_MS,
      idleEvaluationIntervalMs: env.IDLE_EVALUATION_INTERVAL_MS,
      exitIntervalMs: env.EXIT_INTERVAL_MS,
      entryDelayMs: env.ENTRY_DELAY_MS,
      evaluationConcurrency: env.EVALUATION_CONCURRENCY,
    },
    research: {
      discoveryLimit: env.RESEARCH_DISCOVERY_LIMIT,
      fullEvaluationLimit: env.RESEARCH_FULL_EVALUATION_LIMIT,
      maxMockPositions: env.RESEARCH_MAX_MOCK_POSITIONS,
      fixedPositionSizeUsd: env.RESEARCH_FIXED_POSITION_SIZE_USD,
      pollIntervalMs: env.RESEARCH_POLL_INTERVAL_MS,
      maxRunDurationMs: env.RESEARCH_MAX_RUN_DURATION_MS,
      birdeyeUnitCap: env.RESEARCH_BIRDEYE_UNIT_CAP,
      heliusUnitCap: env.RESEARCH_HELIUS_UNIT_CAP,
    },
    capital: {
      capitalUsd: env.CAPITAL_USD,
      positionSizeUsd: env.POSITION_SIZE_USD,
      maxOpenPositions: env.MAX_OPEN_POSITIONS,
    },
    filters: {
      minLiquidityUsd: env.MIN_LIQUIDITY_USD,
      maxMarketCapUsd: env.MAX_MARKET_CAP_USD,
      minHolders: env.MIN_HOLDERS,
      minUniqueBuyers5m: env.MIN_UNIQUE_BUYERS_5M,
      minBuySellRatio: env.MIN_BUY_SELL_RATIO,
      maxTop10HolderPercent: env.MAX_TOP10_HOLDER_PERCENT,
      maxSingleHolderPercent: env.MAX_SINGLE_HOLDER_PERCENT,
      maxGraduationAgeSeconds: env.MAX_GRADUATION_AGE_SECONDS,
      minVolume5mUsd: env.MIN_VOLUME_5M_USD,
      maxNegativePriceChange5mPercent: env.MAX_NEGATIVE_PRICE_CHANGE_5M_PERCENT,
      securityCheckMinLiquidityUsd: env.SECURITY_CHECK_MIN_LIQUIDITY_USD,
      securityCheckVolumeMultiplier: env.SECURITY_CHECK_VOLUME_MULTIPLIER,
      maxTransferFeePercent: env.MAX_TRANSFER_FEE_PERCENT,
    },
    exits: {
      stopLossPercent: env.STOP_LOSS_PERCENT,
      tp1Multiplier: env.TP1_MULTIPLIER,
      tp2Multiplier: env.TP2_MULTIPLIER,
      tp1SellFraction: env.TP1_SELL_FRACTION,
      tp2SellFraction: env.TP2_SELL_FRACTION,
      postTp1RetracePercent: env.POST_TP1_RETRACE_PERCENT,
      trailingStopPercent: env.TRAILING_STOP_PERCENT,
      timeStopMinutes: env.TIME_STOP_MINUTES,
      timeStopMinReturnPercent: env.TIME_STOP_MIN_RETURN_PERCENT,
      timeLimitMinutes: env.TIME_LIMIT_MINUTES,
    },
  };
}

function mergeSettings(base: BotSettings, overrides: Partial<BotSettings>): BotSettings {
  return {
    tradeMode: overrides.tradeMode ?? base.tradeMode,
    cadence: { ...base.cadence, ...(overrides.cadence ?? {}) },
    research: { ...base.research, ...(overrides.research ?? {}) },
    capital: { ...base.capital, ...(overrides.capital ?? {}) },
    filters: { ...base.filters, ...(overrides.filters ?? {}) },
    exits: { ...base.exits, ...(overrides.exits ?? {}) },
  };
}

function validateSettings(input: BotSettings): BotSettings {
  return botSettingsSchema.parse(input);
}

function safeValidateSettings(input: BotSettings): { ok: boolean; issues: SettingsValidationIssue[] } {
  const parsed = botSettingsSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, issues: [] };
  }

  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

function getChangedPaths(active: BotSettings, draft: BotSettings): string[] {
  return diffPaths(active as unknown as Record<string, unknown>, draft as unknown as Record<string, unknown>);
}

function getLiveAffectingPaths(paths: string[]): string[] {
  return paths.filter((path) => LIVE_AFFECTING_PREFIXES.some((prefix) => path === prefix.replace(/\.$/, "") || path.startsWith(prefix)));
}

function diffPaths(left: Record<string, unknown>, right: Record<string, unknown>, prefix = ""): string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changed: string[] = [];

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const leftValue = left[key];
    const rightValue = right[key];

    if (isPlainObject(leftValue) && isPlainObject(rightValue)) {
      changed.push(...diffPaths(leftValue, rightValue, path));
      continue;
    }

    if (JSON.stringify(leftValue) !== JSON.stringify(rightValue)) {
      changed.push(path);
    }
  }

  return changed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class RuntimeConfigService {
  private cachedSettings: BotSettings | null = null;

  async ensure(): Promise<void> {
    const defaults = validateSettings(buildDefaultSettings());
    const row = await db.runtimeConfig.upsert({
      where: { id: "singleton" },
      update: {},
      create: {
        id: "singleton",
        settings: toJsonValue(defaults),
      },
    });
    const active = validateSettings(mergeSettings(defaults, row.settings as Partial<BotSettings>));
    const latestVersion = await db.runtimeConfigVersion.findFirst({
      orderBy: [{ activatedAt: "desc" }, { id: "desc" }],
    });

    if (!latestVersion || JSON.stringify(latestVersion.settings) !== JSON.stringify(row.settings)) {
      await db.runtimeConfigVersion.create({
        data: {
          settings: row.settings,
          changedPaths: [],
          liveAffectingPaths: [],
          appliedBy: latestVersion ? "backfill" : "bootstrap",
          activatedAt: row.updatedAt,
        },
      });
    }

    this.cachedSettings = active;
  }

  async getSettings(): Promise<BotSettings> {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    const defaults = validateSettings(buildDefaultSettings());
    const row = await db.runtimeConfig.findUnique({ where: { id: "singleton" } });
    if (!row) {
      this.cachedSettings = defaults;
      return defaults;
    }

    this.cachedSettings = validateSettings(mergeSettings(defaults, row.settings as Partial<BotSettings>));
    return this.cachedSettings;
  }

  async patchSettings(input: Partial<BotSettings>): Promise<BotSettings> {
    const current = await this.getSettings();
    const next = validateSettings(mergeSettings(current, input));
    const changedPaths = getChangedPaths(current, next);
    await this.applySettings(next, {
      appliedBy: "direct_patch",
      changedPaths,
      liveAffectingPaths: getLiveAffectingPaths(changedPaths),
    });
    return next;
  }

  async getControlState(): Promise<SettingsControlState> {
    const [active, activeRow, draftRow] = await Promise.all([
      this.getSettings(),
      db.runtimeConfig.findUniqueOrThrow({ where: { id: "singleton" } }),
      db.runtimeConfigDraft.findUnique({ where: { id: "singleton" } }),
    ]);

    const draft = draftRow ? mergeSettings(active, draftRow.draftSettings as Partial<BotSettings>) : null;
    const changedPaths = draft ? getChangedPaths(active, draft) : [];
    const liveAffectingPaths = getLiveAffectingPaths(changedPaths);
    const validation = draft ? safeValidateSettings(draft) : { ok: true, issues: [] };

    return {
      active,
      draft,
      dirty: Boolean(draft && changedPaths.length > 0),
      changedPaths,
      liveAffectingPaths,
      validation,
      dryRun: draftRow?.dryRunSummary ? draftRow.dryRunSummary as SettingsDryRunSummary : null,
      activeUpdatedAt: activeRow.updatedAt.toISOString(),
      basedOnUpdatedAt: draftRow?.basedOnUpdatedAt.toISOString() ?? null,
      sections: SETTINGS_SECTIONS,
    };
  }

  async patchDraft(input: Partial<BotSettings>): Promise<SettingsControlState> {
    const [active, activeRow, draftRow] = await Promise.all([
      this.getSettings(),
      db.runtimeConfig.findUniqueOrThrow({ where: { id: "singleton" } }),
      db.runtimeConfigDraft.findUnique({ where: { id: "singleton" } }),
    ]);

    const currentDraft = draftRow
      ? mergeSettings(active, draftRow.draftSettings as Partial<BotSettings>)
      : active;
    const nextDraft = mergeSettings(currentDraft, input);

    await db.runtimeConfigDraft.upsert({
      where: { id: "singleton" },
      update: {
        draftSettings: toJsonValue(nextDraft),
        dryRunSummary: Prisma.JsonNull,
      },
      create: {
        id: "singleton",
        draftSettings: toJsonValue(nextDraft),
        basedOnUpdatedAt: activeRow.updatedAt,
      },
    });

    return this.getControlState();
  }

  async discardDraft(): Promise<SettingsControlState> {
    await db.runtimeConfigDraft.deleteMany({ where: { id: "singleton" } });
    return this.getControlState();
  }

  async saveDraftDryRun(summary: SettingsDryRunSummary): Promise<SettingsControlState> {
    const draftRow = await db.runtimeConfigDraft.findUnique({ where: { id: "singleton" } });
    if (!draftRow) {
      throw new Error("no settings draft is available");
    }

    await db.runtimeConfigDraft.update({
      where: { id: "singleton" },
      data: {
        dryRunSummary: toJsonValue(summary),
      },
    });

    return this.getControlState();
  }

  async promoteDraft(): Promise<SettingsControlState> {
    const [state, draftRow, activeRow] = await Promise.all([
      this.getControlState(),
      db.runtimeConfigDraft.findUnique({ where: { id: "singleton" } }),
      db.runtimeConfig.findUniqueOrThrow({ where: { id: "singleton" } }),
    ]);

    if (!draftRow || !state.draft) {
      throw new Error("no settings draft is available");
    }

    if (draftRow.basedOnUpdatedAt.getTime() !== activeRow.updatedAt.getTime()) {
      throw new Error("active settings changed while the draft was open; refresh and re-review before promoting");
    }

    if (!state.validation.ok) {
      throw new Error("draft settings are invalid; fix validation issues before promoting");
    }

    await this.applySettings(state.draft, {
      appliedBy: "draft_promote",
      changedPaths: state.changedPaths,
      liveAffectingPaths: state.liveAffectingPaths,
      dryRunSummary: state.dryRun,
      basedOnUpdatedAt: state.basedOnUpdatedAt,
    });
    await db.runtimeConfigDraft.delete({ where: { id: "singleton" } });
    return this.getControlState();
  }

  private async applySettings(next: BotSettings, metadata: ApplySettingsMetadata): Promise<void> {
    const current = await this.getSettings();
    const changedPaths = metadata.changedPaths ?? getChangedPaths(current, next);
    if (changedPaths.length === 0) {
      this.cachedSettings = next;
      return;
    }

    const liveAffectingPaths = metadata.liveAffectingPaths ?? getLiveAffectingPaths(changedPaths);
    const tradeModeChanged = next.tradeMode !== current.tradeMode;
    const capitalChanged = next.capital.capitalUsd !== current.capital.capitalUsd;
    const [openPositions, botState, activeResearchRun] = await Promise.all([
      db.position.count({ where: { status: "OPEN" } }),
      db.botState.findUnique({ where: { id: "singleton" } }),
      db.researchRun.findFirst({ where: { status: "RUNNING" }, select: { id: true } }),
    ]);

    if (tradeModeChanged && openPositions > 0) {
      throw new Error("cannot switch trade mode while positions are still open");
    }

    if (tradeModeChanged && activeResearchRun) {
      throw new Error("cannot switch trade mode while a research dry run is still active");
    }

    if (capitalChanged && openPositions > 0) {
      throw new Error("cannot change capital baseline while positions are still open");
    }

    await db.$transaction(async (tx) => {
      await tx.runtimeConfig.upsert({
        where: { id: "singleton" },
        update: { settings: toJsonValue(next) },
        create: { id: "singleton", settings: toJsonValue(next) },
      });

      await tx.runtimeConfigVersion.create({
        data: {
          settings: toJsonValue(next),
          changedPaths: toJsonValue(changedPaths),
          liveAffectingPaths: toJsonValue(liveAffectingPaths),
          dryRunSummary: metadata.dryRunSummary ? toJsonValue(metadata.dryRunSummary) : undefined,
          appliedBy: metadata.appliedBy,
          basedOnUpdatedAt: metadata.basedOnUpdatedAt ? new Date(metadata.basedOnUpdatedAt) : undefined,
        },
      });

      if (botState) {
        await tx.botState.update({
          where: { id: "singleton" },
          data: {
            tradeMode: next.tradeMode,
            capitalUsd: next.capital.capitalUsd,
            cashUsd: capitalChanged && openPositions === 0
              ? next.capital.capitalUsd
              : undefined,
          },
        });
      }
    });

    this.cachedSettings = next;
  }
}
