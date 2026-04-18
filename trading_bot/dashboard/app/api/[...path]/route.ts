import { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3101";
const CONTROL_API_SECRET = process.env.CONTROL_API_SECRET ?? process.env.CONTROL_SECRET ?? "";

async function proxy(request: NextRequest, path: string[]) {
  const url = new URL(`${API_URL}/api/${path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");
  const contentType = request.headers.get("content-type");
  const forwardedAuthHeader = authHeader?.startsWith("Bearer ") ? authHeader : null;
  const forwardedForHeader = request.headers.get("x-forwarded-for");
  const realIpHeader = request.headers.get("x-real-ip");

  const init: RequestInit = {
    method: request.method,
    headers: {
      ...(forwardedAuthHeader
        ? { authorization: forwardedAuthHeader }
        : CONTROL_API_SECRET
          ? { authorization: `Bearer ${CONTROL_API_SECRET}` }
          : {}),
      ...(apiKeyHeader ? { "x-api-key": apiKeyHeader } : {}),
      ...(contentType ? { "content-type": contentType } : {}),
      ...(forwardedForHeader ? { "x-forwarded-for": forwardedForHeader } : {}),
      ...(realIpHeader ? { "x-real-ip": realIpHeader } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.text();
  }

  const response = await fetch(url, init);

  const responseContentType = response.headers.get("content-type");
  const isJsonResponse = responseContentType?.includes("application/json") ?? false;

  if (!response.ok && isJsonResponse) {
    const errorText = await response.text();
    return new Response(errorText, {
      status: response.status,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      ...(isJsonResponse ? { "content-type": "application/json" } : {}),
    },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}
