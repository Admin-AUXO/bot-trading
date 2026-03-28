import { NextRequest, NextResponse } from "next/server";
import {
  createOperatorSessionValue,
  getDashboardControlSecret,
  getOperatorSessionCookieName,
  hasOperatorSession,
  matchesDashboardControlSecret,
} from "@/lib/server/operator-session";

export const runtime = "nodejs";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  const secret = getDashboardControlSecret();
  return NextResponse.json({
    authenticated: secret ? hasOperatorSession(request) : false,
    configured: Boolean(secret),
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = getDashboardControlSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Operator secret is not configured" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { secret?: string }
    | null;
  const providedSecret = body?.secret?.trim() ?? "";

  if (!providedSecret || !matchesDashboardControlSecret(providedSecret)) {
    return NextResponse.json(
      { error: "Invalid operator secret" },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ authenticated: true, configured: true });
  response.cookies.set(
    getOperatorSessionCookieName(),
    createOperatorSessionValue(secret),
    cookieOptions(),
  );
  return response;
}

export async function DELETE(): Promise<Response> {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(getOperatorSessionCookieName(), "", {
    ...cookieOptions(),
    maxAge: 0,
  });
  return response;
}
