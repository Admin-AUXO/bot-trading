import type express from "express";
import { parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

const CANDIDATE_BUCKETS = new Set(["ready", "risk", "provider", "data"]);

export function registerDeskOperatorRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  app.get("/api/desk/shell", async (_req, res) => {
    res.json(await deps.getDeskShell());
  });

  app.get("/api/desk/home", async (_req, res) => {
    res.json(await deps.getDeskHome());
  });

  app.get("/api/desk/events", async (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 100);
    res.json(await deps.listDeskEvents(limit));
  });

  app.get("/api/operator/shell", async (_req, res) => {
    res.json(await deps.getDeskShell());
  });

  app.get("/api/operator/home", async (_req, res) => {
    res.json(await deps.getDeskHome());
  });

  app.get("/api/operator/events", async (req, res) => {
    const limit = parseLimit(req.query.limit, 20, 100);
    res.json(await deps.listDeskEvents(limit));
  });

  app.get("/api/operator/candidates", async (req, res) => {
    const bucket = typeof req.query.bucket === "string" ? req.query.bucket : "ready";
    const normalized = CANDIDATE_BUCKETS.has(bucket) ? bucket as "ready" | "risk" | "provider" | "data" : "ready";
    res.json(await deps.listCandidateQueue(normalized));
  });

  app.get("/api/operator/candidates/:id", async (req, res) => {
    const row = await deps.getCandidateDetail(req.params.id);
    if (!row) {
      return res.status(404).json({ error: "candidate not found" });
    }
    return res.json(row);
  });

  app.get("/api/operator/positions", async (req, res) => {
    const book = typeof req.query.book === "string" ? req.query.book : "open";
    const normalized = book === "closed" ? "closed" : "open";
    res.json(await deps.listPositionBook(normalized));
  });

  app.get("/api/operator/positions/:id", async (req, res) => {
    const row = await deps.getPositionDetail(req.params.id);
    if (!row) {
      return res.status(404).json({ error: "position not found" });
    }
    return res.json(row);
  });

  app.get("/api/operator/diagnostics", async (_req, res) => {
    res.json(await deps.getDiagnostics());
  });
}

