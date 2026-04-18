import test from "node:test";
import assert from "node:assert/strict";
import { DefiLlamaClient } from "../../src/services/enrichment/defillama-client.js";
import { createMockHttpClient, loadFixture } from "./client-test-helpers.js";

test("DefiLlamaClient.fetch returns parsed payload", async () => {
  const client = new DefiLlamaClient("https://api.llama.fi", createMockHttpClient(200, loadFixture("defillama")));
  const result = await client.fetch("mint111");
  assert.ok(result);
  assert.equal(result.tvlUsd, 2500000);
  assert.equal(result.protocols.length, 2);
});

test("DefiLlamaClient.fetch returns null on provider 5xx", async () => {
  const client = new DefiLlamaClient("https://api.llama.fi", createMockHttpClient(503, { error: "down" }));
  const result = await client.fetch("mint111");
  assert.equal(result, null);
});

