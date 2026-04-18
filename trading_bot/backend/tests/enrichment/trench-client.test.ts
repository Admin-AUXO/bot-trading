import test from "node:test";
import assert from "node:assert/strict";
import { TrenchClient } from "../../src/services/enrichment/trench-client.js";
import { createMockHttpClient, loadFixture } from "./client-test-helpers.js";

test("TrenchClient.fetch returns parsed payload", async () => {
  const client = new TrenchClient("https://api.trench.bot", createMockHttpClient(200, loadFixture("trench")));
  const result = await client.fetch("mint111");
  assert.ok(result);
  assert.equal(result.bundleSupplyPct, 0.18);
  assert.equal(result.sniperCount, 7);
  assert.equal(result.bundles.length, 2);
});

test("TrenchClient.fetch returns null on provider 5xx", async () => {
  const client = new TrenchClient("https://api.trench.bot", createMockHttpClient(503, { error: "down" }));
  const result = await client.fetch("mint111");
  assert.equal(result, null);
});

