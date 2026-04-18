import type express from "express";
import { parseBooleanFlag, parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

function registerDiscoveryLabBase(
  app: express.Express,
  basePath: string,
  { deps }: RouteRegistrarContext,
): void {
  app.get(`${basePath}/catalog`, async (_req, res) => {
    res.json(await deps.getDiscoveryLabCatalog());
  });

  app.get(`${basePath}/market-regime`, async (req, res) => {
    const runId = typeof req.query.runId === "string" ? req.query.runId.trim() : "";
    if (!runId) {
      return res.status(400).json({ error: "runId is required" });
    }
    return res.json(await deps.getRunMarketRegime(runId));
  });

  app.get(`${basePath}/market-stats`, async (req, res) => {
    const mint = typeof req.query.mint === "string" ? req.query.mint.trim() : undefined;
    const limit = parseLimit(req.query.limit, 18, 30);
    const refresh = parseBooleanFlag(req.query.refresh);
    const focusOnly = parseBooleanFlag(req.query.focusOnly);
    return res.json(await deps.getMarketTrending({ mint, limit, refresh, focusOnly }));
  });

  app.get(`${basePath}/strategy-suggestions`, async (req, res) => {
    const refresh = parseBooleanFlag(req.query.refresh);
    return res.json(await deps.getMarketStrategySuggestions({ refresh }));
  });

  app.get(`${basePath}/token-insight`, async (req, res) => {
    const mint = typeof req.query.mint === "string" ? req.query.mint.trim() : "";
    if (!mint) {
      return res.status(400).json({ error: "mint is required" });
    }
    const runId = typeof req.query.runId === "string" ? req.query.runId.trim() : "";
    return res.json(await deps.getRunTokenInsight({ runId, mint }));
  });

  app.post(`${basePath}/validate`, async (req, res) => {
    res.json(await deps.validateDiscoveryLabDraft(req.body?.draft ?? req.body ?? {}, req.body?.allowOverfiltered === true));
  });

  app.post(`${basePath}/packs/save`, async (req, res) => {
    res.json(await deps.saveDiscoveryLabPack(req.body ?? {}));
  });

  app.post(`${basePath}/packs/delete`, async (req, res) => {
    if (typeof req.body?.packId !== "string" || req.body.packId.trim().length === 0) {
      return res.status(400).json({ error: "packId is required" });
    }
    return res.json(await deps.deleteDiscoveryLabPack(req.body.packId));
  });

  app.post(`${basePath}/run`, async (req, res) => {
    res.json(await deps.startDiscoveryLabRun(req.body ?? {}));
  });

  app.post(`${basePath}/manual-entry`, async (req, res) => {
    res.json(await deps.enterRunManualTrade(req.body ?? {}));
  });

  app.post(`${basePath}/apply-live-strategy`, async (req, res) => {
    res.json(await deps.applyDiscoveryLabLiveStrategy(req.body ?? {}));
  });

  app.get(`${basePath}/runs`, async (_req, res) => {
    res.json(await deps.listDiscoveryLabRuns());
  });

  app.get(`${basePath}/runs/:id`, async (req, res) => {
    const detail = await deps.getRunDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: "discovery lab run not found" });
    }
    return res.json(detail.run);
  });
}

export function registerDiscoveryLabRoutes(app: express.Express, context: RouteRegistrarContext): void {
  registerDiscoveryLabBase(app, "/api/operator/discovery-lab", context);
  registerDiscoveryLabBase(app, "/api/operator/workbench-market", context);
  registerDiscoveryLabBase(app, "/api/workbench-market", context);
}
