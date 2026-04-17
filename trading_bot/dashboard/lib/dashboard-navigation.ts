import type { Route } from "next";
import { Activity, FlaskConical, Settings2, Sparkles } from "lucide-react";
import { discoveryLabRoutes, operationalDeskRoutes } from "@/lib/dashboard-routes";

export type DashboardNavItem = {
  id: string;
  href: Route;
  label: string;
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
    label: "Control",
    icon: Activity,
    items: [
      {
        id: "desk",
        href: operationalDeskRoutes.overview,
        label: "Desk",
        icon: Activity,
        matchPrefixes: [operationalDeskRoutes.overview, operationalDeskRoutes.root, "/"],
      },
      {
        id: "lifecycle",
        href: operationalDeskRoutes.trading,
        label: "Lifecycle",
        icon: Sparkles,
        matchPrefixes: [operationalDeskRoutes.trading, "/trading", "/candidates", "/positions"],
      },
      {
        id: "settings",
        href: operationalDeskRoutes.settings,
        label: "Settings",
        icon: Settings2,
        matchPrefixes: [operationalDeskRoutes.settings, "/settings"],
      },
    ],
  },
  {
    id: "lab",
    label: "Lab",
    icon: FlaskConical,
    items: [
      {
        id: "lab",
        href: discoveryLabRoutes.overview,
        label: "Lab",
        icon: FlaskConical,
        matchPrefixes: [discoveryLabRoutes.overview, discoveryLabRoutes.root],
      },
      {
        id: "studio",
        href: discoveryLabRoutes.studio,
        label: "Studio",
        icon: FlaskConical,
        matchPrefixes: [discoveryLabRoutes.studio],
      },
      {
        id: "results",
        href: discoveryLabRoutes.results,
        label: "Results",
        icon: Activity,
        matchPrefixes: [discoveryLabRoutes.results],
      },
    ],
  },
];

export const dashboardNavItems = dashboardNavGroups.flatMap((group) => group.items);

export function matchesDashboardRoute(pathname: string, item: DashboardNavItem) {
  return item.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
