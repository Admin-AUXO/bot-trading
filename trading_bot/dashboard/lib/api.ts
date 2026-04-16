const API_PREFIX = "/api";

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? "GET";
  const isReadMethod = method === "GET" || method === "HEAD";
  const headers = new Headers(init?.headers ?? {});
  if (!isReadMethod && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers,
    cache: "no-store",
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

export async function serverFetch<T>(path: string): Promise<T> {
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3101";
  const response = await fetch(`${apiUrl}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}
