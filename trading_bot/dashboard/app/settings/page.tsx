import { SettingsClient } from "@/components/settings-client";
import { serverFetch } from "@/lib/api";
import type { BotSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await serverFetch<BotSettings>("/api/settings");
  return <SettingsClient initial={settings} />;
}
