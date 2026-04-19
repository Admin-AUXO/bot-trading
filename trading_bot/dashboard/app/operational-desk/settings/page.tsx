import { SettingsClient } from "@/components/settings-client";
import { serverFetch } from "@/lib/server-api";
import { workbenchRoutes } from "@/lib/dashboard-routes";
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
        description: "Change mode, capital, and timing here. Save only when you mean it.",
      }}
      contextLink={{
        href: workbenchRoutes.editor,
        label: "Open workbench editor",
      }}
      strategyLinkHref={workbenchRoutes.sandbox}
      saveBarLabel="Apply runtime changes directly from this page."
      emptySectionTitle="No operational settings in this view"
      emptySectionDetail="This surface only carries the capital and advanced runtime controls."
    />
  );
}
