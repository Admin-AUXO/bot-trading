import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { config } from "../../config/index.js";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { requireBearerToken } from "../middleware/auth.js";
import type { RiskManager } from "../../core/risk-manager.js";
import type { TradeExecutor } from "../../core/trade-executor.js";
import type { CapitalConfig, ExecutionScope, Strategy } from "../../utils/types.js";

type StrategyConfigs = {
  S1_COPY: { maxPositions: number; positionSizeSol: number; stopLossPercent: number; maxSlippageBps: number; timeStopMinutes: number };
  S2_GRADUATION: { maxPositions: number; positionSizeSol: number; stopLossPercent: number; maxSlippageBps: number; timeStopMinutes: number; timeLimitMinutes: number };
  S3_MOMENTUM: { maxPositions: number; positionSizeSol: number; stopLossPercent: number; maxSlippageBps: number; timeStopMinutes: number; timeLimitMinutes: number };
};

function getDefaultStrategyConfigs(): StrategyConfigs {
  return {
    S1_COPY: {
      maxPositions: config.strategies.s1.maxPositions,
      positionSizeSol: config.strategies.s1.positionSizeSol,
      stopLossPercent: config.strategies.s1.stopLossPercent,
      maxSlippageBps: config.strategies.s1.maxSlippageBps,
      timeStopMinutes: config.strategies.s1.timeStopMinutes,
    },
    S2_GRADUATION: {
      maxPositions: config.strategies.s2.maxPositions,
      positionSizeSol: config.strategies.s2.positionSizeSol,
      stopLossPercent: config.strategies.s2.stopLossPercent,
      maxSlippageBps: config.strategies.s2.maxSlippageBps,
      timeStopMinutes: config.strategies.s2.timeStopMinutes,
      timeLimitMinutes: config.strategies.s2.timeLimitMinutes,
    },
    S3_MOMENTUM: {
      maxPositions: config.strategies.s3.maxPositions,
      positionSizeSol: config.strategies.s3.positionSizeSol,
      stopLossPercent: config.strategies.s3.stopLossPercent,
      maxSlippageBps: config.strategies.s3.maxSlippageBps,
      timeStopMinutes: config.strategies.s3.timeStopMinutes,
      timeLimitMinutes: config.strategies.s3.timeLimitMinutes,
    },
  };
}

export function controlRouter(deps: {
  riskManager: unknown;
  tradeExecutor?: unknown;
  dbClient?: typeof db;
  scope?: ExecutionScope;
  strategyConfigs?: StrategyConfigs;
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
    const configs = strategyConfigs ?? getDefaultStrategyConfigs();
    res.json({
      scope,
      strategies: {
        S1_COPY: {
          maxPositions: configs.S1_COPY.maxPositions,
          positionSize: configs.S1_COPY.positionSizeSol,
          stopLoss: configs.S1_COPY.stopLossPercent,
          maxSlippageBps: configs.S1_COPY.maxSlippageBps,
          timeStopMinutes: configs.S1_COPY.timeStopMinutes,
        },
        S2_GRADUATION: {
          maxPositions: configs.S2_GRADUATION.maxPositions,
          positionSize: configs.S2_GRADUATION.positionSizeSol,
          stopLoss: configs.S2_GRADUATION.stopLossPercent,
          maxSlippageBps: configs.S2_GRADUATION.maxSlippageBps,
          timeStopMinutes: configs.S2_GRADUATION.timeStopMinutes,
          timeLimitMinutes: configs.S2_GRADUATION.timeLimitMinutes,
        },
        S3_MOMENTUM: {
          maxPositions: configs.S3_MOMENTUM.maxPositions,
          positionSize: configs.S3_MOMENTUM.positionSizeSol,
          stopLoss: configs.S3_MOMENTUM.stopLossPercent,
          maxSlippageBps: configs.S3_MOMENTUM.maxSlippageBps,
          timeStopMinutes: configs.S3_MOMENTUM.timeStopMinutes,
          timeLimitMinutes: configs.S3_MOMENTUM.timeLimitMinutes,
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
      maxSlippageBps: (strategyConfigs ?? getDefaultStrategyConfigs())[strategy].maxSlippageBps,
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
