import assert from "node:assert/strict";
import test from "node:test";
import type { QueryClient } from "@tanstack/react-query";
import { dashboardQueryKeys } from "@/lib/dashboard-query-options";
import type { HeartbeatResponse, OverviewResponse } from "@/lib/api";
import { applyOverviewRealtimeUpdate, isOverviewStreamPayload } from "@/lib/realtime-overview";

type StoredValue = unknown;

function createFakeQueryClient() {
  const store = new Map<string, StoredValue>();
  const invalidations: string[] = [];

  return {
    client: {
      setQueryData(key: unknown, updater: unknown) {
        const serializedKey = JSON.stringify(key);
        const previous = store.get(serializedKey);
        const nextValue = typeof updater === "function"
          ? (updater as (value: unknown) => unknown)(previous)
          : updater;
        store.set(serializedKey, nextValue);
      },
      invalidateQueries({ queryKey }: { queryKey: unknown }) {
        invalidations.push(JSON.stringify(queryKey));
        return Promise.resolve();
      },
    } as unknown as QueryClient,
    get(key: unknown) {
      return store.get(JSON.stringify(key));
    },
    invalidations,
  };
}

function buildOverview(overrides: Partial<OverviewResponse> = {}): OverviewResponse {
  return {
    scope: { mode: "DRY_RUN", configProfile: "default" },
    capitalUsd: 200,
    capitalSol: 2.2,
    walletBalance: 2.2,
    walletCapitalUsd: 330,
    walletCapitalSol: 2.2,
    dailyLossUsd: 2,
    weeklyLossUsd: 2,
    dailyLossLimit: 10,
    weeklyLossLimit: 20,
    capitalLevel: "NORMAL",
    regime: {
      regime: "NORMAL",
      solPrice: 150,
      solChange5m: 1,
      solChange1h: 2,
      trendingCount: 4,
      rollingWinRate: 0.5,
    },
    rollingWinRate: 0.5,
    isRunning: true,
    pauseReason: null,
    pauseReasons: [],
    quotaSnapshots: [],
    lastTradeAt: "2026-04-05T09:00:00.000Z",
    lastSignalAt: "2026-04-05T09:01:00.000Z",
    openPositions: [
      {
        id: "pos-1",
        strategy: "S1_COPY",
        tokenAddress: "Token1",
        tokenSymbol: "AAA",
        platform: "RAYDIUM",
        walletSource: "ELITE",
        entryPriceUsd: 1,
        currentPriceUsd: 1.2,
        amountSol: 0.2,
        remainingToken: 100,
        peakPriceUsd: 1.3,
        stopLossPercent: 20,
        tranche1Filled: false,
        tranche2Filled: false,
        exit1Done: false,
        exit2Done: false,
        exit3Done: false,
        status: "OPEN",
        exitReason: null,
        pnlUsd: null,
        pnlPercent: 20,
        regime: "NORMAL",
        openedAt: "2026-04-05T08:58:00.000Z",
        closedAt: null,
        tradeSource: "AUTO",
      },
    ],
    todayTrades: 3,
    todayPnl: 1,
    todayWins: 2,
    todayLosses: 1,
    mode: "DRY_RUN",
    configProfile: "default",
    ...overrides,
  };
}

test("applyOverviewRealtimeUpdate updates cache slices and flags lane-wide invalidations", () => {
  const queryClient = createFakeQueryClient();
  const previousHeartbeat: HeartbeatResponse = {
    scope: { mode: "DRY_RUN", configProfile: "default" },
    isRunning: true,
    uptime: 120,
    lastTradeAt: "2026-04-05T08:30:00.000Z",
    lastSignalAt: "2026-04-05T08:31:00.000Z",
    memoryMb: 128,
  };
  queryClient.client.setQueryData(dashboardQueryKeys.heartbeat, previousHeartbeat);

  const overview = buildOverview({
    scope: { mode: "LIVE", configProfile: "aggressive" },
    capitalLevel: "CRITICAL",
    isRunning: false,
    dailyLossUsd: 8.5,
    openPositions: [
      ...buildOverview().openPositions,
      {
        ...buildOverview().openPositions[0],
        id: "pos-2",
        tokenAddress: "Token2",
        tokenSymbol: "BBB",
        tradeSource: "MANUAL",
      },
    ],
    todayTrades: 7,
    lastSignalAt: "2026-04-05T09:05:00.000Z",
  });

  const transition = applyOverviewRealtimeUpdate(queryClient.client, overview, {
    isRunning: true,
    capitalLevel: "NORMAL",
    dailyLossPercent: 70,
    scopeKey: "DRY_RUN:default",
    openPositions: 1,
    todayTrades: 3,
    lastSignalAt: "2026-04-05T09:01:00.000Z",
  });

  assert.equal(transition.paused, true);
  assert.equal(transition.capitalLevelChangedTo, "CRITICAL");
  assert.equal(transition.dailyLossWarning, true);
  assert.deepEqual(queryClient.get(dashboardQueryKeys.overview), overview);
  assert.deepEqual(queryClient.get(dashboardQueryKeys.positions("LIVE", "aggressive", null)), overview.openPositions);
  assert.deepEqual(queryClient.get(dashboardQueryKeys.positions("LIVE", "aggressive", "AUTO")), [overview.openPositions[0]]);
  assert.deepEqual(queryClient.get(dashboardQueryKeys.positions("LIVE", "aggressive", "MANUAL")), [overview.openPositions[1]]);
  assert.deepEqual(queryClient.get(dashboardQueryKeys.heartbeat), {
    ...previousHeartbeat,
    scope: { mode: "LIVE", configProfile: "aggressive" },
    isRunning: false,
    lastTradeAt: overview.lastTradeAt,
    lastSignalAt: overview.lastSignalAt,
  });

  assert.deepEqual(queryClient.invalidations, [
    JSON.stringify(dashboardQueryKeys.heartbeat),
    JSON.stringify(dashboardQueryKeys.strategyConfig),
    JSON.stringify(dashboardQueryKeys.profiles),
    JSON.stringify(["positions"]),
    JSON.stringify(dashboardQueryKeys.heartbeat),
    JSON.stringify(["position-history"]),
    JSON.stringify(["trades"]),
    JSON.stringify(["daily-stats"]),
    JSON.stringify(["strategy-analytics"]),
    JSON.stringify(["execution-quality"]),
    JSON.stringify(["pnl-distribution"]),
    JSON.stringify(["api-usage"]),
    JSON.stringify(dashboardQueryKeys.profileResultsSummaries),
    JSON.stringify(dashboardQueryKeys.heartbeat),
    JSON.stringify(["signals-paginated"]),
    JSON.stringify(["skipped-signals"]),
  ]);
});

test("isOverviewStreamPayload accepts normalized overview responses and rejects malformed values", () => {
  assert.equal(isOverviewStreamPayload(buildOverview()), true);
  assert.equal(isOverviewStreamPayload({ ...buildOverview(), dailyLossUsd: "8.5" }), false);
  assert.equal(isOverviewStreamPayload({ foo: "bar" }), false);
});
