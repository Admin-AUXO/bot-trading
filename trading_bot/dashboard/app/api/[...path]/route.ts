import type { NextRequest } from "next/server";
import {
  getDashboardControlSecret,
  hasOperatorSession,
} from "@/lib/server/operator-session-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND = process.env.API_URL ?? "http://localhost:3001";

function shouldProxyWithControlSecret(
  method: string,
  path: string[],
): boolean {
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    return true;
  }

  return path.length === 1 && path[0] === "stream";
}

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await params;
  const controlSecret = getDashboardControlSecret();
  const requiresControlSecret = shouldProxyWithControlSecret(request.method, path);
  const target = new URL(`/api/${path.join("/")}${request.nextUrl.search}`, BACKEND);

  if (requiresControlSecret && !controlSecret) {
    return Response.json(
      { error: "Dashboard control secret is not configured" },
      { status: 503 },
    );
  }

  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()) &&
    !hasOperatorSession(request)
  ) {
    return Response.json(
      { error: "Operator session required" },
      { status: 401 },
    );
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  headers.delete("transfer-encoding");
  headers.delete("accept-encoding");
  headers.delete("authorization");

  if (requiresControlSecret) {
    headers.set("authorization", `Bearer ${controlSecret}`);
  }

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  try {
    const upstream = await fetch(target, { method: request.method, headers, body });
    const upstreamCt = upstream.headers.get("content-type") ?? "application/json";

    if (upstreamCt.includes("text/event-stream")) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    }

    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "content-type": upstreamCt },
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "ETIMEDOUT" || code === "EHOSTUNREACH" ? 504 : 503;
    return Response.json({ error: "Backend unavailable" }, { status });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
