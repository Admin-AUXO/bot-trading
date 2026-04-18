export const operationalDeskRoutes = {
  root: "/operational-desk",
  overview: "/operational-desk/overview",
  trading: "/operational-desk/trading",
  settings: "/operational-desk/settings",
} as const;

export const discoveryLabRoutes = {
  root: "/discovery-lab",
  overview: "/discovery-lab/overview",
  marketStats: "/discovery-lab/market-stats",
  studio: "/discovery-lab/studio",
  runLab: "/discovery-lab/run-lab",
  results: "/discovery-lab/results",
  strategyIdeas: "/discovery-lab/strategy-ideas",
  config: "/discovery-lab/config",
} as const;

export const workbenchRoutes = {
  root: "/workbench",
  packs: "/workbench/packs",
  editor: "/workbench/editor",
  editorByIdPrefix: "/workbench/editor",
  sandbox: "/workbench/sandbox",
  sandboxByRunPrefix: "/workbench/sandbox",
  grader: "/workbench/grader",
  graderByRunPrefix: "/workbench/grader",
  sessions: "/workbench/sessions",
} as const;

export const marketRoutes = {
  root: "/market",
  trending: "/market/trending",
  tokenByMintPrefix: "/market/token",
  watchlist: "/market/watchlist",
} as const;
