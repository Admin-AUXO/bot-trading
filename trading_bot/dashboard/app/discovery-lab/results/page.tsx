import { DiscoveryLabResultsRoute } from "@/components/discovery-lab-results-route";
import { serverFetch } from "@/lib/server-api";
import type {
  DiscoveryLabCatalog,
  DiscoveryLabRunDetail,
  DiscoveryLabRuntimeSnapshot,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabResultsPage({
  searchParams,
}: {
  searchParams?: Promise<{ runId?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedRunId =
    typeof resolvedSearchParams?.runId === "string"
      ? resolvedSearchParams.runId.trim()
      : "";

  const [catalog, runtimeSnapshot] = await Promise.all([
    serverFetch<DiscoveryLabCatalog>("/api/operator/discovery-lab/catalog"),
    serverFetch<DiscoveryLabRuntimeSnapshot>("/api/status"),
  ]);

  const fallbackRunId =
    requestedRunId
    || catalog.activeRun?.id
    || catalog.recentRuns.find((run) => run.status === "COMPLETED")?.id
    || "";

  let initialRunDetail: DiscoveryLabRunDetail | null = null;
  if (fallbackRunId) {
    try {
      initialRunDetail = await serverFetch<DiscoveryLabRunDetail>(
        `/api/operator/discovery-lab/runs/${encodeURIComponent(fallbackRunId)}`,
      );
    } catch {
      initialRunDetail = null;
    }
  }

  return (
    <DiscoveryLabResultsRoute
      initialCatalog={catalog}
      initialRuntimeSnapshot={runtimeSnapshot}
      initialRunDetail={initialRunDetail}
    />
  );
}
