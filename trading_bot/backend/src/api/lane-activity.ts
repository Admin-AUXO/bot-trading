import { config } from "../config/index.js";
import { db } from "../db/client.js";
import type { ExecutionScope } from "../utils/types.js";

type DatabaseClient = typeof db;

export interface LaneActivitySnapshot {
  lastTradeAt: Date | null;
  lastSignalAt: Date | null;
}

const LANE_ACTIVITY_TTL_MS = config.api.heartbeatCacheTtlMs;
const laneActivityCache = new Map<string, { expiresAt: number; value: LaneActivitySnapshot }>();

function laneActivityKey(scope: ExecutionScope): string {
  return `${scope.mode}:${scope.configProfile}`;
}

export async function getLaneActivity(
  database: DatabaseClient,
  scope: ExecutionScope,
): Promise<LaneActivitySnapshot> {
  const key = laneActivityKey(scope);
  const cached = laneActivityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const laneWhere = { mode: scope.mode, configProfile: scope.configProfile };
  const [lastTrade, lastSignal] = await Promise.all([
    database.trade.findFirst({
      where: laneWhere,
      orderBy: { executedAt: "desc" },
      select: { executedAt: true },
    }),
    database.signal.findFirst({
      where: laneWhere,
      orderBy: { detectedAt: "desc" },
      select: { detectedAt: true },
    }),
  ]);

  const value = {
    lastTradeAt: lastTrade?.executedAt ?? null,
    lastSignalAt: lastSignal?.detectedAt ?? null,
  };

  laneActivityCache.set(key, {
    expiresAt: Date.now() + LANE_ACTIVITY_TTL_MS,
    value,
  });

  return value;
}
