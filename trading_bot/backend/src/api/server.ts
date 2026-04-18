import crypto from "crypto";
import express from "express";
import { registerAdaptiveRoutes } from "./routes/adaptive-routes.js";
import { registerDeskOperatorRoutes } from "./routes/desk-operator-routes.js";
import { registerDiscoveryLabRoutes } from "./routes/discovery-lab-routes.js";
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

function cryptoTimingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createApiServer(deps: ApiServerDeps) {
  const app = express();
  app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: string }).rawBody = buffer.toString("utf8");
    },
  }));

  function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const secret = process.env.CONTROL_API_SECRET;
    if (!secret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const headerKey = typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : req.headers["x-api-key"];
    if (typeof headerKey !== "string" || !cryptoTimingSafeEqual(headerKey, secret)) {
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

  registerHealthRoutes(app);
  registerWebhookRoutes(app, deps);

  app.use("/api", (req, res, next) => {
    if (
      req.method === "GET"
      && (req.path === "/status" || req.path === "/settings")
    ) {
      next();
      return;
    }
    authMiddleware(req, res, next);
  });

  app.get("/api/status", async (_req, res) => {
    res.json(await deps.getSnapshot());
  });

  registerDeskOperatorRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerAdaptiveRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerPackRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerRunRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerMarketRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerEnrichmentRoutes(app, { deps, authMiddleware, respondWithDeskState });
  registerDiscoveryLabRoutes(app, { deps, authMiddleware, respondWithDeskState });
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
