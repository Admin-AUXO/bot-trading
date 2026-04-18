import type express from "express";
import { parseBooleanFlag, parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

export function registerMarketRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  app.get("/api/operator/market/trending", async (req, res) => {
    const mint = typeof req.query.mint === "string" ? req.query.mint.trim() : undefined;
    const limit = parseLimit(req.query.limit, 18, 30);
    const refresh = parseBooleanFlag(req.query.refresh);
    const focusOnly = parseBooleanFlag(req.query.focusOnly);
    return res.json(await deps.getMarketTrending({ mint, limit, refresh, focusOnly }));
  });

  app.get("/api/operator/market/strategy-suggestions", async (req, res) => {
    const refresh = parseBooleanFlag(req.query.refresh);
    return res.json(await deps.getMarketStrategySuggestions({ refresh }));
  });
}
