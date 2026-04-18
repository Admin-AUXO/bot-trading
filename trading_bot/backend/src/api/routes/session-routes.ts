import type express from "express";
import { z } from "zod";
import { parseLimit } from "./utils.js";
import type { RouteRegistrarContext } from "./types.js";

export function registerSessionRoutes(app: express.Express, { deps }: RouteRegistrarContext): void {
  const startSessionSchema = z.object({
    runId: z.string().trim().min(1),
    mode: z.enum(["DRY_RUN", "LIVE"]).optional(),
    confirmation: z.string().trim().min(1),
    liveDeployToken: z.string().trim().min(1).optional(),
  });
  const patchSessionSchema = z.object({
    action: z.enum(["stop", "pause", "resume", "revert"]),
    reason: z.string().trim().min(1).optional(),
    mode: z.enum(["DRY_RUN", "LIVE"]).optional(),
    confirmation: z.string().trim().min(1).optional(),
    liveDeployToken: z.string().trim().min(1).optional(),
  });

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

  app.post("/api/operator/sessions", async (req, res) => {
    const input = startSessionSchema.parse(req.body ?? {});
    return res.json(await deps.startSession({
      ...input,
      requestIp: getRequestIp(req),
    }));
  });

  app.patch("/api/operator/sessions/:id", async (req, res) => {
    const input = patchSessionSchema.parse(req.body ?? {});
    if (input.action === "stop") {
      return res.json(await deps.stopSession(req.params.id, input.reason));
    }
    if (input.action === "pause") {
      return res.json(await deps.pauseSession(req.params.id, input.reason));
    }
    if (input.action === "resume") {
      return res.json(await deps.resumeSession(req.params.id));
    }
    return res.json(await deps.revertSession({
      sessionId: req.params.id,
      mode: input.mode,
      confirmation: input.confirmation ?? "",
      liveDeployToken: input.liveDeployToken,
      requestIp: getRequestIp(req),
    }));
  });
}

function getRequestIp(req: express.Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim().length > 0) {
    return realIp.trim();
  }
  return req.socket.remoteAddress ?? null;
}
