import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { logger, createChildLogger } from "../utils/logger.js";
import { db } from "../db/client.js";
import { getLaneTodaySummary } from "./lane-summary.js";
import { getLaneActivity } from "./lane-activity.js";
import { serializeOpenPosition } from "./serializers/position.js";
import { overviewRouter } from "./routes/overview.js";
import { positionsRouter } from "./routes/positions.js";
import { tradesRouter } from "./routes/trades.js";
import { analyticsRouter } from "./routes/analytics.js";
import { controlRouter } from "./routes/control.js";
import { profilesRouter } from "./routes/profiles.js";
import { requireBearerToken } from "./middleware/auth.js";
import type { ApiBudgetManager } from "../core/api-budget-manager.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { RegimeDetector } from "../core/regime-detector.js";
import type { RuntimeState } from "../core/runtime-state.js";

const log = createChildLogger("api");

export function createApiServer(deps: {
  riskManager: unknown;
  positionTracker: unknown;
  regimeDetector: unknown;
  configProfileManager: unknown;
  tradeExecutor?: unknown;
  dbClient?: typeof db;
  runtimeState?: RuntimeState;
  apiBudgetManager?: ApiBudgetManager;
  walletReconciler?: () => Promise<number | null>;
  applyRuntimeProfile?: (profileName: string) => Promise<{ scope: { mode: "LIVE" | "DRY_RUN"; configProfile: string }; status: "active" | "activated" }>;
}) {
  const app = express();
  const database = deps.dbClient ?? db;
  app.use(cors({
    origin: [
      `http://localhost:${config.dashboardPort}`,
      `http://127.0.0.1:${config.dashboardPort}`,
    ],
  }));
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(compression());
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  const controlLimiter = rateLimit({
    windowMs: config.api.controlRateLimitWindowMs,
    max: config.api.controlRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/overview", overviewRouter(deps));
  app.use("/api/positions", positionsRouter({
    tradeExecutor: deps.tradeExecutor,
    positionTracker: deps.positionTracker,
    dbClient: deps.dbClient,
    runtimeState: deps.runtimeState,
  }));
  app.use("/api/trades", tradesRouter({ runtimeState: deps.runtimeState }));
  app.use("/api/analytics", analyticsRouter({ runtimeState: deps.runtimeState }));
  app.use("/api/control", controlLimiter, controlRouter({
    riskManager: deps.riskManager,
    tradeExecutor: deps.tradeExecutor,
    dbClient: deps.dbClient,
    runtimeState: deps.runtimeState,
    walletReconciler: deps.walletReconciler,
  }));
  app.use("/api/profiles", profilesRouter({
    configProfileManager: deps.configProfileManager,
    dbClient: deps.dbClient,
    runtimeState: deps.runtimeState,
    applyRuntimeProfile: deps.applyRuntimeProfile,
  }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      mode: config.tradeMode,
      uptime: process.uptime(),
    });
  });

  app.get("/api/stream", requireBearerToken, (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const riskManager = deps.riskManager as RiskManager;
    const regimeDetector = deps.regimeDetector as RegimeDetector;
    let sendInFlight = false;

    const send = async () => {
      if (sendInFlight) return;
      sendInFlight = true;
      try {
        const snapshot = riskManager.getSnapshot();
        const regime = regimeDetector.getState();
        const scope = deps.runtimeState?.scope ?? snapshot.scope;
        const [summary, laneActivity] = await Promise.all([
          getLaneTodaySummary(database, scope),
          getLaneActivity(database, scope),
        ]);

        res.write(`data: ${JSON.stringify({
          ...snapshot,
          regime,
          quotaSnapshots: deps.apiBudgetManager?.getSnapshots() ?? null,
          lastTradeAt: laneActivity.lastTradeAt,
          lastSignalAt: laneActivity.lastSignalAt,
          todayTrades: summary.todayTrades,
          todayPnl: summary.todayPnl,
          todayWins: summary.todayWins,
          todayLosses: summary.todayLosses,
          openPositions: snapshot.openPositions.map((position) => serializeOpenPosition(position)),
        })}\n\n`);
      } catch (err) {
        log.warn({ err }, "sse stream send failed");
      } finally {
        sendInFlight = false;
      }
    };

    void send();
    const interval = setInterval(() => {
      void send();
    }, config.api.streamIntervalMs);

    req.on("close", () => {
      clearInterval(interval);
    });
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    log.error({ err, method: req.method, path: req.path }, "unhandled route error");
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}

export function startApiServer(deps: Parameters<typeof createApiServer>[0]): void {
  const app = createApiServer(deps);
  app.listen(config.port, () => {
    log.info({ port: config.port, mode: config.tradeMode }, "API server started");
  });
}
