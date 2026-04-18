import { NextRequest, NextResponse } from "next/server";

const DEFAULT_DASHBOARD_AUTH_USERNAME = "operator";
const REALM = "Trading Desk";

function getDashboardAuthCredentials() {
  const password = process.env.DASHBOARD_AUTH_PASSWORD?.trim()
    || process.env.CONTROL_API_SECRET?.trim()
    || process.env.CONTROL_SECRET?.trim()
    || "";

  if (!password) {
    return null;
  }

  return {
    username: process.env.DASHBOARD_AUTH_USERNAME?.trim() || DEFAULT_DASHBOARD_AUTH_USERNAME,
    password,
  };
}

function parseBasicAuthHeader(headerValue: string | null) {
  if (!headerValue?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(headerValue.slice("Basic ".length));
    const delimiterIndex = decoded.indexOf(":");
    if (delimiterIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, delimiterIndex),
      password: decoded.slice(delimiterIndex + 1),
    };
  } catch {
    return null;
  }
}

function unauthorizedResponse() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

export function proxy(request: NextRequest) {
  const expected = getDashboardAuthCredentials();
  if (!expected) {
    return NextResponse.next();
  }

  const provided = parseBasicAuthHeader(request.headers.get("authorization"));
  if (
    !provided
    || provided.username !== expected.username
    || provided.password !== expected.password
  ) {
    return unauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
