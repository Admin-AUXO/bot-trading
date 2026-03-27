import { Router } from "express";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import type { ConfigProfileManager } from "../../core/config-profile.js";

type Trade = Awaited<ReturnType<typeof db.trade.findMany>>[number];
type Position = Awaited<ReturnType<typeof db.position.findMany>>[number];

export function profilesRouter(deps: { configProfileManager: unknown }) {
  const router = Router();
  const manager = deps.configProfileManager as ConfigProfileManager;

  router.get("/", async (_req, res) => {
    const profiles = await db.configProfile.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(profiles);
  });

  router.post("/", async (req, res) => {
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

  router.put("/:name", async (req, res) => {
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ error: "settings required" });
    await manager.updateProfile(req.params.name, settings);
    res.json({ status: "updated" });
  });

  router.post("/:name/toggle", async (req, res) => {
    const { active } = req.body;
    await manager.toggleProfile(req.params.name, active ?? false);
    res.json({ status: active ? "activated" : "deactivated" });
  });

  router.delete("/:name", async (req, res) => {
    if (req.params.name === "default") {
      return res.status(400).json({ error: "cannot delete default profile" });
    }
    await manager.deleteProfile(req.params.name);
    res.json({ status: "deleted" });
  });

  router.get("/:name/results", cacheMiddleware(30_000), async (req, res) => {
    const profile = String(req.params.name);
    const mode = (req.query.mode as string) ?? "DRY_RUN";

    const [trades, positions] = await Promise.all([
      db.trade.findMany({
        where: { configProfile: profile, mode: mode as "LIVE" | "DRY_RUN" },
        orderBy: { executedAt: "desc" },
        take: 50,
      }),
      db.position.findMany({
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
