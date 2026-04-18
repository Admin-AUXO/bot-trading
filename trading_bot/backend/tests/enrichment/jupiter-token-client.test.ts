import test from "node:test";
import assert from "node:assert/strict";
import { JupiterTokenClient } from "../../src/services/enrichment/jupiter-token-client.js";
import { createMockHttpClient, loadFixture } from "./client-test-helpers.js";

test("JupiterTokenClient.fetch returns parsed payload", async () => {
  const client = new JupiterTokenClient("https://tokens.jup.ag", createMockHttpClient(200, loadFixture("jupiter-token")));
  const result = await client.fetch("mint111");
  assert.ok(result);
  assert.equal(result.strict, true);
  assert.equal(result.verified, true);
  assert.equal(result.tags.length, 3);
});

test("JupiterTokenClient.fetch returns null on provider 5xx", async () => {
  const client = new JupiterTokenClient("https://tokens.jup.ag", createMockHttpClient(500, { error: "down" }));
  const result = await client.fetch("mint111");
  assert.equal(result, null);
});

