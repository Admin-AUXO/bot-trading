export interface DashboardPageMeta {
  title: string;
  description: string;
}

export const DASHBOARD_PAGE_META: Record<string, DashboardPageMeta> = {
  "/": {
    title: "Overview",
    description: "Runtime capital, forced exits, deployment, and the next thing that can hurt you.",
  },
  "/positions": {
    title: "Positions",
    description: "Open risk, close history, and the queue of trades the bot could not take.",
  },
  "/trades": {
    title: "Trades",
    description: "Fill tape, signal decisions, and whether execution is paying for itself.",
  },
  "/analytics": {
    title: "Analytics",
    description: "Edge quality, execution drag, regime fit, and where the system leaks alpha.",
  },
  "/quota": {
    title: "API Quota",
    description: "Provider runway, endpoint concentration, and where quota starts steering runtime.",
  },
  "/settings": {
    title: "Settings",
    description: "Command surface, operator access, live guardrails, and profile routing.",
  },
};

export function getDashboardPageMeta(pathname: string): DashboardPageMeta {
  return DASHBOARD_PAGE_META[pathname] ?? {
    title: "Dashboard",
    description: "Operational view of the trading system.",
  };
}
