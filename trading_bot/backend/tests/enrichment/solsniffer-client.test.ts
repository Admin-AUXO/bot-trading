import test from "node:test";
import assert from "node:assert/strict";
import { SolsnifferClient } from "../../src/services/enrichment/solsniffer-client.js";
import { createMockHttpClient, loadFixture } from "./client-test-helpers.js";

test("SolsnifferClient.fetch returns parsed payload", async () => {
  const client = new SolsnifferClient("https://solsniffer.com", createMockHttpClient(200, loadFixture("solsniffer")));
  const result = await client.fetch("mint111");
  assert.ok(result);
  assert.equal(result.score, 82);
  assert.deepEqual(result.topFlags, [
    "Mint authority enabled",
    "Freeze authority enabled",
    "Low holder diversity",
  ]);
});

test("SolsnifferClient.fetch returns null on provider 5xx", async () => {
  const client = new SolsnifferClient("https://solsniffer.com", createMockHttpClient(500, { error: "down" }));
  const result = await client.fetch("mint111");
  assert.equal(result, null);
});

