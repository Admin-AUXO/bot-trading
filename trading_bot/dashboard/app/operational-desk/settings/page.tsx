import { SettingsClient } from "@/components/settings-client";
import { serverFetch } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { BotSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OperationalDeskSettingsPage() {
  const settings = await serverFetch<BotSettings>("/api/settings");
  const grafanaHref = buildGrafanaDashboardLink("config");

  return (
    <SettingsClient
      initial={settings}
      grafanaHref={grafanaHref}
      sectionIds={["capital", "advanced"]}
      header={{
        eyebrow: "Operational desk",
        title: "Runtime controls",
        description: "Direct-edit controls for live mode, capital, and cadence.",
      }}
      contextLink={{
        href: discoveryLabRoutes.config,
        label: "Discovery config",
      }}
      strategyLinkHref={discoveryLabRoutes.results}
      saveBarLabel="Apply desk-facing runtime controls directly."
      emptySectionTitle="No operational settings in this view"
      emptySectionDetail="This surface only carries the capital and advanced runtime controls."
    />
  );
}
