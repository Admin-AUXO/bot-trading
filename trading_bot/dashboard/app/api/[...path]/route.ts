import { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";
const CONTROL_SECRET = process.env.CONTROL_SECRET ?? process.env.CONTROL_API_SECRET;

async function proxy(request: NextRequest, path: string[]) {
  const url = new URL(`${API_URL}/api/${path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const init: RequestInit = {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      ...(CONTROL_SECRET && !["GET", "HEAD"].includes(request.method) ? { "x-control-secret": CONTROL_SECRET } : {}),
    },
    cache: "no-store",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.text();
  }

  const response = await fetch(url, init);
  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
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
