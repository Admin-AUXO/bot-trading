import { Router } from "express";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { requireBearerToken } from "../middleware/auth.js";
import type { ConfigProfileManager } from "../../core/config-profile.js";

type Trade = Awaited<ReturnType<typeof db.trade.findMany>>[number];
type Position = Awaited<ReturnType<typeof db.position.findMany>>[number];

export function profilesRouter(deps: { configProfileManager: unknown; dbClient?: typeof db }) {
  const router = Router();
  const manager = deps.configProfileManager as ConfigProfileManager;
  const database = deps.dbClient ?? db;

  router.get("/", async (_req, res) => {
    const profiles = await database.configProfile.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(profiles);
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
    res.json({ status: "created", name });
  });

  router.put("/:name", requireBearerToken, async (req, res) => {
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ error: "settings required" });
    const profileName = String(req.params.name);
    await manager.updateProfile(profileName, settings);
    res.json({ status: "updated" });
  });

  router.post("/:name/toggle", requireBearerToken, async (req, res) => {
    const { active } = req.body;
    const profileName = String(req.params.name);
    await manager.toggleProfile(profileName, active ?? false);
    res.json({ status: active ? "activated" : "deactivated" });
  });

  router.delete("/:name", requireBearerToken, async (req, res) => {
    const profileName = String(req.params.name);
    if (profileName === "default") {
      return res.status(400).json({ error: "cannot delete default profile" });
    }
    await manager.deleteProfile(profileName);
    res.json({ status: "deleted" });
  });

  router.get("/:name/results", cacheMiddleware(30_000), async (req, res) => {
    const profile = String(req.params.name);
    const mode = (req.query.mode as string) ?? "DRY_RUN";

    const [trades, positions] = await Promise.all([
      database.trade.findMany({
        where: { configProfile: profile, mode: mode as "LIVE" | "DRY_RUN" },
        orderBy: { executedAt: "desc" },
        take: 50,
      }),
      database.position.findMany({
        where: { configProfile: profile, mode: mode as "LIVE" | "DRY_RUN" },
        orderBy: { openedAt: "desc" },
        take: 20,
      }),
    ]);

    const sells = trades.filter((t: Trade) => t.side === "SELL");
    const wins = sells.filter((t: Trade) => Number(t.pnlUsd ?? 0) > 0);

    res.json({
      profile,
      mode,
      totalTrades: trades.length,
      totalExits: sells.length,
      wins: wins.length,
      losses: sells.length - wins.length,
      winRate: sells.length > 0 ? wins.length / sells.length : 0,
      totalPnlUsd: sells.reduce((s: number, t: Trade) => s + Number(t.pnlUsd ?? 0), 0),
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
