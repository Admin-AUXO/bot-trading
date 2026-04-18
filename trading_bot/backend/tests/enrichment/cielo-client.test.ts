import test from "node:test";
import assert from "node:assert/strict";
import { CieloClient } from "../../src/services/enrichment/cielo-client.js";
import { createMockHttpClient, loadFixture } from "./client-test-helpers.js";

test("CieloClient.fetch returns parsed payload", async () => {
  const client = new CieloClient("https://api.cielo.finance", createMockHttpClient(200, loadFixture("cielo")));
  const result = await client.fetch("mint111");
  assert.ok(result);
  assert.equal(result.buys24h, 1);
  assert.equal(result.sells24h, 1);
  assert.equal(result.netFlowUsd24h, 800.5);
});

test("CieloClient.fetch returns null on provider 5xx", async () => {
  const client = new CieloClient("https://api.cielo.finance", createMockHttpClient(500, { error: "down" }));
  const result = await client.fetch("mint111");
  assert.equal(result, null);
});

