import { DiscoveryLabSectionPage } from "@/components/discovery-lab-section-page";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabStudioPage() {
  return <DiscoveryLabSectionPage requestedSection="studio" />;
}
