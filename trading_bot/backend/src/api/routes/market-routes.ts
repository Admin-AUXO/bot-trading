import type express from "express";
import { parseBooleanFlag, parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

export function registerMarketRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  app.get("/api/operator/market/trending", async (req, res) => {
    const mint = typeof req.query.mint === "string" ? req.query.mint.trim() : undefined;
    const limit = parseLimit(req.query.limit, 18, 30);
    const refresh = parseBooleanFlag(req.query.refresh);
    const focusOnly = parseBooleanFlag(req.query.focusOnly);
    const scope = req.query.scope === "watchlist" ? "watchlist" : "trending";
    const mints = typeof req.query.mints === "string"
      ? req.query.mints.split(",").map((value) => value.trim()).filter((value) => value.length > 0)
      : [];
    return res.json(await deps.getMarketTrending({ mint, limit, refresh, focusOnly, mints, scope }));
  });

  app.get("/api/operator/market/stats/:mint", async (req, res) => {
    return res.json(await deps.getMarketTokenStats(req.params.mint));
  });

  app.get("/api/operator/market/smart-wallet-events", async (req, res) => {
    const limit = parseLimit(req.query.limit, 10, 50);
    const mints = typeof req.query.mints === "string"
      ? req.query.mints.split(",").map((mint) => mint.trim()).filter((mint) => mint.length > 0)
      : [];
    return res.json(await deps.getRecentSmartWalletActivity(mints, limit));
  });

  app.get("/api/operator/market/strategy-suggestions", async (req, res) => {
    const refresh = parseBooleanFlag(req.query.refresh);
    return res.json(await deps.getMarketStrategySuggestions({ refresh }));
  });
}
