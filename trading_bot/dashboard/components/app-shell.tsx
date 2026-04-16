"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import {
  Activity,
  Command,
  FlaskConical,
  GitPullRequestArrow,
  PanelLeftClose,
  PanelLeftOpen,
  PauseCircle,
  PlayCircle,
  Radar,
  RefreshCcw,
  Search,
  Settings2,
} from "lucide-react";
import { fetchJson } from "@/lib/api";
import { formatInteger, formatMinutesAgo } from "@/lib/format";
import type { ActionResponse, DeskShellPayload } from "@/lib/types";
import { StatusPill } from "@/components/dashboard-primitives";
import { PinnedItemsProvider, PinnedItemsSidebar } from "@/components/pinned-items";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SIDEBAR_STORAGE_KEY = "graduation-control-sidebar-collapsed";

type NavItem = {
  id: string;
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefixes: string[];
  countKey?: "trading";
};

type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

type SidebarContext = {
  eyebrow: string;
  title: string;
  detail: string;
  links?: Array<{ href: string; label: string; badge?: string | null }>;
  notes?: string[];
};

type CommandItem = {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  type: "Route" | "Action";
  run: () => void;
};

const navGroups: NavGroup[] = [
  {
    id: "operational-desk",
    label: "Operational desk",
    icon: Activity,
    items: [
      {
        id: "operational-overview",
        href: "/operational-desk/overview" as Route,
        label: "Overview",
        icon: Activity,
        matchPrefixes: ["/operational-desk/overview", "/"],
      },
      {
        id: "operational-trading",
        href: "/operational-desk/trading" as Route,
        label: "Trading",
        icon: GitPullRequestArrow,
        matchPrefixes: ["/operational-desk/trading", "/trading", "/candidates", "/positions"],
        countKey: "trading",
      },
      {
        id: "operational-settings",
        href: "/operational-desk/settings" as Route,
        label: "Settings",
        icon: Settings2,
        matchPrefixes: ["/operational-desk/settings", "/settings"],
      },
    ],
  },
  {
    id: "discovery-lab",
    label: "Discovery lab",
    icon: FlaskConical,
    items: [
      {
        id: "discovery-overview",
        href: "/discovery-lab/overview" as Route,
        label: "Overview",
        icon: Radar,
        matchPrefixes: ["/discovery-lab/overview"],
      },
      {
        id: "discovery-studio",
        href: "/discovery-lab/studio" as Route,
        label: "Studio",
        icon: FlaskConical,
        matchPrefixes: ["/discovery-lab/studio"],
      },
      {
        id: "discovery-run-lab",
        href: "/discovery-lab/run-lab" as Route,
        label: "Run lab",
        icon: PlayCircle,
        matchPrefixes: ["/discovery-lab/run-lab"],
      },
      {
        id: "discovery-results",
        href: "/discovery-lab/results" as Route,
        label: "Results",
        icon: Search,
        matchPrefixes: ["/discovery-lab/results", "/discovery-lab"],
      },
      {
        id: "discovery-config",
        href: "/discovery-lab/config" as Route,
        label: "Config",
        icon: Settings2,
        matchPrefixes: ["/discovery-lab/config"],
      },
    ],
  },
];

const navItems = navGroups.flatMap((group) => group.items);

