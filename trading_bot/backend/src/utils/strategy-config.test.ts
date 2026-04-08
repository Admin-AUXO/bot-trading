import assert from "node:assert/strict";
import test from "node:test";

const { getExitPlan } = await import("./strategy-config.js");

test("S2 graduation exit plan uses tighter targets for delayed entries", () => {
  const plan = getExitPlan("S2_GRADUATION");

  assert.equal(Math.round(plan.tp1ThresholdPct * 100) / 100, 60);
  assert.equal(Math.round(plan.tp2ThresholdPct * 100) / 100, 140);
  assert.equal(plan.tp1SizePct, 50);
  assert.equal(plan.tp2SizePct, 12.5);
  assert.equal(plan.runnerSizePct, 37.5);
});
