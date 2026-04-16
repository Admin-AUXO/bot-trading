import { SettingsClient } from "@/components/settings-client";
import { serverFetch } from "@/lib/api";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { BotSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabConfigPage() {
  const settings = await serverFetch<BotSettings>("/api/settings");
  const grafanaHref = buildGrafanaDashboardLink("config");

  return (
    <SettingsClient
      initial={settings}
      grafanaHref={grafanaHref}
      sectionIds={["strategy", "entry", "exit", "advanced"]}
      header={{
        eyebrow: "Discovery lab",
        title: "Live setup",
        description: "Lean direct-edit surface for pump-first discovery, fast evaluations, and short live sessions.",
      }}
      contextLink={{
        href: operationalDeskRoutes.settings,
        label: "Operational settings",
      }}
      strategyLinkHref="/discovery-lab/results"
      saveBarLabel="Apply discovery-owned settings directly."
      emptySectionTitle="No discovery settings in this view"
      emptySectionDetail="This surface only carries the discovery-owned config groups."
      editorMode="hot-discovery"
    />
  );
}
