import type express from "express";
import { parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

export function registerAdaptiveRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  app.get("/api/operator/adaptive/activity", async (req, res) => {
    const limit = parseLimit(req.query.limit, 24, 168);
    return res.json(await deps.getAdaptiveActivity(limit));
  });
}
