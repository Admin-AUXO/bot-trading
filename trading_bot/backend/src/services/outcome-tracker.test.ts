import assert from "node:assert/strict";
import test from "node:test";
import { OutcomeTracker } from "./outcome-tracker.js";

test("OutcomeTracker backfills still run when Birdeye non-essential budget is blocked", async () => {
  const tracker = new OutcomeTracker(
    {
      refreshExitContext: async () => new Map(),
    } as never,
    {
      shouldRunNonEssential: () => false,
    } as never,
  );

  let signalsCalled = false;
  let positionsCalled = false;
  let walletActivityCalled = false;
  let graduationCalled = false;

  (tracker as any).backfillSignals = async () => {
    signalsCalled = true;
  };
  (tracker as any).backfillPositions = async () => {
    positionsCalled = true;
  };
  (tracker as any).backfillWalletActivity = async () => {
    walletActivityCalled = true;
  };
  (tracker as any).backfillGraduationEvents = async () => {
    graduationCalled = true;
  };

  await (tracker as any).runBackfill();

  assert.equal(signalsCalled, true);
  assert.equal(positionsCalled, true);
  assert.equal(walletActivityCalled, true);
  assert.equal(graduationCalled, true);
});
