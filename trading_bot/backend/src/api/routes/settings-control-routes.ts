import type express from "express";
import type { RouteRegistrarContext } from "./types.js";

export function registerSettingsControlRoutes(
  app: express.Express,
  { deps, respondWithDeskState }: RouteRegistrarContext,
): void {
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
}

