import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createOperatorSessionValue, getOperatorSessionCookieName } from "@/lib/server/operator-session-core";

process.env.API_URL = "http://backend.test";
process.env.CONTROL_API_SECRET = "test-control-secret-123";

const operatorCookieName = getOperatorSessionCookieName();
const operatorCookieValue = createOperatorSessionValue(process.env.CONTROL_API_SECRET);

async function withMockFetch(
  handler: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("GET /api/stream injects the backend control secret and preserves SSE transport", async () => {
  const { GET } = await import("./route");
  let capturedUrl = "";
  let capturedAuth = "";

  await withMockFetch(async (input, init) => {
    capturedUrl = String(input);
    capturedAuth = new Headers(init?.headers).get("authorization") ?? "";
    return new Response("data: heartbeat\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
    });
  }, async () => {
    const request = new NextRequest("http://dashboard.test/api/stream?foo=1");
    const response = await GET(request, { params: Promise.resolve({ path: ["stream"] }) });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.equal(await response.text(), "data: heartbeat\n\n");
  });

  assert.equal(capturedUrl, "http://backend.test/api/stream?foo=1");
  assert.equal(capturedAuth, "Bearer test-control-secret-123");
});

test("POST proxy rejects writes without an operator session", async () => {
  const { POST } = await import("./route");
  let fetchCalled = false;

  await withMockFetch(async () => {
    fetchCalled = true;
    return new Response("unexpected");
  }, async () => {
    const request = new NextRequest("http://dashboard.test/api/control/pause", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["control", "pause"] }) });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Operator session required" });
  });

  assert.equal(fetchCalled, false);
});

test("POST proxy forwards writes when the operator session cookie is valid", async () => {
  const { POST } = await import("./route");
  let capturedAuth = "";

  await withMockFetch(async (_input, init) => {
    capturedAuth = new Headers(init?.headers).get("authorization") ?? "";
    return Response.json({ ok: true }, { status: 202 });
  }, async () => {
    const request = new NextRequest("http://dashboard.test/api/control/pause", {
      method: "POST",
      body: JSON.stringify({ reason: "manual" }),
      headers: {
        "content-type": "application/json",
        cookie: `${operatorCookieName}=${operatorCookieValue}`,
        authorization: "Bearer should-be-stripped",
      },
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["control", "pause"] }) });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { ok: true });
  });

  assert.equal(capturedAuth, "Bearer test-control-secret-123");
});
