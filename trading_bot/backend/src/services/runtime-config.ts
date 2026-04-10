import { db } from "../db/client.js";
import { env } from "../config/env.js";
import type { BotSettings } from "../types/domain.js";
import { toJsonValue } from "../utils/json.js";
import { z } from "zod";

const botSettingsSchema = z.object({
  tradeMode: z.enum(["DRY_RUN", "LIVE"]),
  cadence: z.object({
    discoveryIntervalMs: z.number().int().positive(),
    evaluationIntervalMs: z.number().int().positive(),
    exitIntervalMs: z.number().int().positive(),
    entryDelayMs: z.number().int().nonnegative(),
    evaluationConcurrency: z.number().int().positive().max(10),
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
      evaluationIntervalMs: env.EVALUATION_INTERVAL_MS,
      exitIntervalMs: env.EXIT_INTERVAL_MS,
      entryDelayMs: env.ENTRY_DELAY_MS,
      evaluationConcurrency: env.EVALUATION_CONCURRENCY,
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
    capital: { ...base.capital, ...(overrides.capital ?? {}) },
    filters: { ...base.filters, ...(overrides.filters ?? {}) },
    exits: { ...base.exits, ...(overrides.exits ?? {}) },
  };
}

function validateSettings(input: BotSettings): BotSettings {
  return botSettingsSchema.parse(input);
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
    this.cachedSettings = validateSettings(mergeSettings(defaults, row.settings as Partial<BotSettings>));
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
    const tradeModeChanged = next.tradeMode !== current.tradeMode;
    const capitalChanged = next.capital.capitalUsd !== current.capital.capitalUsd;
    const [openPositions, botState] = await Promise.all([
      db.position.count({ where: { status: "OPEN" } }),
      db.botState.findUnique({ where: { id: "singleton" } }),
    ]);

    if (tradeModeChanged && openPositions > 0) {
      throw new Error("cannot switch trade mode while positions are still open");
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
    return next;
  }
}
