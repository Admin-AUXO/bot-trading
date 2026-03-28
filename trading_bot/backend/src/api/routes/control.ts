import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { config } from "../../config/index.js";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { requireBearerToken } from "../middleware/auth.js";
import { defaultStrategyConfigs, getExitPlan, type StrategyConfigMap } from "../../utils/strategy-config.js";
import type { RiskManager } from "../../core/risk-manager.js";
import type { TradeExecutor } from "../../core/trade-executor.js";
import type { CapitalConfig, ExecutionScope, Strategy } from "../../utils/types.js";

export function controlRouter(deps: {
  riskManager: unknown;
  tradeExecutor?: unknown;
  dbClient?: typeof db;
  scope?: ExecutionScope;
  strategyConfigs?: StrategyConfigMap;
  capitalConfig?: CapitalConfig;
  walletReconciler?: () => Promise<number | null>;
}) {
  const router = Router();
  const riskManager = deps.riskManager as RiskManager;
  const tradeExecutor = deps.tradeExecutor as TradeExecutor | undefined;
  const database = deps.dbClient ?? db;
  const snapshotScope = () => deps.scope ?? riskManager.getSnapshot().scope;
  const strategyConfigs = deps.strategyConfigs;

  router.post("/pause", requireBearerToken, async (_req, res) => {
    riskManager.pause("manual pause");
    await riskManager.saveState();
    res.json({ status: "paused" });
  });

  router.post("/resume", requireBearerToken, async (_req, res) => {
    if (!riskManager.resume()) {
      return res.status(409).json({ error: "bot is not manually paused" });
    }
    await riskManager.saveState();
    res.json({ status: "running" });
  });

  router.get("/state", cacheMiddleware(config.api.stateCacheTtlMs), async (_req, res) => {
    const state = await database.botState.findUnique({ where: { id: "singleton" } });
    const snapshot = riskManager.getSnapshot();
    const scope = snapshotScope();
    res.json({
      scope,
      capitalUsd: snapshot.capitalUsd,
      capitalSol: snapshot.capitalSol,
      walletBalance: snapshot.walletBalance,
      dailyLossUsd: snapshot.dailyLossUsd,
      weeklyLossUsd: snapshot.weeklyLossUsd,
      dailyLossLimit: snapshot.dailyLossLimit,
      weeklyLossLimit: snapshot.weeklyLossLimit,
      capitalLevel: snapshot.capitalLevel,
      regime: snapshot.regime,
      rollingWinRate: snapshot.rollingWinRate,
      isRunning: snapshot.isRunning,
      pauseReason: snapshot.pauseReason,
      pauseReasons: snapshot.pauseReasons,
      updatedAt: state?.updatedAt ?? null,
    });
  });

  router.post("/reset-daily", requireBearerToken, async (_req, res) => {
    riskManager.checkDailyReset();
    await riskManager.saveState();
    res.json({ status: "daily counters reset" });
  });

  router.get("/heartbeat", cacheMiddleware(config.api.heartbeatCacheTtlMs), async (_req, res) => {
    const scope = snapshotScope();
    const laneWhere = { mode: scope.mode, configProfile: scope.configProfile };
    const snapshot = riskManager.getSnapshot();
    const [lastTrade, lastSignal] = await Promise.all([
      database.trade.findFirst({ where: laneWhere, orderBy: { executedAt: "desc" }, select: { executedAt: true } }),
      database.signal.findFirst({ where: laneWhere, orderBy: { detectedAt: "desc" }, select: { detectedAt: true } }),
    ]);

    res.json({
      scope,
      isRunning: snapshot.isRunning,
      uptime: process.uptime(),
      lastTradeAt: lastTrade?.executedAt ?? null,
      lastSignalAt: lastSignal?.detectedAt ?? null,
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  });

  router.get("/config", cacheMiddleware(config.api.controlConfigCacheTtlMs), async (_req, res) => {
    const snapshot = riskManager.getSnapshot();
    const scope = snapshotScope();
    const configs = strategyConfigs ?? defaultStrategyConfigs;
    res.json({
      scope,
      strategies: {
        S1_COPY: {
          maxPositions: configs.S1_COPY.maxPositions,
          configuredPositionSize: configs.S1_COPY.positionSizeSol,
          effectivePositionSize: riskManager.getPositionSize("S1_COPY"),
          stopLoss: configs.S1_COPY.stopLossPercent,
          maxSlippageBps: configs.S1_COPY.maxSlippageBps,
          timeStopMinutes: configs.S1_COPY.timeStopMinutes,
          exitPlan: getExitPlan("S1_COPY", configs),
        },
        S2_GRADUATION: {
          maxPositions: configs.S2_GRADUATION.maxPositions,
          configuredPositionSize: configs.S2_GRADUATION.positionSizeSol,
          effectivePositionSize: riskManager.getPositionSize("S2_GRADUATION"),
          stopLoss: configs.S2_GRADUATION.stopLossPercent,
          maxSlippageBps: configs.S2_GRADUATION.maxSlippageBps,
          timeStopMinutes: configs.S2_GRADUATION.timeStopMinutes,
          timeLimitMinutes: configs.S2_GRADUATION.timeLimitMinutes,
          exitPlan: getExitPlan("S2_GRADUATION", configs),
        },
        S3_MOMENTUM: {
          maxPositions: configs.S3_MOMENTUM.maxPositions,
          configuredPositionSize: configs.S3_MOMENTUM.positionSizeSol,
          effectivePositionSize: riskManager.getPositionSize("S3_MOMENTUM"),
          stopLoss: configs.S3_MOMENTUM.stopLossPercent,
          maxSlippageBps: configs.S3_MOMENTUM.maxSlippageBps,
          timeStopMinutes: configs.S3_MOMENTUM.timeStopMinutes,
          timeLimitMinutes: configs.S3_MOMENTUM.timeLimitMinutes,
          exitPlan: getExitPlan("S3_MOMENTUM", configs),
        },
      },
      risk: {
        dailyLossLimit: snapshot.dailyLossLimit,
        weeklyLossLimit: snapshot.weeklyLossLimit,
        walletBalance: snapshot.walletBalance,
        maxOpenPositions: deps.capitalConfig?.maxOpenPositions ?? config.capital.maxOpenPositions,
        gasReserve: deps.capitalConfig?.gasReserve ?? config.capital.gasReserve,
        capitalLevel: snapshot.capitalLevel,
        pauseReason: snapshot.pauseReason,
        pauseReasons: snapshot.pauseReasons,
      },
    });
  });

  router.post("/manual-entry", requireBearerToken, async (req, res) => {
    if (!tradeExecutor) {
      return res.status(503).json({ error: "manual entry not available" });
    }

    const { tokenAddress, tokenSymbol, strategy, amountSol } = req.body as {
      tokenAddress: string;
      tokenSymbol: string;
      strategy: Strategy;
      amountSol?: number;
    };

    if (!tokenAddress || !tokenSymbol || !strategy) {
      return res.status(400).json({ error: "tokenAddress, tokenSymbol, strategy required" });
    }

    try {
      new PublicKey(tokenAddress);
    } catch {
      return res.status(400).json({ error: "invalid token address" });
    }

    const BANNED_ADDRS = new Set([
      "11111111111111111111111111111111",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);
    if (BANNED_ADDRS.has(tokenAddress)) {
      return res.status(400).json({ error: "banned token address" });
    }

    const snapshot = riskManager.getSnapshot();
    const size = amountSol ?? riskManager.getPositionSize(strategy);
    if (!Number.isFinite(size) || size <= 0) {
      return res.status(400).json({ error: "amountSol must be a positive number" });
    }

    const check = riskManager.canOpenPosition(strategy, size);
    if (!check.allowed) {
      return res.status(409).json({ error: check.reason ?? "bot is paused" });
    }

    const result = await tradeExecutor.executeBuy({
      strategy,
      tokenAddress,
      tokenSymbol,
      amountSol: size,
      maxSlippageBps: (strategyConfigs ?? defaultStrategyConfigs)[strategy].maxSlippageBps,
      regime: snapshot.regime,
      tradeSource: "MANUAL",
    });

    if (result.success) {
      res.json({ success: true, txSignature: result.txSignature });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  });

  router.post("/reconcile-wallet", requireBearerToken, async (_req, res) => {
    if (!deps.walletReconciler) {
      return res.status(400).json({ error: "wallet reconciliation unavailable in this mode" });
    }

    const balanceSol = await deps.walletReconciler();
    if (balanceSol === null) {
      return res.status(502).json({ error: "wallet reconciliation failed" });
    }

    await riskManager.saveState();
    res.json({
      scope: snapshotScope(),
      balanceSol,
      status: "reconciled",
    });
  });

  return router;
}
