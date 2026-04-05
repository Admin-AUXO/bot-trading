import { Router } from "express";
import { db } from "../../db/client.js";
import { invalidateDashboardReadCaches } from "../cache-invalidation.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { requireBearerToken } from "../middleware/auth.js";
import type { RuntimeState } from "../../core/runtime-state.js";
import type { ConfigProfileManager } from "../../core/config-profile.js";
import type { TradeMode } from "../../utils/types.js";

type Trade = Awaited<ReturnType<typeof db.trade.findMany>>[number];
type Position = Awaited<ReturnType<typeof db.position.findMany>>[number];
type ProfileResultsSummary = {
  profile: string;
  mode: TradeMode;
  totalTrades: number;
  totalExits: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
};

function getSummaryKey(profile: string, mode: TradeMode) {
  return `${mode}:${profile}`;
}

function getOrCreateSummary(
  summaries: Map<string, ProfileResultsSummary>,
  profile: string,
  mode: TradeMode,
): ProfileResultsSummary {
  const key = getSummaryKey(profile, mode);
  const existing = summaries.get(key);
  if (existing) return existing;

  const created: ProfileResultsSummary = {
    profile,
    mode,
    totalTrades: 0,
    totalExits: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPnlUsd: 0,
  };
  summaries.set(key, created);
  return created;
}

async function buildProfileResultsSummaries(
  database: typeof db,
  filters?: { profile?: string; mode?: TradeMode },
): Promise<Map<string, ProfileResultsSummary>> {
  const where = {
    ...(filters?.profile ? { configProfile: filters.profile } : {}),
    ...(filters?.mode ? { mode: filters.mode } : {}),
  };
  const [tradeCounts, exitStats, winCounts, lossCounts] = await Promise.all([
    database.trade.groupBy({
      by: ["configProfile", "mode"],
      where,
      _count: { _all: true },
    }),
    database.trade.groupBy({
      by: ["configProfile", "mode"],
      where: { ...where, side: "SELL" },
      _count: { _all: true },
      _sum: { pnlUsd: true },
    }),
    database.trade.groupBy({
      by: ["configProfile", "mode"],
      where: { ...where, side: "SELL", pnlUsd: { gt: 0 } },
      _count: { _all: true },
    }),
    database.trade.groupBy({
      by: ["configProfile", "mode"],
      where: { ...where, side: "SELL", pnlUsd: { lte: 0 } },
      _count: { _all: true },
    }),
  ]);
  const summaries = new Map<string, ProfileResultsSummary>();

  for (const row of tradeCounts) {
    const summary = getOrCreateSummary(summaries, row.configProfile, row.mode);
    summary.totalTrades = row._count._all;
  }

  for (const row of exitStats) {
    const summary = getOrCreateSummary(summaries, row.configProfile, row.mode);
    summary.totalExits = row._count._all;
    summary.totalPnlUsd = Number(row._sum.pnlUsd ?? 0);
  }

  for (const row of winCounts) {
    const summary = getOrCreateSummary(summaries, row.configProfile, row.mode);
    summary.wins = row._count._all;
  }

  for (const row of lossCounts) {
    const summary = getOrCreateSummary(summaries, row.configProfile, row.mode);
    summary.losses = row._count._all;
  }

  for (const summary of summaries.values()) {
    summary.winRate = summary.totalExits > 0 ? summary.wins / summary.totalExits : 0;
  }

  return summaries;
}

