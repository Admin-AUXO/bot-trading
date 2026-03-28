import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import type { TradeMode, CapitalConfig, ConfigProfileSettings, StrategyOverrides } from "../utils/types.js";

type StrategyConfigKey = keyof typeof config.strategies;

const log = createChildLogger("config-profile");

export class ConfigProfileManager {
  private profiles: Map<string, { mode: TradeMode; settings: ConfigProfileSettings }> = new Map();

  async loadProfiles(): Promise<void> {
    this.profiles.clear();
    const rows = await db.configProfile.findMany({ where: { isActive: true } });
    for (const row of rows) {
      this.profiles.set(row.name, {
        mode: row.mode,
        settings: row.settings as ConfigProfileSettings,
      });
    }
    log.info({ count: this.profiles.size }, "loaded active config profiles");
  }

  getActiveProfiles(): Array<{ name: string; mode: TradeMode; settings: ConfigProfileSettings }> {
    return Array.from(this.profiles.entries()).map(([name, p]) => ({
      name,
      mode: p.mode,
      settings: p.settings,
    }));
  }

  getDryRunProfiles(): Array<{ name: string; settings: ConfigProfileSettings }> {
    return this.getActiveProfiles().filter((p) => p.mode === "DRY_RUN");
  }

  getActiveProfile(mode: TradeMode): { name: string; mode: TradeMode; settings: ConfigProfileSettings } | null {
    return this.getActiveProfiles().find((profile) => profile.mode === mode) ?? null;
  }

  getStrategyConfig<T extends StrategyConfigKey>(profileName: string, strategy: T): (typeof config.strategies)[T] {
    const profile = this.profiles.get(profileName);
    const base = config.strategies[strategy];
    if (!profile) return base;

    const overrides = profile.settings[strategy];
    if (!overrides) return base;

    return { ...base, ...this.applyOverrides(base, overrides) } as (typeof config.strategies)[T];
  }

  getCapitalConfig(profileName: string): CapitalConfig {
    const profile = this.profiles.get(profileName);
    if (!profile) return config.capital;

    return {
      ...config.capital,
      startingUsd: profile.settings.capitalUsd ?? config.capital.startingUsd,
      dailyLossPercent: profile.settings.dailyLossPercent ?? config.capital.dailyLossPercent,
      weeklyLossPercent: profile.settings.weeklyLossPercent ?? config.capital.weeklyLossPercent,
    };
  }

  private applyOverrides<T extends Record<string, unknown>>(base: T, overrides: StrategyOverrides): Partial<T> {
    const result: Partial<T> = {};
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined && key in base) {
        result[key as keyof T] = value as T[keyof T];
      }
    }
    return result;
  }

  async createProfile(params: {
    name: string;
    description?: string;
    mode: TradeMode;
    settings: ConfigProfileSettings;
  }): Promise<void> {
    await db.$transaction(async (tx) => {
      await tx.configProfile.updateMany({
        where: { mode: params.mode, isActive: true },
        data: { isActive: false },
      });

      await tx.configProfile.create({
        data: {
          name: params.name,
          description: params.description ?? "",
          mode: params.mode,
          isActive: true,
          settings: params.settings as object,
        },
      });
    });
    await this.loadProfiles();
    log.info({ name: params.name, mode: params.mode }, "profile created");
  }

  async updateProfile(name: string, settings: ConfigProfileSettings): Promise<void> {
    await db.configProfile.update({
      where: { name },
      data: { settings: settings as object },
    });
    const existing = this.profiles.get(name);
    if (existing) existing.settings = settings;
    log.info({ name }, "profile updated");
  }

  async toggleProfile(name: string, active: boolean): Promise<void> {
    if (!active) {
      await db.configProfile.update({
        where: { name },
        data: { isActive: false },
      });
      this.profiles.delete(name);
      return;
    }

    const profile = await db.configProfile.findUnique({
      where: { name },
      select: { mode: true },
    });
    if (!profile) return;

    await db.$transaction(async (tx) => {
      await tx.configProfile.updateMany({
        where: { mode: profile.mode, isActive: true },
        data: { isActive: false },
      });
      await tx.configProfile.update({
        where: { name },
        data: { isActive: true },
      });
    });

    await this.loadProfiles();
  }

  async deleteProfile(name: string): Promise<void> {
    if (name === "default") return;
    await db.configProfile.delete({ where: { name } });
    this.profiles.delete(name);
    log.info({ name }, "profile deleted");
  }
}
