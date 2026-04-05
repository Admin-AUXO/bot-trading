import { createHmac, timingSafeEqual } from "node:crypto";

const OPERATOR_SESSION_COOKIE = "dashboard_operator_session";
const OPERATOR_SESSION_MARKER = "dashboard-operator";

export function getDashboardControlSecret(): string {
  return (
    process.env.DASHBOARD_OPERATOR_SECRET ??
    process.env.CONTROL_API_SECRET ??
    process.env.CONTROL_SECRET ??
    process.env.API_CONTROL_SECRET ??
    process.env.DASHBOARD_CONTROL_SECRET ??
    ""
  );
}

export function getOperatorSessionCookieName(): string {
  return OPERATOR_SESSION_COOKIE;
}

export function createOperatorSessionValue(secret: string): string {
  return createHmac("sha256", secret)
    .update(OPERATOR_SESSION_MARKER)
    .digest("hex");
}

export function matchesDashboardControlSecret(candidate: string): boolean {
  const secret = getDashboardControlSecret();
  if (!secret) return false;

  const actualBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(secret);

  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function hasOperatorSession(request: {
  cookies: { get(name: string): { value?: string } | undefined };
}): boolean {
  const secret = getDashboardControlSecret();
  if (!secret) return false;

  const cookie = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
  if (!cookie) return false;

  const expected = createOperatorSessionValue(secret);
  const actualBuffer = Buffer.from(cookie);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
