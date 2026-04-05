import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createOperatorSessionValue, getOperatorSessionCookieName } from "@/lib/server/operator-session-core";

process.env.CONTROL_API_SECRET = "test-control-secret-123";

test("GET reports configuration state and current authentication", async () => {
  const { GET } = await import("./route");
  const anonymous = new NextRequest("http://dashboard.test/api/operator-session");
  const anonymousResponse = await GET(anonymous);
  assert.deepEqual(await anonymousResponse.json(), { authenticated: false, configured: true });

  const sessionValue = createOperatorSessionValue(process.env.CONTROL_API_SECRET);
  const authenticated = new NextRequest("http://dashboard.test/api/operator-session", {
    headers: { cookie: `${getOperatorSessionCookieName()}=${sessionValue}` },
  });
  const authenticatedResponse = await GET(authenticated);
  assert.deepEqual(await authenticatedResponse.json(), { authenticated: true, configured: true });
});

test("POST rejects the wrong secret and sets a session cookie for the right secret", async () => {
  const { POST } = await import("./route");
  const badRequest = new NextRequest("http://dashboard.test/api/operator-session", {
    method: "POST",
    body: JSON.stringify({ secret: "wrong-secret" }),
    headers: { "content-type": "application/json" },
  });
  const badResponse = await POST(badRequest);
  assert.equal(badResponse.status, 401);
  assert.deepEqual(await badResponse.json(), { error: "Invalid operator secret" });

  const goodRequest = new NextRequest("http://dashboard.test/api/operator-session", {
    method: "POST",
    body: JSON.stringify({ secret: "test-control-secret-123" }),
    headers: { "content-type": "application/json" },
  });
  const goodResponse = await POST(goodRequest);
  assert.equal(goodResponse.status, 200);
  assert.deepEqual(await goodResponse.json(), { authenticated: true, configured: true });

  const setCookie = goodResponse.headers.get("set-cookie") ?? "";
  assert.match(setCookie, new RegExp(`^${getOperatorSessionCookieName()}=`));
  assert.match(setCookie, /HttpOnly/i);
});

test("DELETE clears the operator session cookie", async () => {
  const { DELETE } = await import("./route");
  const response = await DELETE();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/i);
});
