import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import type { RiskManager } from "../../core/risk-manager.js";
import type { TradeExecutor } from "../../core/trade-executor.js";
import type { Strategy } from "../../utils/types.js";

export function controlRouter(deps: { riskManager: unknown; tradeExecutor?: unknown }) {
  const router = Router();
  const riskManager = deps.riskManager as RiskManager;
  const tradeExecutor = deps.tradeExecutor as TradeExecutor | undefined;

  router.post("/pause", async (_req, res) => {
    riskManager.pause("manual pause");
    await riskManager.saveState();
    res.json({ status: "paused" });
  });

  router.post("/resume", async (_req, res) => {
    if (!riskManager.resume()) {
      return res.status(409).json({ error: "bot is not manually paused" });
    }
    await riskManager.saveState();
    res.json({ status: "running" });
  });

  router.get("/state", cacheMiddleware(10_000), async (_req, res) => {
    const state = await db.botState.findUnique({ where: { id: "singleton" } });
    if (!state) return res.status(404).json({ error: "bot state not found" });
    res.json({
      ...state,
      capitalUsd:      Number(state.capitalUsd),
      capitalSol:      Number(state.capitalSol),
      walletBalance:   Number(state.walletBalance),
      dailyLossUsd:    Number(state.dailyLossUsd),
      weeklyLossUsd:   Number(state.weeklyLossUsd),
      dailyLossLimit:  Number(state.dailyLossLimit),
      weeklyLossLimit: Number(state.weeklyLossLimit),
    });
  });

  router.post("/reset-daily", async (_req, res) => {
    riskManager.checkDailyReset();
    await riskManager.saveState();
    res.json({ status: "daily counters reset" });
  });

  router.get("/heartbeat", cacheMiddleware(5_000), async (_req, res) => {
    const state = await db.botState.findUnique({ where: { id: "singleton" } });
    const lastTrade = await db.trade.findFirst({ orderBy: { executedAt: "desc" }, select: { executedAt: true } });
    const lastSignal = await db.signal.findFirst({ orderBy: { detectedAt: "desc" }, select: { detectedAt: true } });

    res.json({
      isRunning: state?.isRunning ?? false,
      uptime: process.uptime(),
      lastTradeAt: lastTrade?.executedAt ?? null,
      lastSignalAt: lastSignal?.detectedAt ?? null,
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  });

  router.get("/config", cacheMiddleware(30_000), async (_req, res) => {
    const state = await db.botState.findUnique({ where: { id: "singleton" } });
    res.json({
      strategies: {
        S1_COPY: {
          maxPositions: 2,
          positionSize: 0.20,
          stopLoss: 20,
          timeStop: "2h (no +10%)",
        },
        S2_GRADUATION: {
          maxPositions: 2,
          positionSize: 0.20,
          stopLoss: 25,
          timeStop: "15m (no +10%)",
        },
        S3_MOMENTUM: {
          maxPositions: 3,
          positionSize: 0.10,
          stopLoss: 10,
          timeStop: "5m (no +5%)",
        },
      },
      risk: {
        dailyLossLimit: Number(state?.dailyLossLimit ?? 10),
        weeklyLossLimit: Number(state?.weeklyLossLimit ?? 20),
        maxOpenPositions: 5,
        gasReserve: 0.10,
        capitalLevel: state?.capitalLevel ?? "NORMAL",
      },
    });
  });

  router.post("/manual-entry", async (req, res) => {
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
    const check = riskManager.canOpenPosition(strategy);
    if (!check.allowed) {
      return res.status(409).json({ error: check.reason ?? "bot is paused" });
    }

    const result = await tradeExecutor.executeBuy({
      strategy,
      tokenAddress,
      tokenSymbol,
      amountSol: size,
      maxSlippageBps: 500,
      regime: snapshot.regime,
      tradeSource: "MANUAL",
    });

    if (result.success) {
      res.json({ success: true, txSignature: result.txSignature });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  });

  return router;
}
