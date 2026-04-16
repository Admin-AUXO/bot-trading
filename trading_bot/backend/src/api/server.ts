import express from "express";
import { ZodError } from "zod";
import { db } from "../db/client.js";
import { env } from "../config/env.js";
import { BOT_STATE_ID } from "../engine/constants.js";
import type { BotSettings, RuntimeSnapshot } from "../types/domain.js";
import type {
  DiscoveryLabCatalog,
  DiscoveryLabPackDraft,
  DiscoveryLabRunRequest,
} from "../services/discovery-lab-service.js";
import type { DiscoveryLabMarketRegimeResponse } from "../services/discovery-lab-market-regime-service.js";
import type { DiscoveryLabMarketStatsPayload } from "../services/discovery-lab-market-stats-service.js";
import type { DiscoveryLabStrategySuggestionsPayload } from "../services/discovery-lab-strategy-suggestion-service.js";

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return value === true;
}

function errorToStatus(error: unknown): number {
  if (error instanceof ZodError) {
    return 400;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("not found")) {
    return 404;
  }

  if (
    message.includes("already active")
    || message.includes("only available")
    || message.includes("cannot ")
    || message.includes("would be exceeded")
  ) {
    return 409;
  }

  return 500;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "request";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
  }
  return error instanceof Error ? error.message : "internal server error";
}

