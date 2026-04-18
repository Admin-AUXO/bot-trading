import test from "node:test";
import assert from "node:assert/strict";
import { GeckoTerminalClient } from "../../src/services/enrichment/geckoterminal-client.js";
import { createMockHttpClient, loadFixture } from "./client-test-helpers.js";

test("GeckoTerminalClient.fetch returns parsed payload", async () => {
  const client = new GeckoTerminalClient("https://api.geckoterminal.com/api/v2", createMockHttpClient(200, loadFixture("geckoterminal")));
  const result = await client.fetch("mint111");
  assert.ok(result);
  assert.equal(result.pools.length, 2);
  assert.equal(result.pools[0]?.dexName, "raydium");
});

test("GeckoTerminalClient.fetch returns null on provider 5xx", async () => {
  const client = new GeckoTerminalClient("https://api.geckoterminal.com/api/v2", createMockHttpClient(502, { error: "down" }));
  const result = await client.fetch("mint111");
  assert.equal(result, null);
});