const actionEndpoint: Record<DeskShellPayload["availableActions"][number]["id"], string> = {
  pause: "/control/pause",
  resume: "/control/resume",
  "discover-now": "/control/discover-now",
  "evaluate-now": "/control/evaluate-now",
  "exit-check-now": "/control/exit-check-now",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const [shell, setShell] = useState<DeskShellPayload | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const currentPath = pathname ?? "/";
  const sidebarContext = buildSidebarContext(currentPath, shell);
  const liveArmAction = (shell?.availableActions ?? []).find((action) => isLiveArmAction(action)) ?? null;

  const refreshShell = useEffectEvent(async () => {
    try {
      const next = await fetchJson<DeskShellPayload>("/desk/shell");
      setShell(next);
      setShellError(null);
    } catch (error) {
      setShellError(error instanceof Error ? error.message : "shell refresh failed");
    }
  });

  useEffect(() => {
    void refreshShell();
    const timer = window.setInterval(() => void refreshShell(), 15_000);
    return () => window.clearInterval(timer);
  }, [refreshShell]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    setSidebarCollapsed(saved === "1");
    setSidebarReady(true);
  }, []);

  useEffect(() => {
    if (!sidebarReady) {
      return;
    }
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed, sidebarReady]);

  useEffect(() => {
    const node = headerRef.current;
    if (!node) {
      return;
    }

    const applyHeaderHeight = () => {
      document.documentElement.style.setProperty("--shell-header-height", `${node.offsetHeight}px`);
    };

    applyHeaderHeight();
    const observer = new ResizeObserver(() => applyHeaderHeight());
    observer.observe(node);
    window.addEventListener("resize", applyHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyHeaderHeight);
    };
  }, [shell?.availableActions.length, shell?.health, shell?.lastSyncAt, shell?.mode, shell?.primaryBlocker?.label, shellError, actionError]);

  const runAction = (actionId: DeskShellPayload["availableActions"][number]["id"], confirmation?: string) => {
    if (confirmation && !window.confirm(confirmation)) {
      return;
    }

    startTransition(async () => {
      try {
        const body = actionId === "pause" ? { reason: "paused from control desk" } : undefined;
        const response = await fetchJson<ActionResponse>(actionEndpoint[actionId], {
          method: "POST",
          body: body ? JSON.stringify(body) : undefined,
        });
        setShell(response.shell);
        setActionError(null);
        window.dispatchEvent(new CustomEvent("desk-refresh"));
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "desk action failed");
      }
    });
  };

  const commandItems: CommandItem[] = [
    ...navItems.map((item) => {
      const groupLabel = navGroups.find((group) => group.items.some((candidate) => candidate.id === item.id))?.label;
      return {
        id: item.href,
        label: groupLabel ? `${groupLabel} / ${item.label}` : item.label,
        hint: `Open ${item.href}`,
        icon: item.icon,
        type: "Route" as const,
        run: () => router.push(item.href),
      };
    }),
    ...(shell?.availableActions ?? [])
      .filter((action) => action.enabled)
      .map((action) => ({
        id: action.id,
        label: action.label,
        hint: isLiveArmAction(action)
          ? "Start full automated live bot"
          : action.id === "pause" || action.id === "resume"
            ? "Runtime control"
            : "Operator action",
        icon: action.id === "pause" ? PauseCircle : action.id === "resume" ? PlayCircle : RefreshCcw,
        type: "Action" as const,
        run: () => runAction(action.id, action.confirmation),
      })),
  ].filter((item) => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return true;
    return `${item.label} ${item.hint}`.toLowerCase().includes(query);
  });
  const routeCommandItems = commandItems.filter((item) => item.type === "Route");
  const actionCommandItems = commandItems.filter((item) => item.type === "Action");

  useEffect(() => {
    if (!commandOpen) {
      setCommandQuery("");
      setSelectedCommandIndex(0);
      return;
    }

    commandInputRef.current?.focus();
  }, [commandOpen]);

  useEffect(() => {
    setSelectedCommandIndex((index) => Math.min(index, Math.max(commandItems.length - 1, 0)));
  }, [commandItems.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }

      if (!commandOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setCommandOpen(false);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedCommandIndex((index) => Math.min(index + 1, Math.max(commandItems.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedCommandIndex((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        const item = commandItems[selectedCommandIndex];
        if (!item) return;
        event.preventDefault();
        item.run();
        setCommandOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandItems, commandOpen, selectedCommandIndex]);

  if (!mounted) {
    return (
      <PinnedItemsProvider>
        <div className="min-h-screen overflow-x-hidden bg-bg-primary">
          <main className="overflow-x-hidden px-4 py-3 lg:px-6 lg:py-4">
            <div className="mx-auto w-full max-w-[1680px]">{children}</div>
          </main>
        </div>
      </PinnedItemsProvider>
    );
  }

  return (
    <Tooltip.Provider delayDuration={120}>
      <PinnedItemsProvider>
        <div className="min-h-screen overflow-x-hidden bg-bg-primary">
          <aside
            className={clsx(
              "fixed inset-y-0 left-0 hidden border-r border-bg-border/80 bg-bg-secondary transition-[width] duration-200 lg:flex lg:flex-col",
              sidebarCollapsed ? "w-[6.75rem]" : "w-[19.5rem]",
            )}
          >
            <div className="border-b border-bg-border px-3 py-3">
              <div className={clsx("flex items-center gap-3", sidebarCollapsed ? "justify-center" : "justify-between")}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-xl border border-[rgba(163,230,53,0.2)] bg-[var(--panel-raised)] p-2 text-accent">
                    <Radar className="h-5 w-5" />
                  </div>
                  {!sidebarCollapsed ? (
                    <div className="min-w-0">
                      <div className="font-display text-sm font-semibold tracking-[0.2em] text-text-primary">GRADUATION CONTROL</div>
                      <div className="text-[11px] text-text-muted">Operator desk</div>
                    </div>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  className="h-10 w-10 bg-[#101012]"
                  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
              </div>

              {sidebarCollapsed ? (
                <div className="mt-3 space-y-2">
                  <div className="flex justify-center">
                    <StatusPill value={shell?.health ?? "waiting"} />
                  </div>
                  <div className="grid gap-2">
                    <CompactShellMetric label="Mode" value={shortMode(shell?.mode)} />
                    <CompactShellMetric
                      label="Open"
                      value={shell ? formatInteger(shell.statusSummary.openPositions) : "—"}
                    />
                    <CompactShellMetric label="Sync" value={shell ? formatMinutesAgo(shell.lastSyncAt) : "—"} />
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2.5 rounded-[16px] border border-bg-border bg-[var(--panel-raised)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="section-kicker">Shell</div>
                      <div className="mt-1.5 text-sm font-semibold text-text-primary">
                        {shell?.primaryBlocker?.label ?? "Desk clear"}
                      </div>
                    </div>
                    <StatusPill value={shell?.health ?? "waiting"} />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-xs text-text-secondary">
                    <ShellMetric label="Mode" value={shortMode(shell?.mode)} />
                    <ShellMetric
                      label="Open"
                      value={shell ? `${formatInteger(shell.statusSummary.openPositions)}/${formatInteger(shell.statusSummary.maxOpenPositions)}` : "—"}
                    />
                    <ShellMetric label="Queued" value={shell ? formatInteger(shell.statusSummary.queuedCandidates) : "—"} />
                    <ShellMetric label="Sync" value={shell ? formatMinutesAgo(shell.lastSyncAt) : "—"} />
                  </div>
                </div>
              )}
            </div>

            <nav className={clsx("space-y-4 py-3", sidebarCollapsed ? "px-2.5" : "px-3")}>
              {navGroups.map((group) => (
                <div key={group.id} className="space-y-1.5">
                  {!sidebarCollapsed ? (
                    <div className="flex items-center gap-2 px-1 pt-1">
                      <group.icon className="h-3.5 w-3.5 text-text-muted" />
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{group.label}</div>
                    </div>
                  ) : null}
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = matchesRoute(currentPath, item);
                    const count = routeCount(shell, item);
                    const link = (
                      <Link
                        key={item.id}
                        href={item.href}
                        title={`Open ${group.label} ${item.label}`}
                        className={clsx(
                          "relative flex items-center rounded-[14px] border transition",
                          sidebarCollapsed ? "justify-center px-0 py-3" : "justify-between px-3 py-2.5",
                          active
                            ? "border-[rgba(163,230,53,0.3)] bg-[#121511] text-text-primary"
                            : "border-bg-border/30 text-text-secondary hover:border-bg-border hover:bg-[#141417] hover:text-text-primary",
                        )}
                      >
                        <div className={clsx("flex items-center", sidebarCollapsed ? "justify-center" : "gap-3")}>
                          <Icon className="h-4 w-4" />
                          {!sidebarCollapsed ? <span className="text-sm font-medium">{item.label}</span> : null}
                        </div>

                        {sidebarCollapsed ? (
                          <>
                            {count ? (
                              <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full border border-bg-border bg-[#151517] px-1 text-center text-[9px] font-semibold text-text-primary">
                                {count}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            {count ? <Badge className="px-2.5 py-1 normal-case">{count}</Badge> : null}
                            {active ? <div className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
                          </div>
                        )}
                      </Link>
                    );

                    if (!sidebarCollapsed) {
                      return link;
                    }

                    return (
                      <Tooltip.Root key={item.id}>
                        <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            side="right"
                            sideOffset={12}
                            className="rounded-[12px] border border-bg-border bg-[#111214] px-3 py-2 text-xs font-medium text-text-primary shadow-2xl"
                          >
                            {group.label} / {item.label}
                            <Tooltip.Arrow className="fill-[#111214]" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className={clsx("min-h-0 flex-1 overflow-y-auto pb-4", sidebarCollapsed ? "px-3" : "px-3.5")}>
              {!sidebarCollapsed ? <PinnedItemsSidebar hideWhenEmpty /> : null}
            </div>
          </aside>

          <div
            className={clsx(
              "min-h-screen transition-[padding] duration-200",
              sidebarCollapsed ? "lg:pl-[6.75rem]" : "lg:pl-[19.5rem]",
            )}
          >
            <header ref={headerRef} className="sticky top-0 z-30 border-b border-bg-border/80 bg-bg-secondary/95 backdrop-blur-sm">
              <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-2 px-4 py-2 lg:px-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="section-kicker text-accent">{sidebarContext.eyebrow}</span>
                    <StatusPill value={shell?.mode ?? "waiting"} />
                    <StatusPill value={shell?.health ?? "waiting"} />
                    <Badge className="normal-case">Sync {shell ? formatMinutesAgo(shell.lastSyncAt) : "—"}</Badge>
                    {shell?.primaryBlocker?.label ? <Badge className="normal-case">{shell.primaryBlocker.label}</Badge> : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{sidebarContext.title}</span>
                    {shellError ? <Badge variant="danger" className="normal-case tracking-normal">{shellError}</Badge> : null}
                    {actionError ? <Badge variant="danger" className="normal-case tracking-normal">{actionError}</Badge> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => setCommandOpen(true)}
                    variant="ghost"
                    size="default"
                    title="Open command launcher"
                  >
                    <Command className="h-4 w-4" />
                    Command
                    <Badge className="px-2 py-1 tracking-normal">⌘K</Badge>
                  </Button>
                  <Button
                    onClick={() => refreshShell()}
                    variant="ghost"
                    title="Refresh shell status"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Refresh
                  </Button>
                  {liveArmAction ? (
                    <Button
                      onClick={() => runAction(liveArmAction.id, liveArmAction.confirmation)}
                      disabled={!liveArmAction.enabled || isPending}
                      title={liveArmAction.label}
                      variant="default"
                    >
                      <PlayCircle className="h-4 w-4" />
                      {liveArmAction.label}
                    </Button>
                  ) : null}
                  {(shell?.availableActions ?? []).filter((action) => !isLiveArmAction(action)).map((action) => (
                    <Button
                      key={action.id}
                      onClick={() => runAction(action.id, action.confirmation)}
                      disabled={!action.enabled || isPending}
                      title={action.label}
                      variant={action.id === "pause" || action.id === "resume" ? "warning" : "secondary"}
                    >
                      <ActionIcon actionId={action.id} />
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </header>

            <main className="overflow-x-hidden px-4 py-3 lg:px-6 lg:py-4">
              <div className="mx-auto mb-3 overflow-auto pb-1 lg:hidden">
                <div className="flex min-w-max gap-2">
                  {navGroups.map((group) =>
                    group.items.map((item) => {
                      const Icon = item.icon;
                      const active = matchesRoute(currentPath, item);
                      const count = routeCount(shell, item);
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          title={`Open ${group.label} ${item.label}`}
                          className={clsx(
                            "flex min-w-[10rem] items-center gap-3 rounded-[14px] border px-4 py-3 text-sm transition",
                            active
                              ? "border-[rgba(163,230,53,0.3)] bg-[#121511] text-text-primary"
                              : "border-bg-border bg-bg-card text-text-secondary hover:bg-[#151517] hover:text-text-primary",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          <div className="min-w-0">
                            <div>{item.label}</div>
                            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{group.label}</div>
                          </div>
                          {count ? <Badge className="ml-auto px-2.5 py-1 normal-case">{count}</Badge> : null}
                        </Link>
                      );
                    }),
                  )}
                </div>
              </div>

              <div className="mx-auto w-full max-w-[1680px]">{children}</div>
            </main>
          </div>

          {commandOpen ? (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-16" onClick={() => setCommandOpen(false)}>
              <Card className="w-full max-w-2xl rounded-[18px] bg-[var(--surface-modal-strong)]" onClick={(event) => event.stopPropagation()}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Command Launcher</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                <div className="flex items-center gap-3 rounded-[14px] border border-bg-border bg-[#0f0f10] px-4 py-3">
                  <Search className="h-4 w-4 text-text-muted" />
                  <Input
                    ref={commandInputRef}
                    value={commandQuery}
                    onChange={(event) => {
                      setCommandQuery(event.target.value);
                      setSelectedCommandIndex(0);
                    }}
                    placeholder="Jump to a page or run an action"
                    className="h-auto border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <Badge className="px-2 py-1 tracking-normal">Esc</Badge>
                </div>
                {commandItems.length > 0 ? (
                  <div className="max-h-[26rem] space-y-3 overflow-auto pr-1">
                    {routeCommandItems.length > 0 ? (
                      <CommandSection
                        title="Routes"
                        items={routeCommandItems}
                        selectedId={commandItems[selectedCommandIndex]?.id ?? null}
                        onSelectId={(id) => {
                          const nextIndex = commandItems.findIndex((item) => item.id === id);
                          if (nextIndex >= 0) setSelectedCommandIndex(nextIndex);
                        }}
                        onSelectItem={() => setCommandOpen(false)}
                      />
                    ) : null}
                    {routeCommandItems.length > 0 && actionCommandItems.length > 0 ? <div className="h-px bg-bg-border" /> : null}
                    {actionCommandItems.length > 0 ? (
                      <CommandSection
                        title="Actions"
                        items={actionCommandItems}
                        selectedId={commandItems[selectedCommandIndex]?.id ?? null}
                        onSelectId={(id) => {
                          const nextIndex = commandItems.findIndex((item) => item.id === id);
                          if (nextIndex >= 0) setSelectedCommandIndex(nextIndex);
                        }}
                        onSelectItem={() => setCommandOpen(false)}
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-[14px] border border-bg-border bg-[#101012] px-4 py-6 text-sm text-text-secondary">
                    Nothing matches that query.
                  </div>
                )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </PinnedItemsProvider>
    </Tooltip.Provider>
  );
}

function ShellMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-bg-primary/65 px-2.5 py-2">
      <div className="text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">{props.label}</div>
      <div className="mt-1 text-center text-[13px] font-semibold tracking-tight text-text-primary">{props.value}</div>
    </div>
  );
}

function CompactShellMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-[#101012] px-2 py-2 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      <div className="mt-1 text-xs font-semibold tracking-tight text-text-primary">{props.value}</div>
    </div>
  );
}

function CommandSection(props: {
  title: string;
  items: CommandItem[];
  selectedId: string | null;
  onSelectId: (id: string) => void;
  onSelectItem: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{props.title}</div>
      <div className="space-y-1">
        {props.items.map((item) => {
          const Icon = item.icon;
          const isSelected = props.selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => props.onSelectId(item.id)}
              onClick={() => {
                item.run();
                props.onSelectItem();
              }}
              className={clsx(
                "flex w-full items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-left transition",
                isSelected
                  ? "border-[rgba(163,230,53,0.25)] bg-[#11140f]"
                  : "border-bg-border bg-[#101012] hover:border-[rgba(255,255,255,0.12)] hover:bg-[#141417]",
              )}
            >
              <div className="min-w-0 flex items-center gap-2">
                <Icon className={clsx("h-4 w-4 shrink-0", isSelected ? "text-accent" : "text-text-secondary")} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-primary">{item.label}</div>
                  <div className="truncate text-xs text-text-secondary">{item.hint}</div>
                </div>
              </div>
              <Badge className="normal-case tracking-normal">{item.type}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function routeCount(shell: DeskShellPayload | null, item: NavItem) {
  if (!shell) return null;

  switch (item.countKey) {
    case "trading":
      return shell.statusSummary.queuedCandidates > 0 || shell.statusSummary.openPositions > 0
        ? `${formatInteger(shell.statusSummary.queuedCandidates)}/${formatInteger(shell.statusSummary.openPositions)}`
        : null;
    default:
      return null;
  }
}

function matchesRoute(pathname: string, item: NavItem) {
  return item.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function buildSidebarContext(pathname: string, shell: DeskShellPayload | null): SidebarContext {
  const tradingNavItem = navItems.find((item) => item.id === "operational-trading");
  const tradingCount = tradingNavItem ? routeCount(shell, tradingNavItem) : null;

  if (
    pathname === "/operational-desk/trading" ||
    pathname.startsWith("/operational-desk/trading/") ||
    pathname === "/trading" ||
    pathname.startsWith("/trading/")
  ) {
    return {
      eyebrow: "Current page",
      title: "Trading lifecycle",
      detail: "Unified operating surface from intake through open risk and recent outcomes.",
      links: [
        { href: "/operational-desk/trading", label: "Lifecycle board", badge: tradingCount },
        { href: "/operational-desk/trading?bucket=ready", label: "Ready intake" },
        { href: "/operational-desk/trading?book=open", label: "Open positions" },
      ],
    };
  }

  if (pathname === "/candidates" || pathname.startsWith("/candidates/")) {
    if (pathname !== "/candidates") {
      return {
        eyebrow: "Current page",
        title: "Candidate detail",
        detail: "Why it matters, gate state, and stored evidence.",
        links: [
          { href: "/operational-desk/trading", label: "Back to lifecycle", badge: tradingCount },
          { href: "/operational-desk/overview", label: "Desk" },
        ],
      };
    }
    return {
      eyebrow: "Current page",
      title: "Candidate queue",
      detail: "Triage by blocker bucket with URL-backed sort and filter state.",
      links: [
        { href: "/operational-desk/trading?bucket=ready", label: "Ready" },
        { href: "/operational-desk/trading?bucket=risk", label: "Risk" },
        { href: "/operational-desk/trading?bucket=provider", label: "Provider" },
        { href: "/operational-desk/trading?bucket=data", label: "Data" },
      ],
    };
  }

  if (pathname === "/positions" || pathname.startsWith("/positions/")) {
    if (pathname !== "/positions") {
      return {
        eyebrow: "Current page",
        title: "Position detail",
        detail: "Intervention state, execution trace, fills, and snapshots.",
        links: [
          { href: "/operational-desk/trading", label: "Back to lifecycle", badge: tradingCount },
          { href: "/operational-desk/settings", label: "Runtime settings" },
        ],
      };
    }
    return {
      eyebrow: "Current page",
      title: "Position book",
      detail: "Scan open risk first, then review the closed book.",
      links: [
        { href: "/operational-desk/trading?book=open", label: "Open book", badge: tradingCount },
        { href: "/operational-desk/trading?book=closed", label: "Closed book" },
        { href: "/operational-desk/settings", label: "Settings" },
      ],
    };
  }

  if (pathname === "/discovery-lab" || pathname.startsWith("/discovery-lab/")) {
    return {
      eyebrow: "Current page",
      title: "Discovery lab",
      detail: "Results, builder, and run control stay on one workbench.",
      notes: ["Results first", "Pack + strategy edits", "Runs and logs"],
    };
  }

  if (
    pathname === "/operational-desk/settings" ||
    pathname.startsWith("/operational-desk/settings/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  ) {
    return {
      eyebrow: "Current page",
      title: "Settings",
      detail: "Draft, validate, dry run, then promote.",
      notes: ["Draft", "Validate", "Dry run", "Promote"],
    };
  }

  const activeNav = navItems.find((item) => matchesRoute(pathname, item)) ?? null;
  if (activeNav) {
    const activeGroup = navGroups.find((group) => group.items.some((item) => item.id === activeNav.id));
    return {
      eyebrow: activeGroup?.label ?? "Current page",
      title: activeNav.label,
      detail: "Primary operator workspace.",
    };
  }

  return {
    eyebrow: "Current page",
    title: "Control desk",
    detail: "Exposure, queue pressure, and live faults at a glance.",
    links: [
      { href: "/operational-desk/trading", label: "Trading lifecycle", badge: tradingCount },
      { href: "/discovery-lab/results", label: "Discovery lab" },
      { href: "/operational-desk/settings", label: "Settings" },
    ],
  };
}

function shortMode(value?: string | null) {
  if (!value) {
    return "—";
  }
  const normalized = value.toUpperCase();
  if (normalized.includes("DRY")) return "DRY";
  if (normalized.includes("LIVE")) return "LIVE";
  if (normalized.includes("PAPER")) return "PAPR";
  if (normalized.includes("WAIT")) return "WAIT";
  return normalized.replace(/_/g, "").slice(0, 4);
}

function ActionIcon(props: { actionId: DeskShellPayload["availableActions"][number]["id"] }) {
  switch (props.actionId) {
    case "pause":
      return <PauseCircle className="h-4 w-4" />;
    case "resume":
      return <PlayCircle className="h-4 w-4" />;
    default:
      return <RefreshCcw className="h-4 w-4" />;
  }
}

function isLiveArmAction(action: DeskShellPayload["availableActions"][number]) {
  return action.id === "resume" && action.label === "Start Auto Live Bot";
}
