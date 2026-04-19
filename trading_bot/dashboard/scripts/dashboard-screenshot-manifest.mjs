const DEFAULT_API_URL = process.env.API_URL ?? "http://127.0.0.1:3101";

const STATIC_ROUTES = [
  { name: "desk", path: "/operational-desk/overview" },
  { name: "trading", path: "/operational-desk/trading" },
  { name: "settings", path: "/operational-desk/settings" },
  { name: "packs", path: "/workbench/packs" },
  { name: "editor", path: "/workbench/editor" },
  { name: "sandbox", path: "/workbench/sandbox" },
  { name: "sessions", path: "/workbench/sessions" },
  { name: "trending", path: "/market/trending" },
  { name: "watchlist", path: "/market/watchlist" },
];

export async function buildDashboardScreenshotManifest(options = {}) {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const routes = [...STATIC_ROUTES];

  const candidateId = await resolveCandidateId(apiUrl);
  if (candidateId) {
    routes.push({ name: "candidate-detail", path: `/candidates/${candidateId}` });
  }

  const positionId = await resolvePositionId(apiUrl);
  if (positionId) {
    routes.push({ name: "position-detail", path: `/positions/${positionId}` });
  }

  return {
    generatedAt: new Date().toISOString(),
    apiUrl,
    routes,
  };
}

async function resolveCandidateId(apiUrl) {
  for (const bucket of ["ready", "risk", "provider", "data"]) {
    const payload = await tryFetchJson(`${apiUrl}/api/operator/candidates?bucket=${bucket}`);
    const id = payload?.rows?.[0]?.id;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }
  return null;
}

async function resolvePositionId(apiUrl) {
  for (const book of ["open", "closed"]) {
    const payload = await tryFetchJson(`${apiUrl}/api/operator/positions?book=${book}`);
    const id = payload?.rows?.[0]?.id;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }
  return null;
}

async function tryFetchJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await buildDashboardScreenshotManifest();
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
