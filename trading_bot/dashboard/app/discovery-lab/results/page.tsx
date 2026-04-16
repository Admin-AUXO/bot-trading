import { DiscoveryLabSectionPage } from "@/components/discovery-lab-section-page";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabResultsPage() {
  return <DiscoveryLabSectionPage requestedSection="results" />;
}
