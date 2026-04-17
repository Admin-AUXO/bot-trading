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
  PanelLeftClose,
  PanelLeftOpen,
  PauseCircle,
  PlayCircle,
  Radar,
  RefreshCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import { fetchJson } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
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
};

type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "control",
    label: "Control",
    icon: Activity,
    items: [
      {
        id: "desk",
        href: "/operational-desk/overview" as Route,
        label: "Desk",
        icon: Activity,
        matchPrefixes: ["/operational-desk/overview", "/operational-desk", "/"],
      },
      {
        id: "lifecycle",
        href: "/operational-desk/trading" as Route,
        label: "Lifecycle",
        icon: Sparkles,
        matchPrefixes: ["/operational-desk/trading", "/trading", "/candidates", "/positions"],
      },
      {
        id: "settings",
        href: "/operational-desk/settings" as Route,
        label: "Settings",
        icon: Settings2,
        matchPrefixes: ["/operational-desk/settings", "/settings"],
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
    if (!sidebarReady) return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed, sidebarReady]);

  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;

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
  }, [shell?.availableActions.length, shell?.health, shell?.lastSyncAt, shell?.mode]);

  const runAction = (actionId: DeskShellPayload["availableActions"][number]["id"], confirmation?: string) => {
    if (confirmation && !window.confirm(confirmation)) return;

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

  const commandItems = [
    ...navItems.map((item) => ({
      id: item.href,
      label: item.label,
      hint: item.href,
      icon: item.icon,
      type: "Route" as const,
      run: () => router.push(item.href),
    })),
    ...(shell?.availableActions ?? [])
      .filter((action) => action.enabled)
      .map((action) => ({
        id: action.id,
        label: action.label,
        hint: "Operator action",
        icon: action.id === "pause" ? PauseCircle : action.id === "resume" ? PlayCircle : RefreshCcw,
        type: "Action" as const,
        run: () => runAction(action.id, action.confirmation),
      })),
  ].filter((item) => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return true;
    return `${item.label} ${item.hint}`.toLowerCase().includes(query);
  });

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
          {/* Desktop Sidebar */}
          <aside
            className={clsx(
              "fixed inset-y-0 left-0 hidden border-r border-bg-border/80 bg-bg-secondary transition-[width] duration-200 lg:flex lg:flex-col",
              sidebarCollapsed ? "w-[6.75rem]" : "w-[17rem]",
            )}
          >
            {/* Sidebar Header */}
            <div className="border-b border-bg-border px-3 py-3">
              <div className={clsx("flex items-center gap-3", sidebarCollapsed ? "justify-center" : "justify-between")}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-xl border border-[rgba(163,230,53,0.2)] bg-[var(--panel-raised)] p-2 text-accent">
                    <Radar className="h-5 w-5" />
                  </div>
                  {!sidebarCollapsed ? (
                    <div className="min-w-0">
                      <div className="font-display text-sm font-semibold tracking-[0.2em] text-text-primary">GRADUATION CONTROL</div>
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
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
              </div>

              {/* Shell Status */}
              {!sidebarCollapsed ? (
                <div className="mt-3 space-y-2 rounded-[12px] border border-bg-border bg-[var(--panel-raised)] p-3">
                  <div className="flex items-center gap-2">
                    <StatusPill value={shell?.health ?? "waiting"} />
                    <span className="text-xs text-text-muted">
                      {shell?.primaryBlocker?.label ?? "Desk clear"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-xs text-text-secondary">
                    <ShellMetric label="Mode" value={shortMode(shell?.mode)} />
                    <ShellMetric label="Open" value={shell ? formatInteger(shell.statusSummary.openPositions) : "—"} />
                    <ShellMetric label="Queue" value={shell ? formatInteger(shell.statusSummary.queuedCandidates) : "—"} />
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-col items-center gap-2">
                  <StatusPill value={shell?.health ?? "waiting"} />
                  <CompactShellMetric label="Mode" value={shortMode(shell?.mode)} />
                </div>
              )}
            </div>

            {/* Navigation */}
            <nav className={clsx("space-y-3 py-3", sidebarCollapsed ? "px-2.5" : "px-3")}>
              {navGroups.map((group) => (
                <div key={group.id} className="space-y-1.5">
                  {!sidebarCollapsed ? (
                    <div className="flex items-center gap-2 px-1">
                      <group.icon className="h-3.5 w-3.5 text-text-muted" />
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{group.label}</div>
                    </div>
                  ) : null}
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = matchesRoute(currentPath, item);
                    const link = (
                      <Link
                        key={item.id}
                        href={item.href}
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
                        {active && !sidebarCollapsed ? <div className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
                      </Link>
                    );

                    if (!sidebarCollapsed) return link;

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

          {/* Main Content Area */}
          <div
            className={clsx(
              "min-h-screen transition-[padding] duration-200",
              sidebarCollapsed ? "lg:pl-[6.75rem]" : "lg:pl-[17rem]",
            )}
          >
            {/* Header */}
            <header ref={headerRef} className="sticky top-0 z-30 border-b border-bg-border/80 bg-bg-secondary/95 backdrop-blur-sm">
              <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-2 px-4 py-2 lg:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill value={shell?.mode ?? "waiting"} />
                  <StatusPill value={shell?.health ?? "waiting"} />
                  {shellError ? <Badge variant="danger" className="normal-case">{shellError}</Badge> : null}
                  {actionError ? <Badge variant="danger" className="normal-case">{actionError}</Badge> : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => setCommandOpen(true)} variant="ghost" size="default" title="Command launcher (⌘K)">
                    <Command className="h-4 w-4" />
                    <Badge className="px-2 py-1 tracking-normal">⌘K</Badge>
                  </Button>
                  <Button onClick={() => refreshShell()} variant="ghost" title="Refresh">
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                  {liveArmAction ? (
                    <Button
                      onClick={() => runAction(liveArmAction.id, liveArmAction.confirmation)}
                      disabled={!liveArmAction.enabled || isPending}
                      variant="default"
                    >
                      <PlayCircle className="h-4 w-4" />
                      {liveArmAction.label}
                    </Button>
                  ) : null}
                  {(shell?.availableActions ?? []).filter((a) => !isLiveArmAction(a)).map((action) => (
                    <Button
                      key={action.id}
                      onClick={() => runAction(action.id, action.confirmation)}
                      disabled={!action.enabled || isPending}
                      variant="ghost"
                      size="sm"
                    >
                      {action.id === "pause" ? <PauseCircle className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4" />}
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </header>

            <main className="overflow-x-hidden px-4 py-3 lg:px-6 lg:py-4">
              <div className="mx-auto w-full max-w-[1680px]">{children}</div>
            </main>
          </div>

          {/* Command Palette */}
          {commandOpen ? (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-16" onClick={() => setCommandOpen(false)}>
              <Card className="w-full max-w-xl rounded-[18px] bg-[var(--surface-modal-strong)]" onClick={(e) => e.stopPropagation()}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Command</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 rounded-[14px] border border-bg-border bg-[#0f0f10] px-4 py-3">
                    <Input
                      ref={commandInputRef}
                      value={commandQuery}
                      onChange={(e) => { setCommandQuery(e.target.value); setSelectedCommandIndex(0); }}
                      placeholder="Search commands..."
                      className="h-auto border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                  {commandItems.length > 0 ? (
                    <div className="max-h-80 space-y-1 overflow-auto">
                      {commandItems.map((item, idx) => {
                        const Icon = item.icon;
                        const isSelected = idx === selectedCommandIndex;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onMouseEnter={() => setSelectedCommandIndex(idx)}
                            onClick={() => { item.run(); setCommandOpen(false); }}
                            className={clsx(
                              "flex w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left transition",
                              isSelected ? "border-[rgba(163,230,53,0.25)] bg-[#11140f]" : "border-bg-border bg-[#101012] hover:bg-[#141417]",
                            )}
                          >
                            <Icon className={clsx("h-4 w-4", isSelected ? "text-accent" : "text-text-secondary")} />
                            <span className="flex-1 truncate text-sm text-text-primary">{item.label}</span>
                            <Badge className="normal-case">{item.type}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-sm text-text-muted">No matches</div>
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
    <div className="rounded-[10px] border border-bg-border bg-bg-primary/65 px-2 py-1.5 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-text-muted">{props.label}</div>
      <div className="text-[12px] font-semibold text-text-primary">{props.value}</div>
    </div>
  );
}

function CompactShellMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-bg-border bg-[#101012] px-2 py-1 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-text-muted">{props.label}</div>
      <div className="text-xs font-semibold text-text-primary">{props.value}</div>
    </div>
  );
}

function matchesRoute(pathname: string, item: NavItem) {
  return item.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function shortMode(value?: string | null) {
  if (!value) return "—";
  const normalized = value.toUpperCase();
  if (normalized.includes("DRY")) return "DRY";
  if (normalized.includes("LIVE")) return "LIVE";
  if (normalized.includes("PAPER")) return "PAPR";
  if (normalized.includes("WAIT")) return "WAIT";
  return normalized.replace(/_/g, "").slice(0, 4);
}

function isLiveArmAction(action: DeskShellPayload["availableActions"][number]) {
  return action.id === "resume" && action.label === "Start Auto Live Bot";
}
