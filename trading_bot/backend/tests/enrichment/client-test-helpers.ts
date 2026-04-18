import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type HttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function loadFixture(name: string): unknown {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.join(here, "fixtures", `${name}.json`);
  return JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
}

export function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export function createMockHttpClient(status: number, payload: unknown): HttpClient {
  return async () => createJsonResponse(status, payload);
}

