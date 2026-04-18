import test from "node:test";
import assert from "node:assert/strict";
import { BubblemapsClient } from "../../src/services/enrichment/bubblemaps-client.js";
import { createMockHttpClient, loadFixture } from "./client-test-helpers.js";

test("BubblemapsClient.fetch returns parsed payload", async () => {
  const client = new BubblemapsClient("https://api-legacy.bubblemaps.io", createMockHttpClient(200, loadFixture("bubblemaps")));
  const result = await client.fetch("mint111");
  assert.ok(result);
  assert.equal(result.topClusterPct, 0.22);
  assert.equal(result.clusterCount, 2);
});

test("BubblemapsClient.fetch returns null on provider 5xx", async () => {
  const client = new BubblemapsClient("https://api-legacy.bubblemaps.io", createMockHttpClient(502, { error: "down" }));
  const result = await client.fetch("mint111");
  assert.equal(result, null);
});

