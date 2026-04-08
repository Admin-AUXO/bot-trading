import assert from "node:assert/strict";
import test from "node:test";
import { ApiBudgetManager } from "./api-budget-manager.js";

test("ApiBudgetManager blocks non-essential calls before the configured daily reserve is consumed", async () => {
  const manager = new ApiBudgetManager({ log: () => undefined } as never);
  const state = (manager as any).rolloverIfNeeded("BIRDEYE");

  state.dailyBudget = 100;
  state.totalCredits = 79;
  state.pendingCredits = 0;
  state.monthlyRemaining = 1_000;

  await assert.rejects(
    manager.reserve("BIRDEYE", 2, { essential: false }),
    /daily BIRDEYE budget reserved for essential traffic/i,
  );
});

test("ApiBudgetManager still allows essential calls inside the protected daily reserve", async () => {
  const manager = new ApiBudgetManager({ log: () => undefined } as never);
  const state = (manager as any).rolloverIfNeeded("BIRDEYE");

  state.dailyBudget = 100;
  state.totalCredits = 79;
  state.pendingCredits = 0;
  state.monthlyRemaining = 1_000;

  const reservation = await manager.reserve("BIRDEYE", 2, { essential: true });
  reservation.cancel();
});
