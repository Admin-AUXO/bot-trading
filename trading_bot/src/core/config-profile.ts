import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import type { TradeMode, ConfigProfileSettings, StrategyOverrides } from "../utils/types.js";

const log = createChildLogger("config-profile");

export class ConfigProfileManager {
  private profiles: Map<string, { mode: TradeMode; settings: ConfigProfileSettings }> = new Map();

  async loadProfiles(): Promise<void> {
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

  getStrategyConfig(profileName: string, strategy: "s1" | "s2" | "s3") {
    const profile = this.profiles.get(profileName);
    const base = config.strategies[strategy];
    if (!profile) return base;

    const overrides = profile.settings[strategy];
    if (!overrides) return base;

    return { ...base, ...this.applyOverrides(base, overrides) };
  }

  getCapitalConfig(profileName: string) {
    const profile = this.profiles.get(profileName);
    if (!profile) return config.capital;

    return {
      ...config.capital,
      startingUsd: profile.settings.capitalUsd ?? config.capital.startingUsd,
      dailyLossPercent: profile.settings.dailyLossPercent ?? config.capital.dailyLossPercent,
      weeklyLossPercent: profile.settings.weeklyLossPercent ?? config.capital.weeklyLossPercent,
    };
  }

  private applyOverrides(base: Record<string, unknown>, overrides: StrategyOverrides): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined && key in base) {
        result[key] = value;
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
    await db.configProfile.create({
      data: {
        name: params.name,
        description: params.description ?? "",
        mode: params.mode,
        isActive: true,
        settings: params.settings as object,
      },
    });
    this.profiles.set(params.name, { mode: params.mode, settings: params.settings });
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
    await db.configProfile.update({
      where: { name },
      data: { isActive: active },
    });
    if (!active) this.profiles.delete(name);
    else await this.loadProfiles();
  }

  async deleteProfile(name: string): Promise<void> {
    if (name === "default") return;
    await db.configProfile.delete({ where: { name } });
    this.profiles.delete(name);
    log.info({ name }, "profile deleted");
  }
}
