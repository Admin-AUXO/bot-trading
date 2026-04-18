import type express from "express";
import { parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

export function registerPackRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  app.get("/api/operator/packs", async (req, res) => {
    const limit = parseLimit(req.query.limit, 100, 100);
    return res.json(await deps.listPacks(limit));
  });

  app.post("/api/operator/packs/validate", async (req, res) => {
    const allowOverfiltered = req.body?.allowOverfiltered === true;
    return res.json(await deps.validatePack(req.body?.draft ?? {}, allowOverfiltered));
  });

  app.post("/api/operator/packs", async (req, res) => {
    return res.json(await deps.savePack(req.body ?? {}));
  });

  app.get("/api/operator/packs/:id", async (req, res) => {
    const pack = await deps.getPack(req.params.id);
    if (!pack) {
      return res.status(404).json({ error: "pack not found" });
    }
    return res.json(pack);
  });

  app.patch("/api/operator/packs/:id", async (req, res) => {
    return res.json(await deps.savePack({ ...(req.body ?? {}), id: req.params.id }));
  });

  app.delete("/api/operator/packs/:id", async (req, res) => {
    return res.json(await deps.deletePack(req.params.id));
  });

  app.get("/api/operator/packs/:id/runs", async (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 100);
    return res.json(await deps.listRuns(limit, req.params.id));
  });

  app.post("/api/operator/packs/:id/runs", async (req, res) => {
    return res.json(await deps.startRunFromPack(req.params.id, req.body ?? {}));
  });
}
