import { DiscoveryLabStrategyIdeasClient } from "@/components/discovery-lab-strategy-ideas-client";
import { serverFetch } from "@/lib/server-api";
import type { DiscoveryLabStrategySuggestionsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabStrategyIdeasPage() {
  const initialPayload = await serverFetch<DiscoveryLabStrategySuggestionsPayload>("/api/operator/discovery-lab/strategy-suggestions");
  return <DiscoveryLabStrategyIdeasClient initialPayload={initialPayload} />;
}
