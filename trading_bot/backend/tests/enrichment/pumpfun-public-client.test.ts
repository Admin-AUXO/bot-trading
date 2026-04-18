import test from "node:test";
import assert from "node:assert/strict";
import { PumpfunPublicClient } from "../../src/services/enrichment/pumpfun-public-client.js";
import { createMockHttpClient, loadFixture } from "./client-test-helpers.js";

test("PumpfunPublicClient.fetch returns parsed payload", async () => {
  const client = new PumpfunPublicClient("https://frontend-api.pump.fun", createMockHttpClient(200, loadFixture("pumpfun-public")));
  const result = await client.fetch("mint111");
  assert.ok(result);
  assert.equal(result.symbol, "PUMP");
  assert.equal(result.replyCount, 12);
  assert.equal(result.kothDurationSeconds, 900);
});

test("PumpfunPublicClient.fetch returns null on provider 5xx", async () => {
  const client = new PumpfunPublicClient("https://frontend-api.pump.fun", createMockHttpClient(503, { error: "down" }));
  const result = await client.fetch("mint111");
  assert.equal(result, null);
});

