import { DiscoveryLabClient } from "@/components/discovery-lab-client";
import { serverFetch } from "@/lib/api";
import type { DiscoveryLabCatalog, DiscoveryLabRuntimeSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabStudioPage() {
  const [catalog, runtimeSnapshot] = await Promise.all([
    serverFetch<DiscoveryLabCatalog>("/api/operator/discovery-lab/catalog"),
    serverFetch<DiscoveryLabRuntimeSnapshot>("/api/status"),
  ]);

  return (
    <DiscoveryLabClient
      initialCatalog={catalog}
      initialRuntimeSnapshot={runtimeSnapshot}
    />
  );
}
