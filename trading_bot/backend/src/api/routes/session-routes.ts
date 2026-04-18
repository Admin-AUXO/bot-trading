import type express from "express";
import { parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

export function registerSessionRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  app.get("/api/operator/sessions", async (req, res) => {
    const limit = parseLimit(req.query.limit, 25, 100);
    return res.json(await deps.listSessions(limit));
  });

  app.get("/api/operator/sessions/current", async (_req, res) => {
    const session = await deps.getCurrentSession();
    if (!session) {
      return res.json(null);
    }
    return res.json(session);
  });

  app.patch("/api/operator/sessions/:id", async (req, res) => {
    const action = typeof req.body?.action === "string" ? req.body.action.trim().toLowerCase() : "";
    if (action !== "stop") {
      return res.status(400).json({ error: "action must be stop" });
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    return res.json(await deps.stopSession(req.params.id, reason));
  });
}
