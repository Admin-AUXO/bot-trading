import { db } from "../../db/client.js";
import { env } from "../../config/env.js";

export type AdaptiveSessionBucket = "peak" | "active" | "off" | "dead";

export type AdaptiveContext = {
  sessionBucket: AdaptiveSessionBucket;
  trailingWinRate: number | null;
  dailyPnlPct: number;
  consecutiveLosses: number;
  openExposurePct: number;
};

type SellFillRow = {
  pnlUsd: number | null;
  createdAt: Date;
};

export class AdaptiveContextBuilder {
  async buildContext(): Promise<AdaptiveContext> {
    const [botState, recentSellRows, dailyPnlResult] = await Promise.all([
      db.botState.findUniqueOrThrow({
        where: { id: "singleton" },
        select: {
          capitalUsd: true,
          cashUsd: true,
        },
      }),
      db.fill.findMany({
        where: { side: "SELL" },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          pnlUsd: true,
          createdAt: true,
        },
      }),
      db.fill.aggregate({
        _sum: { pnlUsd: true },
        where: {
          side: "SELL",
          createdAt: { gte: startOfTodayUtc() },
        },
      }),
    ]);

    const capitalUsd = Number(botState.capitalUsd);
    const cashUsd = Number(botState.cashUsd);
    const openExposurePct = capitalUsd > 0
      ? ((capitalUsd - cashUsd) / capitalUsd) * 100
      : 0;
    const dailyPnlUsd = Number(dailyPnlResult._sum.pnlUsd ?? 0);
    const dailyPnlPct = capitalUsd > 0
      ? (dailyPnlUsd / capitalUsd) * 100
      : 0;

    return {
      sessionBucket: deriveSessionBucket(),
      trailingWinRate: computeTrailingWinRate(recentSellRows),
      dailyPnlPct,
      consecutiveLosses: computeConsecutiveLosses(recentSellRows),
      openExposurePct,
    };
  }
}

function startOfTodayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function computeTrailingWinRate(rows: SellFillRow[]): number | null {
  const realized = rows
    .map((row) => (row.pnlUsd == null ? null : Number(row.pnlUsd)))
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (realized.length === 0) {
    return null;
  }
  const wins = realized.filter((value) => value > 0).length;
  return wins / realized.length;
}

function computeConsecutiveLosses(rows: SellFillRow[]): number {
  let losses = 0;
  for (const row of rows) {
    const pnlUsd = row.pnlUsd == null ? null : Number(row.pnlUsd);
    if (pnlUsd == null || !Number.isFinite(pnlUsd) || pnlUsd >= 0) {
      break;
    }
    losses += 1;
  }
  return losses;
}

function deriveSessionBucket(now = new Date()): AdaptiveSessionBucket {
  let hour = now.getUTCHours();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: env.US_HOURS_TIMEZONE,
      hour: "2-digit",
      hour12: false,
    });
    hour = Number(formatter.format(now));
  } catch {
    hour = now.getUTCHours();
  }

  if (hour >= 9 && hour < 12) {
    return "peak";
  }
  if (hour >= 12 && hour < 16) {
    return "active";
  }
  if (hour >= env.US_HOURS_START_HOUR && hour < env.US_HOURS_END_HOUR) {
    return "off";
  }
  return "dead";
}
