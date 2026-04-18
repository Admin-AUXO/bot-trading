import type express from "express";
import type { RouteRegistrarContext } from "./types.js";

export function registerEnrichmentRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  app.get("/api/operator/enrichment/:mint", async (req, res) => {
    return res.json(await deps.getEnrichment(req.params.mint));
  });
}
