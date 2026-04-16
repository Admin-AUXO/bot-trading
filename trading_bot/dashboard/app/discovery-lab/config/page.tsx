import { SettingsClient } from "@/components/settings-client";
import { serverFetch } from "@/lib/api";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { SettingsControlState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabConfigPage() {
  const settings = await serverFetch<SettingsControlState>("/api/settings/control");
  const grafanaHref = buildGrafanaDashboardLink("config");

  return (
    <SettingsClient
      initial={settings}
      grafanaHref={grafanaHref}
      sectionIds={["strategy", "entry", "exit", "research"]}
      header={{
        eyebrow: "Discovery lab",
        title: "Config and promotion",
        description: "Discovery-owned strategy, filters, exits, and research caps with the same review workflow.",
      }}
      contextLink={{
        href: operationalDeskRoutes.settings,
        label: "Operational settings",
      }}
      strategyLinkHref="/discovery-lab/results"
      saveBarLabel="Save, dry run, then promote the lab-derived configuration."
      emptySectionTitle="No discovery settings in this view"
      emptySectionDetail="This surface only carries the discovery-owned config groups."
    />
  );
}
