import type { Route } from "next";
import { Activity, FlaskConical, LineChart, Radar, Settings2, SlidersHorizontal, Sparkles } from "lucide-react";
import { discoveryLabRoutes, marketRoutes, operationalDeskRoutes, workbenchRoutes } from "@/lib/dashboard-routes";

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
    id: "workbench",
    label: "Strategy workbench",
    icon: FlaskConical,
    items: [
      {
        id: "packs",
        href: workbenchRoutes.packs,
        label: "Packs",
        detail: "Pack library",
        icon: FlaskConical,
        matchPrefixes: [workbenchRoutes.packs, workbenchRoutes.root, discoveryLabRoutes.studio, discoveryLabRoutes.overview, discoveryLabRoutes.root],
      },
      {
        id: "editor",
        href: workbenchRoutes.editor,
        label: "Editor",
        detail: "Edit and tune packs",
        icon: SlidersHorizontal,
        matchPrefixes: [workbenchRoutes.editor, workbenchRoutes.editorByIdPrefix],
      },
      {
        id: "sandbox",
        href: workbenchRoutes.sandbox,
        label: "Sandbox",
        detail: "Runs and outcomes",
        icon: Activity,
        matchPrefixes: [workbenchRoutes.sandbox, workbenchRoutes.sandboxByRunPrefix, discoveryLabRoutes.results, discoveryLabRoutes.runLab],
      },
      {
        id: "grader",
        href: workbenchRoutes.grader,
        label: "Grader",
        detail: "Suggestions and review",
        icon: LineChart,
        matchPrefixes: [workbenchRoutes.grader, workbenchRoutes.graderByRunPrefix],
      },
      {
        id: "sessions",
        href: workbenchRoutes.sessions,
        label: "Sessions",
        detail: "Runtime session controls",
        icon: Settings2,
        matchPrefixes: [workbenchRoutes.sessions],
      },
    ],
  },
  {
    id: "market",
    label: "Market intel",
    icon: LineChart,
    items: [
      {
        id: "trending",
        href: marketRoutes.trending,
        label: "Trending",
        detail: "Pulse and mint lookup",
        icon: LineChart,
        matchPrefixes: [marketRoutes.trending, marketRoutes.root, marketRoutes.tokenByMintPrefix, discoveryLabRoutes.marketStats],
      },
      {
        id: "watchlist",
        href: marketRoutes.watchlist,
        label: "Watchlist",
        detail: "Pinned token focus",
        icon: Sparkles,
        matchPrefixes: [marketRoutes.watchlist],
      },
    ],
  },
];

export const dashboardNavItems = dashboardNavGroups.flatMap((group) => group.items);

export function matchesDashboardRoute(pathname: string, item: DashboardNavItem) {
  return item.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
