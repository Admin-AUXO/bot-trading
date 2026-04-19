import type express from "express";
import { parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

export function registerRunRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  app.get("/api/operator/runs", async (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 100);
    return res.json(await deps.listRuns(limit));
  });

  app.post("/api/operator/manual-entry", async (req, res) => {
    return res.json(await deps.enterRunManualTrade(req.body ?? {}));
  });

  app.get("/api/operator/runs/:id", async (req, res) => {
    const run = await deps.getRunDetail(req.params.id);
    if (!run) {
      return res.status(404).json({ error: "run not found" });
    }
    return res.json(run);
  });

  app.post("/api/operator/runs/:id/grade", async (req, res) => {
    const body = req.body ?? {};
    return res.json(await deps.gradeRun(req.params.id, {
      persist: body.persist === true,
    }));
  });

  app.post("/api/operator/runs/:id/suggest-tuning", async (req, res) => {
    const body = req.body ?? {};
    return res.json(await deps.suggestRunTuning(req.params.id, {
      apply: body.apply === true,
    }));
  });

  app.post("/api/operator/runs/:id/apply-live", async (req, res) => {
    const body = req.body ?? {};
    return res.json(await deps.applyRunToLive({
      runId: req.params.id,
      mode: body.mode === "LIVE" || body.mode === "DRY_RUN" ? body.mode : undefined,
      confirmation: typeof body.confirmation === "string" ? body.confirmation : "",
      liveDeployToken: typeof body.liveDeployToken === "string" ? body.liveDeployToken : undefined,
      requestIp: getRequestIp(req),
    }));
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

function getRequestIp(req: express.Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim().length > 0) {
    return realIp.trim();
  }
  return req.socket.remoteAddress ?? null;
}
