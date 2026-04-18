import type express from "express";
import { db } from "../../db/client.js";
import { parseLimit } from "./utils.js";

export function registerLegacyDataRoutes(app: express.Express): void {
  app.get("/api/candidates", async (req, res) => {
    const limit = parseLimit(req.query.limit, 50, 200);
    const rows = await db.candidate.findMany({
      take: limit,
      orderBy: { discoveredAt: "desc" },
    });
    res.json(rows);
  });

  app.get("/api/positions", async (req, res) => {
    const limit = parseLimit(req.query.limit, 100, 200);
    const rows = await db.position.findMany({
      take: limit,
      orderBy: { openedAt: "desc" },
      include: { fills: { orderBy: { createdAt: "asc" } } },
    });
    res.json(rows);
  });

  app.get("/api/fills", async (req, res) => {
    const limit = parseLimit(req.query.limit, 100, 500);
    const rows = await db.fill.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    res.json(rows);
  });

  app.get("/api/provider-usage", async (_req, res) => {
    const rows = await db.apiEvent.findMany({
      orderBy: { calledAt: "desc" },
      take: 250,
    });
    res.json(rows);
  });

  app.get("/api/provider-payloads", async (req, res) => {
    const limit = parseLimit(req.query.limit, 100, 500);
    const provider = typeof req.query.provider === "string" ? req.query.provider.toUpperCase() : undefined;
    const endpoint = typeof req.query.endpoint === "string" ? req.query.endpoint : undefined;
    const entityKey = typeof req.query.entityKey === "string" ? req.query.entityKey : undefined;
    const rows = await db.rawApiPayload.findMany({
      where: {
        provider: provider === "BIRDEYE" || provider === "HELIUS" ? provider : undefined,
        endpoint: endpoint || undefined,
        entityKey: entityKey || undefined,
      },
      take: limit,
      orderBy: { capturedAt: "desc" },
    });
    res.json(rows);
  });

  app.get("/api/snapshots", async (req, res) => {
    const limit = parseLimit(req.query.limit, 100, 500);
    const mint = typeof req.query.mint === "string" ? req.query.mint : undefined;
    const trigger = typeof req.query.trigger === "string" ? req.query.trigger : undefined;
    const candidateId = typeof req.query.candidateId === "string" ? req.query.candidateId : undefined;
    const rows = await db.tokenMetrics.findMany({
      where: {
        mint: mint || undefined,
        trigger: trigger || undefined,
        candidateId: candidateId || undefined,
      },
      take: limit,
      orderBy: { capturedAt: "desc" },
    });
    res.json(rows);
  });
}

