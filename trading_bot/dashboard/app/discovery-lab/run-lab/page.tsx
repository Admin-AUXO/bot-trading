import { DiscoveryLabSectionPage } from "@/components/discovery-lab-section-page";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabRunLabPage() {
  return <DiscoveryLabSectionPage requestedSection="run-lab" />;
}
