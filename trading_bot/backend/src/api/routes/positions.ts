import { Router } from "express";
import { db } from "../../db/client.js";
import { createChildLogger } from "../../utils/logger.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { requireBearerToken } from "../middleware/auth.js";
import type { StrategyConfigMap } from "../../utils/strategy-config.js";
import type { TradeExecutor } from "../../core/trade-executor.js";
import type { PositionTracker } from "../../core/position-tracker.js";
import type { ExecutionScope } from "../../utils/types.js";

const log = createChildLogger("positions");

export function positionsRouter(deps?: {
  tradeExecutor?: unknown;
  positionTracker?: unknown;
  dbClient?: typeof db;
  scope?: ExecutionScope;
  strategyConfigs?: StrategyConfigMap;
}) {
  const router = Router();
  const tradeExecutor = deps?.tradeExecutor as TradeExecutor | undefined;
  const positionTracker = deps?.positionTracker as PositionTracker | undefined;
  const database = deps?.dbClient ?? db;
  const defaultScope = deps?.scope;

  router.get("/", cacheMiddleware(5_000), async (req, res) => {
    const mode = (req.query.mode as string | undefined) ?? defaultScope?.mode;
    const profile = (req.query.profile as string | undefined) ?? defaultScope?.configProfile;
    const tradeSource = req.query.tradeSource as string | undefined;
    const includeTrades = req.query.includeTrades === "true";

    const where: Record<string, unknown> = {
      status: { in: ["OPEN", "PARTIALLY_CLOSED"] },
    };
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;
    if (tradeSource) where.tradeSource = tradeSource;

    const positions = await database.position.findMany({
      where,
      orderBy: { openedAt: "desc" },
      include: includeTrades ? { trades: { orderBy: { executedAt: "desc" }, take: 5 } } : undefined,
    });

    res.json(positions.map((p) => ({
      ...p,
      entryPriceSol: Number(p.entryPriceSol),
      entryPriceUsd: Number(p.entryPriceUsd),
      currentPriceSol: Number(p.currentPriceSol),
      currentPriceUsd: Number(p.currentPriceUsd),
      amountSol: Number(p.amountSol),
      amountToken: Number(p.amountToken),
      remainingToken: Number(p.remainingToken),
      peakPriceUsd: Number(p.peakPriceUsd),
      pnlPercent: p.entryPriceUsd && Number(p.entryPriceUsd) > 0
        ? ((Number(p.currentPriceUsd) - Number(p.entryPriceUsd)) / Number(p.entryPriceUsd)) * 100
        : 0,
      holdMinutes: (Date.now() - p.openedAt.getTime()) / 60_000,
    })));
  });

  router.get("/history", async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const strategy = req.query.strategy as string | undefined;
    const mode = (req.query.mode as string | undefined) ?? defaultScope?.mode;
    const profile = (req.query.profile as string | undefined) ?? defaultScope?.configProfile;
    const tradeSource = req.query.tradeSource as string | undefined;

    const where: Record<string, unknown> = { status: "CLOSED" };
    if (strategy) where.strategy = strategy;
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;
    if (tradeSource) where.tradeSource = tradeSource;

    const [positions, total, wins, losses, pnlAggregate, pnlPercentAggregate] = await Promise.all([
      database.position.findMany({
        where,
        orderBy: { closedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      database.position.count({ where }),
      database.position.count({
        where: {
          ...where,
          pnlUsd: { gt: 0 },
        },
      }),
      database.position.count({
        where: {
          ...where,
          pnlUsd: { lte: 0 },
        },
      }),
      database.position.aggregate({
        where,
        _sum: { pnlUsd: true },
      }),
      database.position.aggregate({
        where,
        _avg: { pnlPercent: true },
      }),
    ]);

    res.json({
      data: positions.map((p) => ({
        ...p,
        entryPriceUsd: Number(p.entryPriceUsd),
        currentPriceUsd: Number(p.currentPriceUsd),
        pnlUsd: Number(p.pnlUsd ?? 0),
        pnlPercent: Number(p.pnlPercent ?? 0),
        amountSol: Number(p.amountSol),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        closedCount: total,
        wins,
        losses,
        netPnlUsd: Number(pnlAggregate._sum.pnlUsd ?? 0),
        avgPnlPercent: Number(pnlPercentAggregate._avg.pnlPercent ?? 0),
      },
    });
  });

  router.post("/:id/manual-exit", requireBearerToken, async (req, res) => {
    if (!tradeExecutor || !positionTracker) {
      return res.status(503).json({ error: "manual exit not available" });
    }

    const positionId = String(req.params.id);
    const position = positionTracker.getById(positionId);
    if (!position) {
      return res.status(404).json({ error: "position not found or already closed" });
    }

    const trancheNumber = position.exit1Done ? (position.exit2Done ? 3 : 2) : 1;

    const result = await tradeExecutor.executeSell({
      positionId,
      tokenAddress: position.tokenAddress,
      tokenSymbol: position.tokenSymbol,
      strategy: position.strategy,
      amountToken: position.remainingToken,
      maxSlippageBps: deps?.strategyConfigs?.[position.strategy]?.maxSlippageBps ?? 500,
      exitReason: "MANUAL",
      trancheNumber,
      tradeSource: "MANUAL",
    });

    if (result.success) {
      res.json({ success: true, txSignature: result.txSignature });
    } else {
      log.error({ positionId: position.id, error: result.error }, "manual exit failed");
      res.status(400).json({ success: false, error: result.error });
    }
  });

  return router;
}
