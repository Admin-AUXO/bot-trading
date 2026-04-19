import express from "express";
import { registerAdaptiveRoutes } from "./routes/adaptive-routes.js";
import { registerDeskOperatorRoutes } from "./routes/desk-operator-routes.js";
import { registerEnrichmentRoutes } from "./routes/enrichment-routes.js";
import { registerHealthRoutes } from "./routes/health-routes.js";
import { registerLegacyDataRoutes } from "./routes/legacy-data-routes.js";
import { registerMarketRoutes } from "./routes/market-routes.js";
import { registerPackRoutes } from "./routes/pack-routes.js";
import { registerRunRoutes } from "./routes/run-routes.js";
import { registerSessionRoutes } from "./routes/session-routes.js";
import { registerSettingsControlRoutes } from "./routes/settings-control-routes.js";
import type { ApiServerDeps } from "./routes/types.js";
import { errorToStatus, formatErrorMessage } from "./routes/utils.js";
import { registerViewsRoutes } from "./routes/views-routes.js";
import { registerWebhookRoutes } from "./routes/webhook-routes.js";

export function createApiServer(deps: ApiServerDeps) {
  const app = express();
  app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: string }).rawBody = buffer.toString("utf8");
    },
  }));

  function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
    void req;
    void res;
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

  registerHealthRoutes(app);
  registerWebhookRoutes(app, deps);

  app.get("/api/status", async (_req, res) => {
    res.json(await deps.getSnapshot());
  });

  registerDeskOperatorRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerAdaptiveRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerPackRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerRunRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerMarketRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerEnrichmentRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerSessionRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerLegacyDataRoutes(app);
  registerSettingsControlRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerViewsRoutes(app);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = formatErrorMessage(error);
    res.status(errorToStatus(error)).json({ error: message });
  });

  return app;
}
