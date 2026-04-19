export const operationalDeskRoutes = {
  root: "/operational-desk",
  overview: "/operational-desk/overview",
  trading: "/operational-desk/trading",
  settings: "/operational-desk/settings",
} as const;

export const workbenchRoutes = {
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
  trending: "/market/trending",
  tokenByMintPrefix: "/market/token",
  watchlist: "/market/watchlist",
} as const;
