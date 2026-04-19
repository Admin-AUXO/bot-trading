import type { Route } from "next";
import { Activity, FlaskConical, LineChart, PlayCircle, Radar, Settings2, SlidersHorizontal, Sparkles } from "lucide-react";
import { marketRoutes, operationalDeskRoutes, workbenchRoutes } from "@/lib/dashboard-routes";

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
        detail: "Start here: blockers, queue, live health",
        icon: Radar,
        matchPrefixes: [operationalDeskRoutes.overview, operationalDeskRoutes.root, "/"],
      },
      {
        id: "lifecycle",
        href: operationalDeskRoutes.trading,
        label: "Trading",
        detail: "Triage candidates and manage positions",
        icon: Sparkles,
        matchPrefixes: [operationalDeskRoutes.trading, "/trading", "/candidates", "/positions"],
      },
      {
        id: "settings",
        href: operationalDeskRoutes.settings,
        label: "Settings",
        detail: "Change runtime and capital controls",
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
        detail: "Choose the strategy pack to work on",
        icon: FlaskConical,
        matchPrefixes: [workbenchRoutes.packs],
      },
      {
        id: "editor",
        href: workbenchRoutes.editor,
        label: "Editor",
        detail: "Edit one pack draft and save it cleanly",
        icon: SlidersHorizontal,
        matchPrefixes: [workbenchRoutes.editor, workbenchRoutes.editorByIdPrefix],
      },
      {
        id: "runs",
        href: workbenchRoutes.runs,
        label: "Runs",
        detail: "Review one run, grade it, and move it forward",
        icon: Activity,
        matchPrefixes: [
          workbenchRoutes.runs,
          workbenchRoutes.runsByIdPrefix,
          workbenchRoutes.sandbox,
          workbenchRoutes.sandboxByRunPrefix,
          workbenchRoutes.grader,
          workbenchRoutes.graderByRunPrefix,
        ],
      },
      {
        id: "sessions",
        href: workbenchRoutes.sessions,
        label: "Sessions",
        detail: "Start, pause, stop, or replace deployment",
        icon: PlayCircle,
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
        detail: "Scan market pulse and open one token",
        icon: LineChart,
        matchPrefixes: [marketRoutes.trending, marketRoutes.tokenByMintPrefix],
      },
      {
        id: "watchlist",
        href: marketRoutes.watchlist,
        label: "Watchlist",
        detail: "Recheck pinned tokens without the noise",
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
