import { DashboardClient } from "@/components/dashboard-client";
import { serverFetch } from "@/lib/api";
import type { StatusPayload, ViewRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [status, funnel, providerDaily, positionPerformance] = await Promise.all([
    serverFetch<StatusPayload>("/api/status"),
    serverFetch<ViewRow[]>("/api/views/v_candidate_funnel_daily"),
    serverFetch<ViewRow[]>("/api/views/v_api_provider_daily"),
    serverFetch<ViewRow[]>("/api/views/v_position_performance"),
  ]);

  return (
    <DashboardClient
      initialStatus={status}
      initialFunnel={funnel}
      initialProviderDaily={providerDaily}
      initialPositionPerformance={positionPerformance}
    />
  );
}
