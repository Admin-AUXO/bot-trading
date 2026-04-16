import { SettingsClient } from "@/components/settings-client";
import { serverFetch } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { SettingsControlState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OperationalDeskSettingsPage() {
  const settings = await serverFetch<SettingsControlState>("/api/settings/control");
  const grafanaHref = buildGrafanaDashboardLink("config");

  return (
    <SettingsClient
      initial={settings}
      grafanaHref={grafanaHref}
      sectionIds={["capital", "advanced"]}
      header={{
        eyebrow: "Operational desk",
        title: "Runtime controls",
        description: "Capital, cadence, and promotion controls for the live desk.",
      }}
      contextLink={{
        href: discoveryLabRoutes.config,
        label: "Discovery config",
      }}
      strategyLinkHref={discoveryLabRoutes.results}
      saveBarLabel="Save, dry run, then promote the desk-facing runtime controls."
      emptySectionTitle="No operational settings in this view"
      emptySectionDetail="This surface only carries the capital and advanced runtime controls."
    />
  );
}
