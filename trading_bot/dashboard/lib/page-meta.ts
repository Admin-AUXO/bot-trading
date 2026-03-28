export interface DashboardPageMeta {
  title: string;
  description: string;
}

export const DASHBOARD_PAGE_META: Record<string, DashboardPageMeta> = {
  "/": {
    title: "Overview",
    description: "Capital, exposure, regime, and the next decisions that matter.",
  },
  "/positions": {
    title: "Positions",
    description: "Open risk, recent closes, and capacity missed by max-position pressure.",
  },
  "/trades": {
    title: "Trades",
    description: "Execution history, signal flow, and filter-aware trade outcomes.",
  },
  "/analytics": {
    title: "Analytics",
    description: "Strategy expectancy, regime fit, and where the edge is leaking.",
  },
  "/quota": {
    title: "API Quota",
    description: "Provider runway, endpoint spenders, and when quota pressure starts steering the bot.",
  },
  "/settings": {
    title: "Settings",
    description: "Bot controls, operator access, risk guardrails, and active profiles.",
  },
};

export function getDashboardPageMeta(pathname: string): DashboardPageMeta {
  return DASHBOARD_PAGE_META[pathname] ?? {
    title: "Dashboard",
    description: "Operational view of the trading system.",
  };
}
