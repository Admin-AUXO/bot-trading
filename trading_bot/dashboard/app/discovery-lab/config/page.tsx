import { SettingsClient } from "@/components/settings-client";
import { serverFetch } from "@/lib/server-api";
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
      sectionIds={["strategy", "entry", "exit"]}
      header={{
        eyebrow: "Discovery lab",
        title: "Live handoff config",
        description: "Only the discovery-owned live knobs. Pack editing stays in studio.",
      }}
      contextLink={{
        href: "/discovery-lab/studio",
        label: "Back to studio",
      }}
      strategyLinkHref="/discovery-lab/results"
      saveBarLabel="Apply live handoff settings directly."
      emptySectionTitle="No discovery settings in this view"
      emptySectionDetail="Studio owns pack editing. This page only carries live handoff settings."
      editorMode="hot-discovery"
    />
  );
}
