import { SettingsClient } from "@/components/settings-client";
import { serverFetch } from "@/lib/api";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { SettingsControlState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await serverFetch<SettingsControlState>("/api/settings/control");
  const grafanaHref = buildGrafanaDashboardLink("config");
  return <SettingsClient initial={settings} grafanaHref={grafanaHref} />;
}
