import type express from "express";
import { db } from "../../db/client.js";
import { BOT_STATE_ID } from "../../engine/constants.js";

export function registerHealthRoutes(app: express.Express): void {
  app.get("/health", async (_req, res) => {
    const state = await db.botState.findUnique({ where: { id: BOT_STATE_ID } });
    res.json({
      ok: true,
      tradeMode: state?.tradeMode ?? "unknown",
    });
  });
}

