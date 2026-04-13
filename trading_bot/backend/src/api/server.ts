import express from "express";
import { ZodError } from "zod";
import { db } from "../db/client.js";
import { env } from "../config/env.js";
import type { BotSettings, RuntimeSnapshot } from "../types/domain.js";
import type {
  DiscoveryLabCatalog,
  DiscoveryLabPackDraft,
  DiscoveryLabRunRequest,
} from "../services/discovery-lab-service.js";
import type { DiscoveryLabMarketRegimeResponse } from "../services/discovery-lab-market-regime-service.js";

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
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
  getSettingsControl: () => Promise<unknown>;
  patchSettings: (input: Partial<BotSettings>) => Promise<BotSettings>;
  patchSettingsDraft: (input: Partial<BotSettings>) => Promise<unknown>;
  discardSettingsDraft: () => Promise<unknown>;
  runSettingsDryRun: () => Promise<unknown>;
  promoteSettingsDraft: () => Promise<unknown>;
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
}) {
  const app = express();
  app.use(express.json());

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

  app.use("/api/control", (req, res, next) => {
    if (!env.CONTROL_API_SECRET) return next();
    if (req.headers["x-control-secret"] === env.CONTROL_API_SECRET) return next();
    return res.status(401).json({ error: "unauthorized" });
  });

  app.use("/api/settings", (req, res, next) => {
    if (req.method === "GET" || !env.CONTROL_API_SECRET) return next();
    if (req.headers["x-control-secret"] === env.CONTROL_API_SECRET) return next();
    return res.status(401).json({ error: "unauthorized" });
  });

  app.use("/api/operator/discovery-lab", (req, res, next) => {
    if (req.method === "GET" || !env.CONTROL_API_SECRET) return next();
    if (req.headers["x-control-secret"] === env.CONTROL_API_SECRET) return next();
    return res.status(401).json({ error: "unauthorized" });
  });

  app.get("/health", async (_req, res) => {
    const state = await db.botState.findUnique({ where: { id: "singleton" } });
    res.json({
      ok: true,
      tradeMode: state?.tradeMode ?? "unknown",
    });
  });

  app.get("/api/status", async (_req, res) => {
    res.json(await deps.getSnapshot());
  });

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
    const rows = await db.tokenSnapshot.findMany({
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

  app.get("/api/settings/control", async (_req, res) => {
    res.json(await deps.getSettingsControl());
  });

  app.post("/api/settings", async (req, res) => {
    res.json(await deps.patchSettings(req.body ?? {}));
  });

  app.post("/api/settings/draft", async (req, res) => {
    res.json(await deps.patchSettingsDraft(req.body ?? {}));
  });

  app.post("/api/settings/draft/discard", async (_req, res) => {
    res.json(await deps.discardSettingsDraft());
  });

  app.post("/api/settings/dry-run", async (_req, res) => {
    res.json(await deps.runSettingsDryRun());
  });

  app.post("/api/settings/promote", async (_req, res) => {
    res.json(await deps.promoteSettingsDraft());
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
      "v_token_snapshot_enriched",
      "v_candidate_reject_reason_daily",
      "v_snapshot_trigger_daily",
      "v_position_exit_reason_daily",
      "v_runtime_settings_current",
      "v_candidate_latest_filter_state",
      "v_api_provider_hourly",
      "v_api_endpoint_hourly",
      "v_payload_failure_hourly",
      "v_runtime_lane_health",
      "v_runtime_live_status",
      "v_open_position_monitor",
      "v_recent_fill_activity",
      "v_position_snapshot_latest",
      "v_fill_pnl_daily",
      "v_fill_daily",
      "v_position_pnl_daily",
      "v_source_outcome_daily",
      "v_candidate_cohort_daily",
      "v_position_cohort_daily",
      "v_candidate_funnel_daily_source",
      "v_candidate_reject_reason_daily_source",
      "v_candidate_decision_facts",
      "v_config_change_log",
      "v_kpi_by_config_window",
      "v_config_field_change",
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
