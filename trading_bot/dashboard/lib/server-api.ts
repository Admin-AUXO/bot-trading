import "server-only";

const API_URL = (process.env.API_URL ?? "http://127.0.0.1:3101").trim().replace(/\/$/, "");

export async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    let message = `${path} failed with ${response.status}`;
    try {
      const payload = await response.json() as { error?: string };
      if (typeof payload.error === "string" && payload.error.trim().length > 0) {
        message = payload.error;
      }
    } catch {
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