export function profilesRouter(deps: {
  configProfileManager: unknown;
  dbClient?: typeof db;
  runtimeState?: RuntimeState;
  applyRuntimeProfile?: (profileName: string) => Promise<{ scope: { mode: "LIVE" | "DRY_RUN"; configProfile: string }; status: "active" | "activated" }>;
}) {
  const router = Router();
  const manager = deps.configProfileManager as ConfigProfileManager;
  const database = deps.dbClient ?? db;

  router.get("/", async (_req, res) => {
    const profiles = await database.configProfile.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(profiles);
  });

  router.get("/results-summary", cacheMiddleware(30_000), async (_req, res) => {
    const summaries = await buildProfileResultsSummaries(database);

    res.json(
      Array.from(summaries.values()).sort((left, right) => {
        if (left.mode === right.mode) {
          return left.profile.localeCompare(right.profile);
        }
        return left.mode.localeCompare(right.mode);
      }),
    );
  });

  router.post("/", requireBearerToken, async (req, res) => {
    const { name, description, mode, settings } = req.body;
    if (!name || !settings) {
      return res.status(400).json({ error: "name and settings required" });
    }
    await manager.createProfile({
      name,
      description: description ?? "",
      mode: mode ?? "DRY_RUN",
      settings,
    });
    invalidateDashboardReadCaches();
    res.json({ status: "created", name, active: false });
  });

  router.put("/:name", requireBearerToken, async (req, res) => {
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ error: "settings required" });
    const profileName = String(req.params.name);
    await manager.updateProfile(profileName, settings);
    if (deps.runtimeState && deps.runtimeState.scope.configProfile === profileName) {
      deps.runtimeState.strategyConfigs = {
        S1_COPY: manager.getStrategyConfig(profileName, "s1"),
        S2_GRADUATION: manager.getStrategyConfig(profileName, "s2"),
        S3_MOMENTUM: manager.getStrategyConfig(profileName, "s3"),
      };
      deps.runtimeState.capitalConfig = manager.getCapitalConfig(profileName);
    }
    invalidateDashboardReadCaches();
    res.json({ status: "updated" });
  });

  router.post("/:name/toggle", requireBearerToken, async (req, res) => {
    const active = Boolean(req.body?.active);
    const profileName = String(req.params.name);
    const profile = await database.configProfile.findUnique({
      where: { name: profileName },
      select: { mode: true, isActive: true },
    });
    if (!profile) {
      return res.status(404).json({ error: "profile not found" });
    }

    const runtimeScope = deps.runtimeState?.scope;

    if (!active) {
      if (runtimeScope && profile.mode === runtimeScope.mode && profileName === runtimeScope.configProfile) {
        return res.status(409).json({ error: "activate another profile before deactivating the current runtime profile" });
      }

      await manager.toggleProfile(profileName, false);
      invalidateDashboardReadCaches(runtimeScope);
      return res.json({ status: "deactivated" });
    }

    if (runtimeScope && profile.mode === runtimeScope.mode) {
      if (!deps.applyRuntimeProfile) {
        return res.status(503).json({ error: "runtime profile switching unavailable" });
      }

      try {
        const result = await deps.applyRuntimeProfile(profileName);
        invalidateDashboardReadCaches(result.scope);
        return res.json({ status: result.status, runtimeApplied: true, scope: result.scope });
      } catch (error) {
        const message = error instanceof Error ? error.message : "runtime profile switch failed";
        const status = message.includes("close all") ? 409 : 500;
        return res.status(status).json({ error: message });
      }
    }

    await manager.toggleProfile(profileName, true);
    invalidateDashboardReadCaches(runtimeScope);
    return res.json({ status: "activated", runtimeApplied: false });
  });

  router.delete("/:name", requireBearerToken, async (req, res) => {
    const profileName = String(req.params.name);
    if (profileName === "default") {
      return res.status(400).json({ error: "cannot delete default profile" });
    }
    const profile = await database.configProfile.findUnique({
      where: { name: profileName },
      select: { isActive: true },
    });
    if (!profile) {
      return res.status(404).json({ error: "profile not found" });
    }
    if (profile.isActive) {
      return res.status(409).json({ error: "cannot delete an active profile; activate another profile first" });
    }
    await manager.deleteProfile(profileName);
    invalidateDashboardReadCaches();
    res.json({ status: "deleted" });
  });

  router.get("/:name/results", cacheMiddleware(30_000), async (req, res) => {
    const profile = String(req.params.name);
    const mode = ((req.query.mode as string) ?? "DRY_RUN") as TradeMode;

    const [summaries, trades, positions] = await Promise.all([
      buildProfileResultsSummaries(database, { profile, mode }),
      database.trade.findMany({
        where: { configProfile: profile, mode },
        orderBy: { executedAt: "desc" },
        take: 50,
      }),
      database.position.findMany({
        where: { configProfile: profile, mode },
        orderBy: { openedAt: "desc" },
        take: 20,
      }),
    ]);
    const summary = summaries.get(getSummaryKey(profile, mode)) ?? {
      profile,
      mode,
      totalTrades: 0,
      totalExits: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnlUsd: 0,
    };

    res.json({
      ...summary,
      trades: trades.map((t: Trade) => ({
        ...t,
        amountSol: Number(t.amountSol),
        priceUsd: Number(t.priceUsd),
        pnlUsd: Number(t.pnlUsd ?? 0),
        pnlPercent: Number(t.pnlPercent ?? 0),
      })),
      positions: positions.map((p: Position) => ({
        ...p,
        entryPriceUsd: Number(p.entryPriceUsd),
        currentPriceUsd: Number(p.currentPriceUsd),
        pnlUsd: Number(p.pnlUsd ?? 0),
        amountSol: Number(p.amountSol),
      })),
    });
  });

  return router;
}
