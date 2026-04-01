import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProtectedDailyBudget,
  estimateBirdeyeBatchCost,
  getBirdeyePlanProfile,
} from "./provider-plan.js";

test("getBirdeyePlanProfile returns Lite and Starter capabilities", () => {
  const lite = getBirdeyePlanProfile("LITE");
  const starter = getBirdeyePlanProfile("STARTER");

  assert.deepEqual(lite, {
    name: "LITE",
    monthlyCu: 1_500_000,
    rateLimitRps: 15,
    websocketAccess: false,
    s2CatchupIntervalMs: 30 * 60_000,
    priceSlowPathRefreshMs: 3 * 60_000,
    tradeDataSlowPathRefreshMs: 3 * 60_000,
  });

  assert.deepEqual(starter, {
    name: "STARTER",
    monthlyCu: 5_000_000,
    rateLimitRps: 15,
    websocketAccess: false,
    s2CatchupIntervalMs: 10 * 60_000,
    priceSlowPathRefreshMs: 60_000,
    tradeDataSlowPathRefreshMs: 60_000,
  });
});

test("estimateBirdeyeBatchCost follows the published N^0.8 formula", () => {
  assert.equal(estimateBirdeyeBatchCost(1), 5);
  assert.equal(estimateBirdeyeBatchCost(3), 13);
  assert.equal(estimateBirdeyeBatchCost(5), 19);
  assert.equal(estimateBirdeyeBatchCost(100), 200);
});

test("calculateProtectedDailyBudget applies the reserve before dividing remaining days", () => {
  const liteBudget = calculateProtectedDailyBudget({
    budgetTotal: 1_500_000,
    monthlyRemaining: 1_500_000,
    reservePct: 0.2,
    now: new Date("2026-04-01T00:00:00.000Z"),
    cycleEnd: new Date("2026-05-01T00:00:00.000Z"),
  });

  assert.deepEqual(liteBudget, {
    reserveCredits: 300_000,
    remainingDays: 30,
    distributableRemaining: 1_200_000,
    dailyBudget: 40_000,
  });

  const starterBudget = calculateProtectedDailyBudget({
    budgetTotal: 5_000_000,
    monthlyRemaining: 5_000_000,
    reservePct: 0.2,
    now: new Date("2026-04-01T00:00:00.000Z"),
    cycleEnd: new Date("2026-05-01T00:00:00.000Z"),
  });

  assert.equal(starterBudget.reserveCredits, 1_000_000);
  assert.equal(starterBudget.dailyBudget, 133_333);
});
