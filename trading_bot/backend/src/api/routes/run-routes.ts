import type express from "express";
import { parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

export function registerRunRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  app.get("/api/operator/runs", async (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 100);
    return res.json(await deps.listRuns(limit));
  });

  app.get("/api/operator/runs/:id", async (req, res) => {
    const run = await deps.getRunDetail(req.params.id);
    if (!run) {
      return res.status(404).json({ error: "run not found" });
    }
    return res.json(run);
  });

  app.post("/api/operator/runs/:id/apply-live", async (req, res) => {
    return res.json(await deps.applyRunToLive(req.params.id));
  });

  app.get("/api/operator/runs/:id/market-regime", async (req, res) => {
    return res.json(await deps.getRunMarketRegime(req.params.id));
  });

  app.get("/api/operator/runs/:id/token-insight", async (req, res) => {
    const mint = typeof req.query.mint === "string" ? req.query.mint.trim() : "";
    if (!mint) {
      return res.status(400).json({ error: "mint is required" });
    }
    return res.json(await deps.getRunTokenInsight({ runId: req.params.id, mint }));
  });

  app.post("/api/operator/runs/:id/manual-entry", async (req, res) => {
    return res.json(await deps.enterRunManualTrade({
      ...(req.body ?? {}),
      runId: req.params.id,
    }));
  });
}