export function createApiServer(deps: {
  getSnapshot: () => Promise<RuntimeSnapshot>;
  getDeskShell: () => Promise<unknown>;
  getDeskHome: () => Promise<unknown>;
  listDeskEvents: (limit?: number) => Promise<unknown[]>;
  listCandidateQueue: (bucket: "ready" | "risk" | "provider" | "data") => Promise<unknown>;
  getCandidateDetail: (candidateId: string) => Promise<unknown | null>;
  listPositionBook: (book: "open" | "closed") => Promise<unknown>;
  getPositionDetail: (positionId: string) => Promise<unknown | null>;
  getDiagnostics: () => Promise<unknown>;
  getSettings: () => Promise<BotSettings>;
  patchSettings: (input: Partial<BotSettings>) => Promise<BotSettings>;
  pause: (reason?: string) => Promise<void>;
  resume: () => Promise<void>;
  triggerDiscovery: () => Promise<void>;
  triggerEvaluation: () => Promise<void>;
  triggerExitCheck: () => Promise<void>;
  getDiscoveryLabCatalog: () => Promise<DiscoveryLabCatalog>;
  validateDiscoveryLabDraft: (input: DiscoveryLabPackDraft, allowOverfiltered?: boolean) => Promise<unknown>;
  saveDiscoveryLabPack: (input: DiscoveryLabPackDraft) => Promise<unknown>;
  deleteDiscoveryLabPack: (packId: string) => Promise<unknown>;
  startDiscoveryLabRun: (input: DiscoveryLabRunRequest) => Promise<unknown>;
  listDiscoveryLabRuns: () => Promise<unknown>;
  getDiscoveryLabRun: (runId: string) => Promise<unknown | null>;
  getDiscoveryLabMarketRegime: (runId: string) => Promise<DiscoveryLabMarketRegimeResponse>;
  getDiscoveryLabMarketStats: (input?: { mint?: string; limit?: number; refresh?: boolean; focusOnly?: boolean }) => Promise<DiscoveryLabMarketStatsPayload>;
  getDiscoveryLabStrategySuggestions: (input?: { refresh?: boolean }) => Promise<DiscoveryLabStrategySuggestionsPayload>;
  getDiscoveryLabTokenInsight: (input: { mint?: string }) => Promise<unknown>;
  enterDiscoveryLabManualTrade: (input: {
    runId?: string;
    mint?: string;
    positionSizeUsd?: number;
    exitOverrides?: Record<string, number>;
  }) => Promise<unknown>;
  applyDiscoveryLabLiveStrategy: (input: { runId?: string }) => Promise<unknown>;
}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // ── Authentication middleware ─────────────────────────────────────────────────
  function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (!env.CONTROL_API_SECRET) {
      return next(); // no secret configured — leave endpoints open (dev mode)
    }
    const headerKey = typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : req.headers["x-api-key"];
    if (typeof headerKey !== "string" || headerKey !== env.CONTROL_API_SECRET) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  }

  async function respondWithDeskState(
    res: express.Response,
    action: string,
  ): Promise<void> {
    const [shell, home] = await Promise.all([
      deps.getDeskShell(),
      deps.getDeskHome(),
    ]);
    res.json({ ok: true, action, shell, home });
  }

  // Public routes — no auth required
  app.get("/health", async (_req, res) => {
    const state = await db.botState.findUnique({ where: { id: BOT_STATE_ID } });
    res.json({
      ok: true,
      tradeMode: state?.tradeMode ?? "unknown",
    });
  });

  app.get("/api/status", async (_req, res) => {
    res.json(await deps.getSnapshot());
  });

  // Authenticated routes
  app.use("/api/control", authMiddleware);
  app.use("/api/operator", authMiddleware);

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

  app.get("/api/operator/candidates", async (req, res) => {
    const bucket = typeof req.query.bucket === "string" ? req.query.bucket : "ready";
    const normalized = ["ready", "risk", "provider", "data"].includes(bucket) ? bucket as "ready" | "risk" | "provider" | "data" : "ready";
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

  app.get("/api/operator/discovery-lab/catalog", async (_req, res) => {
    res.json(await deps.getDiscoveryLabCatalog());
  });

  app.get("/api/operator/discovery-lab/market-regime", async (req, res) => {
    const runId = typeof req.query.runId === "string" ? req.query.runId.trim() : "";
    if (!runId) {
      return res.status(400).json({ error: "runId is required" });
    }
    return res.json(await deps.getDiscoveryLabMarketRegime(runId));
  });

  app.get("/api/operator/discovery-lab/market-stats", async (req, res) => {
    const mint = typeof req.query.mint === "string" ? req.query.mint.trim() : undefined;
    const limit = parseLimit(req.query.limit, 18, 30);
    const refresh = parseBooleanFlag(req.query.refresh);
    const focusOnly = parseBooleanFlag(req.query.focusOnly);
    return res.json(await deps.getDiscoveryLabMarketStats({ mint, limit, refresh, focusOnly }));
  });

  app.get("/api/operator/discovery-lab/strategy-suggestions", async (req, res) => {
    const refresh = parseBooleanFlag(req.query.refresh);
    return res.json(await deps.getDiscoveryLabStrategySuggestions({ refresh }));
  });

  app.get("/api/operator/discovery-lab/token-insight", async (req, res) => {
    const mint = typeof req.query.mint === "string" ? req.query.mint.trim() : "";
    if (!mint) {
      return res.status(400).json({ error: "mint is required" });
    }
    return res.json(await deps.getDiscoveryLabTokenInsight({ mint }));
  });

  app.post("/api/operator/discovery-lab/validate", async (req, res) => {
    res.json(await deps.validateDiscoveryLabDraft(req.body?.draft ?? req.body ?? {}, req.body?.allowOverfiltered === true));
  });

  app.post("/api/operator/discovery-lab/packs/save", async (req, res) => {
    res.json(await deps.saveDiscoveryLabPack(req.body ?? {}));
  });

  app.post("/api/operator/discovery-lab/packs/delete", async (req, res) => {
    if (typeof req.body?.packId !== "string" || req.body.packId.trim().length === 0) {
      return res.status(400).json({ error: "packId is required" });
    }
    return res.json(await deps.deleteDiscoveryLabPack(req.body.packId));
  });

  app.post("/api/operator/discovery-lab/run", async (req, res) => {
    res.json(await deps.startDiscoveryLabRun(req.body ?? {}));
  });

  app.post("/api/operator/discovery-lab/manual-entry", async (req, res) => {
    res.json(await deps.enterDiscoveryLabManualTrade(req.body ?? {}));
  });

  app.post("/api/operator/discovery-lab/apply-live-strategy", async (req, res) => {
    res.json(await deps.applyDiscoveryLabLiveStrategy(req.body ?? {}));
  });

  app.get("/api/operator/discovery-lab/runs", async (_req, res) => {
    res.json(await deps.listDiscoveryLabRuns());
  });

  app.get("/api/operator/discovery-lab/runs/:id", async (req, res) => {
    const run = await deps.getDiscoveryLabRun(req.params.id);
    if (!run) {
      return res.status(404).json({ error: "discovery lab run not found" });
    }
    return res.json(run);
  });

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

  app.get("/api/settings", async (_req, res) => {
    res.json(await deps.getSettings());
  });

  app.post("/api/settings", async (req, res) => {
    res.json(await deps.patchSettings(req.body ?? {}));
  });

  app.patch("/api/settings", async (req, res) => {
    res.json(await deps.patchSettings(req.body ?? {}));
  });

  app.post("/api/control/pause", async (req, res) => {
    await deps.pause(typeof req.body?.reason === "string" ? req.body.reason : undefined);
    await respondWithDeskState(res, "pause");
  });

  app.post("/api/control/resume", async (_req, res) => {
    await deps.resume();
    await respondWithDeskState(res, "resume");
  });

  app.post("/api/control/discover-now", async (_req, res) => {
    await deps.triggerDiscovery();
    await respondWithDeskState(res, "discover-now");
  });

  app.post("/api/control/evaluate-now", async (_req, res) => {
    await deps.triggerEvaluation();
    await respondWithDeskState(res, "evaluate-now");
  });

  app.post("/api/control/exit-check-now", async (_req, res) => {
    await deps.triggerExitCheck();
    await respondWithDeskState(res, "exit-check-now");
  });

  app.get("/api/views/:name", async (req, res) => {
    const allowed = new Set([
      "v_runtime_overview",
      "v_candidate_funnel_daily",
      "v_position_performance",
      "v_api_provider_daily",
      "v_api_endpoint_efficiency",
      "v_raw_api_payload_recent",
      "v_runtime_settings_current",
      "v_open_position_monitor",
      "v_recent_fill_activity",
      "v_position_snapshot_latest",
      "v_fill_pnl_daily",
      "v_fill_daily",
      "v_position_pnl_daily",
      "v_candidate_decision_facts",
      "v_discovery_lab_run_summary",
      "v_discovery_lab_pack_performance",
      "v_discovery_lab_recipe_outcomes",
      "v_discovery_lab_token_outcomes",
      "v_shared_token_fact_cache",
    ]);
    const viewName = req.params.name;
    if (!allowed.has(viewName)) {
      return res.status(404).json({ error: "view not available" });
    }
    const rows = await db.$queryRawUnsafe(`SELECT * FROM ${viewName} LIMIT 500`);
    return res.json(rows);
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = formatErrorMessage(error);
    res.status(errorToStatus(error)).json({ error: message });
  });

  return app;
}
