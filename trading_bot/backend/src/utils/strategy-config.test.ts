import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV ??= "test";
process.env.LOG_LEVEL ??= "error";
process.env.TRADE_MODE ??= "DRY_RUN";
process.env.BOT_PORT ??= "3001";
process.env.DASHBOARD_PORT ??= "3000";
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.HELIUS_API_KEY ??= "test-helius";
process.env.HELIUS_RPC_URL ??= "https://example.com/rpc";
process.env.HELIUS_WS_URL ??= "wss://example.com/ws";
process.env.BIRDEYE_API_KEY ??= "test-birdeye";
process.env.SOLANA_PRIVATE_KEY ??= "test-private-key";
process.env.SOLANA_PUBLIC_KEY ??= "test-public-key";
process.env.CONTROL_API_SECRET ??= "test-control-secret-123";

const { getExitPlan } = await import("./strategy-config.js");

test("S2 graduation exit plan uses tighter targets for delayed entries", () => {
  const plan = getExitPlan("S2_GRADUATION");

  assert.equal(Math.round(plan.tp1ThresholdPct * 100) / 100, 60);
  assert.equal(Math.round(plan.tp2ThresholdPct * 100) / 100, 140);
  assert.equal(plan.tp1SizePct, 50);
  assert.equal(plan.tp2SizePct, 12.5);
  assert.equal(plan.runnerSizePct, 37.5);
});
