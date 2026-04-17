import type { Route } from "next";
import { Activity, FlaskConical, LineChart, Radar, Settings2, SlidersHorizontal, Sparkles } from "lucide-react";
import { discoveryLabRoutes, operationalDeskRoutes } from "@/lib/dashboard-routes";

export type DashboardNavItem = {
  id: string;
  href: Route;
  label: string;
  detail?: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefixes: string[];
};

export type DashboardNavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: DashboardNavItem[];
};

export const dashboardNavGroups: DashboardNavGroup[] = [
  {
    id: "control",
    label: "Operational desk",
    icon: Activity,
    items: [
      {
        id: "desk",
        href: operationalDeskRoutes.overview,
        label: "Overview",
        detail: "Health, blockers, queue",
        icon: Radar,
        matchPrefixes: [operationalDeskRoutes.overview, operationalDeskRoutes.root, "/"],
      },
      {
        id: "lifecycle",
        href: operationalDeskRoutes.trading,
        label: "Trading",
        detail: "Candidates and positions",
        icon: Sparkles,
        matchPrefixes: [operationalDeskRoutes.trading, "/trading", "/candidates", "/positions"],
      },
      {
        id: "settings",
        href: operationalDeskRoutes.settings,
        label: "Settings",
        detail: "Runtime controls",
        icon: Settings2,
        matchPrefixes: [operationalDeskRoutes.settings, "/settings"],
      },
    ],
  },
  {
    id: "lab",
    label: "Discovery lab",
    icon: FlaskConical,
    items: [
      {
        id: "market-stats",
        href: discoveryLabRoutes.marketStats,
        label: "Market",
        detail: "Pulse and mint lookup",
        icon: LineChart,
        matchPrefixes: [discoveryLabRoutes.marketStats],
      },
      {
        id: "studio",
        href: discoveryLabRoutes.studio,
        label: "Studio",
        detail: "Edit packs and run",
        icon: FlaskConical,
        matchPrefixes: [discoveryLabRoutes.studio, discoveryLabRoutes.overview, discoveryLabRoutes.root],
      },
      {
        id: "results",
        href: discoveryLabRoutes.results,
        label: "Results",
        detail: "Runs, review, entries",
        icon: Activity,
        matchPrefixes: [discoveryLabRoutes.results],
      },
      {
        id: "config",
        href: discoveryLabRoutes.config,
        label: "Config",
        detail: "Live handoff controls",
        icon: SlidersHorizontal,
        matchPrefixes: [discoveryLabRoutes.config],
      },
    ],
  },
];

export const dashboardNavItems = dashboardNavGroups.flatMap((group) => group.items);

export function matchesDashboardRoute(pathname: string, item: DashboardNavItem) {
  return item.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
