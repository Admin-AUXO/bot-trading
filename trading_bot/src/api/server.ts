import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import Decimal from "decimal.js";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { logger, createChildLogger } from "../utils/logger.js";
import { db } from "../db/client.js";
import { overviewRouter } from "./routes/overview.js";
import { positionsRouter } from "./routes/positions.js";
import { tradesRouter } from "./routes/trades.js";
import { analyticsRouter } from "./routes/analytics.js";
import { controlRouter } from "./routes/control.js";
import { profilesRouter } from "./routes/profiles.js";
import { requireBearerToken } from "./middleware/auth.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { RegimeDetector } from "../core/regime-detector.js";

const log = createChildLogger("api");

export function createApiServer(deps: {
  riskManager: unknown;
  positionTracker: unknown;
  regimeDetector: unknown;
  configProfileManager: unknown;
  tradeExecutor?: unknown;
  dbClient?: typeof db;
}) {
  const app = express();
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

  const controlLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

  app.use("/api/overview", overviewRouter(deps));
  app.use("/api/positions", positionsRouter({
    tradeExecutor: deps.tradeExecutor,
    positionTracker: deps.positionTracker,
    dbClient: deps.dbClient,
  }));
  app.use("/api/trades", tradesRouter());
  app.use("/api/analytics", analyticsRouter());
  app.use("/api/control", controlLimiter, controlRouter({
    riskManager: deps.riskManager,
    tradeExecutor: deps.tradeExecutor,
    dbClient: deps.dbClient,
  }));
  app.use("/api/profiles", profilesRouter({
    configProfileManager: deps.configProfileManager,
    dbClient: deps.dbClient,
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
        const today = new Date(new Date().toISOString().slice(0, 10));

        const [todayTrades, todaySells, openPositions] = await Promise.all([
          db.trade.count({ where: { executedAt: { gte: today } } }),
          db.trade.findMany({
            where: { executedAt: { gte: today }, side: "SELL" },
            select: { pnlUsd: true },
          }),
          db.position.findMany({
            where: { status: { in: ["OPEN", "PARTIALLY_CLOSED"] } },
            orderBy: { openedAt: "desc" },
          }),
        ]);

        const todayPnl = todaySells.reduce((sum, t) => sum + Number(t.pnlUsd ?? 0), 0);
        const todayWins = todaySells.filter((t) => Number(t.pnlUsd ?? 0) > 0).length;

        const positions = openPositions.map((p) => ({
          id: p.id,
          strategy: p.strategy,
          tokenSymbol: p.tokenSymbol,
          tokenAddress: p.tokenAddress,
          entryPriceUsd: Number(p.entryPriceUsd),
          currentPriceUsd: Number(p.currentPriceUsd),
          amountSol: Number(p.amountSol),
          remainingToken: Number(p.remainingToken),
          peakPriceUsd: Number(p.peakPriceUsd),
          stopLossPercent: Number(p.stopLossPercent),
          tranche1Filled: p.tranche1Filled,
          tranche2Filled: p.tranche2Filled,
          exit1Done: p.exit1Done,
          exit2Done: p.exit2Done,
          exit3Done: p.exit3Done,
          pnlPercent: Number(p.entryPriceUsd) > 0
            ? new Decimal(Number(p.currentPriceUsd)).sub(Number(p.entryPriceUsd)).div(Number(p.entryPriceUsd)).mul(100).toNumber()
            : 0,
          holdMinutes: (Date.now() - p.openedAt.getTime()) / 60_000,
          status: p.status,
          regime: p.regime,
          mode: p.mode,
          platform: p.platform,
          walletSource: p.walletSource,
          openedAt: p.openedAt,
        }));

        res.write(`data: ${JSON.stringify({
          ...snapshot,
          regime,
          todayTrades,
          todayPnl,
          todayWins,
          todayLosses: todaySells.length - todayWins,
          positions,
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
    }, 5000);

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
