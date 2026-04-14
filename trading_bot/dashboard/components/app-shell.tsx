"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import {
  Activity,
  BarChart3,
  CandlestickChart,
  Command,
  CornerDownLeft,
  FlaskConical,
  PanelLeftClose,
  PanelLeftOpen,
  PauseCircle,
  PlayCircle,
  Radar,
  RadioTower,
  RefreshCcw,
  Search,
  Settings2,
} from "lucide-react";
import { fetchJson } from "@/lib/api";
import { formatInteger, formatTimestamp } from "@/lib/format";
import type { ActionResponse, DeskShellPayload } from "@/lib/types";
import { StatusPill } from "@/components/dashboard-primitives";
import { PinnedItemsProvider, PinnedItemsSidebar } from "@/components/pinned-items";

const SIDEBAR_STORAGE_KEY = "graduation-control-sidebar-collapsed";

type NavItem = {
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type SidebarContext = {
  eyebrow: string;
  title: string;
  detail: string;
  links?: Array<{ href: string; label: string; badge?: string | null }>;
  notes?: string[];
};

const nav: NavItem[] = [
  { href: "/", label: "Desk", icon: Activity },
  { href: "/candidates", label: "Candidates", icon: CandlestickChart },
  { href: "/positions", label: "Positions", icon: BarChart3 },
  { href: "/discovery-lab", label: "Discovery Lab", icon: FlaskConical },
  { href: "/telemetry", label: "Telemetry", icon: RadioTower },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

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
  const [isPending, startTransition] = useTransition();
  const currentPath = pathname ?? "/";
  const activeNav = getActiveNav(currentPath);
  const ActiveNavIcon = activeNav.icon;
  const sidebarContext = buildSidebarContext(currentPath, shell);

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

  const commandItems = [
    ...nav.map((item) => ({
      id: item.href,
      label: item.label,
      hint: `Open ${item.label.toLowerCase()}`,
      icon: item.icon,
      type: "Route",
      run: () => router.push(item.href),
    })),
    ...(shell?.availableActions ?? [])
      .filter((action) => action.enabled)
      .map((action) => ({
        id: action.id,
        label: action.label,
        hint: action.id === "pause" || action.id === "resume" ? "Runtime control" : "Operator action",
        icon: action.id === "pause" ? PauseCircle : action.id === "resume" ? PlayCircle : RefreshCcw,
        type: "Action",
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

  return (
    <Tooltip.Provider delayDuration={120}>
      <PinnedItemsProvider>
        <div className="min-h-screen overflow-x-hidden bg-bg-primary">
          <aside
            className={clsx(
              "fixed inset-y-0 left-0 hidden border-r border-bg-border/80 bg-bg-secondary transition-[width] duration-200 lg:flex lg:flex-col",
              sidebarCollapsed ? "w-[5.5rem]" : "w-72",
            )}
          >
            <div className="border-b border-bg-border px-4 py-5">
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

                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-bg-border bg-[#101012] text-text-secondary transition hover:text-text-primary"
                  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>

              {sidebarCollapsed ? (
                <div className="mt-5 space-y-3">
                  <div className="flex justify-center">
                    <StatusPill value={shell?.health ?? "waiting"} />
                  </div>
                  <div className="grid gap-2">
                    <CompactShellMetric label="Mode" value={shortMode(shell?.mode)} />
                    <CompactShellMetric
                      label="Queued"
                      value={shell ? formatInteger(shell.statusSummary.queuedCandidates) : "—"}
                    />
                    <CompactShellMetric
                      label="Open"
                      value={shell ? formatInteger(shell.statusSummary.openPositions) : "—"}
                    />
                    <CompactShellMetric
                      label="Alerts"
                      value={shell ? formatInteger(shell.unreadCriticalAlerts) : "—"}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-4 rounded-[18px] border border-bg-border bg-[var(--panel-raised)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="section-kicker">Shell</div>
                      <div className="mt-2 text-sm font-semibold text-text-primary">
                        {shell?.primaryBlocker?.label ?? "Desk clear"}
                      </div>
                    </div>
                    <StatusPill value={shell?.health ?? "waiting"} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
                    <ShellMetric label="Mode" value={shell?.mode ?? "Waiting"} />
                    <ShellMetric label="Queued" value={shell ? formatInteger(shell.statusSummary.queuedCandidates) : "—"} />
                    <ShellMetric
                      label="Open"
                      value={shell ? `${formatInteger(shell.statusSummary.openPositions)}/${formatInteger(shell.statusSummary.maxOpenPositions)}` : "—"}
                    />
                    <ShellMetric label="Alerts" value={shell ? formatInteger(shell.unreadCriticalAlerts) : "—"} />
                  </div>
                </div>
              )}
            </div>

            <nav className={clsx("space-y-2 py-5", sidebarCollapsed ? "px-3" : "px-4")}>
              {nav.map((item) => {
                const Icon = item.icon;
                const active = matchesRoute(currentPath, item.href);
                const count = routeCount(shell, item.href);
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={`Open ${item.label}`}
                    className={clsx(
                      "relative flex items-center rounded-[14px] border transition",
                      sidebarCollapsed ? "justify-center px-0 py-3" : "justify-between px-4 py-3",
                      active
                        ? "border-[rgba(163,230,53,0.3)] bg-[#121511] text-text-primary"
                        : "border-transparent text-text-secondary hover:border-bg-border hover:bg-[#141417] hover:text-text-primary",
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
                        {count ? <span className="meta-chip !px-2.5 !py-1 text-[10px]">{count}</span> : null}
                        {active ? <div className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
                      </div>
                    )}
                  </Link>
                );

                if (!sidebarCollapsed) {
                  return link;
                }

                return (
                  <Tooltip.Root key={item.href}>
                    <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side="right"
                        sideOffset={12}
                        className="rounded-[12px] border border-bg-border bg-[#111214] px-3 py-2 text-xs font-medium text-text-primary shadow-2xl"
                      >
                        {item.label}
                        <Tooltip.Arrow className="fill-[#111214]" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                );
              })}
            </nav>

            <div className={clsx("min-h-0 flex-1 overflow-y-auto pb-5", sidebarCollapsed ? "px-3" : "px-4")}>
              {!sidebarCollapsed ? (
                <div className="mb-4 rounded-[18px] border border-[rgba(163,230,53,0.16)] bg-[var(--panel-raised)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="section-kicker text-accent">{sidebarContext.eyebrow}</div>
                      <div className="mt-2 text-sm font-semibold text-text-primary">{sidebarContext.title}</div>
                    </div>
                    <div className="rounded-[12px] border border-[rgba(163,230,53,0.18)] bg-[var(--panel-accent)] p-2 text-accent">
                      <ActiveNavIcon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-text-secondary">{sidebarContext.detail}</div>
                  {sidebarContext.links?.length ? (
                    <div className="mt-3 grid gap-2">
                      {sidebarContext.links.map((link) => (
                        <Link
                          key={`${sidebarContext.title}-${link.href}-${link.label}`}
                          href={link.href as Route}
                          className="flex items-center justify-between gap-3 rounded-[12px] border border-bg-border bg-[#0f1010] px-3 py-2 text-sm text-text-secondary transition hover:border-[rgba(163,230,53,0.18)] hover:text-text-primary"
                        >
                          <span>{link.label}</span>
                          {link.badge ? <span className="meta-chip !px-2.5 !py-1 text-[10px]">{link.badge}</span> : null}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {sidebarContext.notes?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sidebarContext.notes.map((note) => (
                        <span
                          key={`${sidebarContext.title}-${note}`}
                          className="rounded-full border border-bg-border bg-[#0f1010] px-3 py-1.5 text-[11px] font-medium text-text-secondary"
                        >
                          {note}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!sidebarCollapsed ? <PinnedItemsSidebar /> : null}
            </div>
          </aside>

          <div
            className={clsx(
              "min-h-screen transition-[padding] duration-200",
              sidebarCollapsed ? "lg:pl-[5.5rem]" : "lg:pl-72",
            )}
          >
            <header ref={headerRef} className="sticky top-0 z-30 border-b border-bg-border/80 bg-bg-secondary/95 backdrop-blur-sm">
              <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-2 px-4 py-2 lg:px-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="section-kicker text-accent">{sidebarContext.eyebrow}</span>
                    <StatusPill value={shell?.mode ?? "waiting"} />
                    <StatusPill value={shell?.health ?? "waiting"} />
                    {shell?.primaryBlocker ? <StatusPill value={shell.primaryBlocker.level} /> : null}
                    {shell?.primaryBlocker?.label ? <span className="meta-chip">{shell.primaryBlocker.label}</span> : null}
                    <span className="meta-chip">Sync {shell ? formatTimestamp(shell.lastSyncAt) : "awaiting"}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{sidebarContext.title}</span>
                    <span className="text-[11px] text-text-secondary">{sidebarContext.detail}</span>
                    {shellError ? <span className="meta-chip text-accent-red">{shellError}</span> : null}
                    {actionError ? <span className="meta-chip text-accent-red">{actionError}</span> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setCommandOpen(true)}
                    className="btn-ghost inline-flex items-center gap-2 border border-bg-border !px-3 !py-2"
                    title="Open command launcher"
                  >
                    <Command className="h-4 w-4" />
                    Command
                    <span className="meta-chip !px-2 !py-1 text-[10px]">⌘K</span>
                  </button>
                  <button
                    onClick={() => refreshShell()}
                    className="btn-ghost inline-flex items-center gap-2 border border-bg-border !px-3 !py-2"
                    title="Refresh shell status"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Refresh
                  </button>
                  {shell?.availableActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => runAction(action.id, action.confirmation)}
                      disabled={!action.enabled || isPending}
                      title={action.label}
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-[12px] border px-3 py-2 text-sm font-semibold transition",
                        action.id === "pause" || action.id === "resume"
                          ? "border-[rgba(250,204,21,0.22)] bg-[#14130f] text-text-primary"
                          : "border-bg-border bg-[#121214] text-text-primary hover:border-[rgba(255,255,255,0.12)] hover:bg-[#151517]",
                        (!action.enabled || isPending) && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <ActionIcon actionId={action.id} />
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <main className="overflow-x-hidden px-4 py-3 lg:px-6 lg:py-4">
              <div className="mx-auto mb-3 overflow-auto pb-1 lg:hidden">
                <div className="flex min-w-max gap-2">
                  {nav.map((item) => {
                    const Icon = item.icon;
                    const active = matchesRoute(currentPath, item.href);
                    const count = routeCount(shell, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={`Open ${item.label}`}
                        className={clsx(
                          "flex min-w-[10rem] items-center gap-3 rounded-[14px] border px-4 py-3 text-sm transition",
                          active
                            ? "border-[rgba(163,230,53,0.3)] bg-[#121511] text-text-primary"
                            : "border-bg-border bg-bg-card text-text-secondary hover:bg-[#151517] hover:text-text-primary",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <div>{item.label}</div>
                        {count ? <span className="meta-chip ml-auto !px-2.5 !py-1 text-[10px]">{count}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="mx-auto w-full max-w-[1680px]">{children}</div>
            </main>
          </div>

          {commandOpen ? (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-16" onClick={() => setCommandOpen(false)}>
              <div
                className="panel-strong w-full max-w-2xl rounded-[18px] p-4 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center gap-3 rounded-[14px] border border-bg-border bg-[#0f0f10] px-4 py-3">
                  <Search className="h-4 w-4 text-text-muted" />
                  <input
                    ref={commandInputRef}
                    value={commandQuery}
                    onChange={(event) => {
                      setCommandQuery(event.target.value);
                      setSelectedCommandIndex(0);
                    }}
                    placeholder="Jump to a page or run an action"
                    className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  />
                  <span className="meta-chip !px-2 !py-1 text-[10px]">Esc</span>
                </div>

                <div className="mt-3 max-h-[26rem] space-y-2 overflow-auto pr-1">
                  {commandItems.length > 0 ? (
                    commandItems.map((item, index) => {
                      const Icon = item.icon;
                      const active = index === selectedCommandIndex;
                      return (
                        <button
                          key={item.id}
                          onMouseEnter={() => setSelectedCommandIndex(index)}
                          onClick={() => {
                            item.run();
                            setCommandOpen(false);
                          }}
                          className={clsx(
                            "flex w-full items-center justify-between rounded-[14px] border px-4 py-3 text-left transition",
                            active
                              ? "border-[rgba(163,230,53,0.32)] bg-[#11130f]"
                              : "border-bg-border bg-[#101012] hover:border-[rgba(255,255,255,0.12)] hover:bg-[#151517]",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={clsx("rounded-[10px] border p-2", active ? "border-[rgba(163,230,53,0.28)] text-accent" : "border-bg-border text-text-secondary")}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-text-primary">{item.label}</div>
                              <div className="text-xs text-text-muted">{item.hint}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <span>{item.type}</span>
                            {active ? <CornerDownLeft className="h-3.5 w-3.5" /> : null}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-[14px] border border-bg-border bg-[#101012] px-4 py-6 text-sm text-text-secondary">
                      Nothing matches that query.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </PinnedItemsProvider>
    </Tooltip.Provider>
  );
}

function ShellMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-bg-primary/65 px-3 py-2.5">
      <div className="micro-stat-label">{props.label}</div>
      <div className="mt-1 text-sm font-semibold text-text-primary">{props.value}</div>
    </div>
  );
}

function CompactShellMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-[#101012] px-2 py-2 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      <div className="mt-1 text-xs font-semibold text-text-primary">{props.value}</div>
    </div>
  );
}

function routeCount(shell: DeskShellPayload | null, href: Route) {
  if (!shell) return null;

  switch (href) {
    case "/candidates":
      return shell.statusSummary.queuedCandidates > 0 ? formatInteger(shell.statusSummary.queuedCandidates) : null;
    case "/positions":
      return shell.statusSummary.openPositions > 0 ? formatInteger(shell.statusSummary.openPositions) : null;
    case "/telemetry":
      return shell.unreadCriticalAlerts > 0 ? formatInteger(shell.unreadCriticalAlerts) : null;
    default:
      return null;
  }
}

function getActiveNav(pathname: string): NavItem {
  return nav.find((item) => matchesRoute(pathname, item.href)) ?? nav[0];
}

function matchesRoute(pathname: string, href: Route) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildSidebarContext(pathname: string, shell: DeskShellPayload | null): SidebarContext {
  if (matchesRoute(pathname, "/candidates")) {
    if (pathname !== "/candidates") {
      return {
        eyebrow: "Current page",
        title: "Candidate detail",
        detail: "Why it matters, gate state, and stored evidence.",
        links: [
          { href: "/candidates", label: "Back to queue", badge: routeCount(shell, "/candidates") },
          { href: "/telemetry", label: "Live faults", badge: routeCount(shell, "/telemetry") },
        ],
      };
    }
    return {
      eyebrow: "Current page",
      title: "Candidate queue",
      detail: "Triage by blocker bucket with URL-backed sort and filter state.",
      links: [
        { href: "/candidates?bucket=ready", label: "Ready" },
        { href: "/candidates?bucket=risk", label: "Risk" },
        { href: "/candidates?bucket=provider", label: "Provider" },
        { href: "/candidates?bucket=data", label: "Data" },
      ],
    };
  }

  if (matchesRoute(pathname, "/positions")) {
    if (pathname !== "/positions") {
      return {
        eyebrow: "Current page",
        title: "Position detail",
        detail: "Intervention state, execution trace, fills, and snapshots.",
        links: [
          { href: "/positions", label: "Back to book", badge: routeCount(shell, "/positions") },
          { href: "/settings", label: "Runtime settings" },
        ],
      };
    }
    return {
      eyebrow: "Current page",
      title: "Position book",
      detail: "Scan open risk first, then review the closed book.",
      links: [
        { href: "/positions?book=open", label: "Open book", badge: routeCount(shell, "/positions") },
        { href: "/positions?book=closed", label: "Closed book" },
        { href: "/settings", label: "Settings" },
      ],
    };
  }

  if (matchesRoute(pathname, "/discovery-lab")) {
    return {
      eyebrow: "Current page",
      title: "Discovery lab",
      detail: "Results, builder, and run control stay on one workbench.",
      notes: ["Results first", "Pack + strategy edits", "Runs and logs"],
    };
  }

  if (matchesRoute(pathname, "/telemetry")) {
    return {
      eyebrow: "Current page",
      title: "Telemetry",
      detail: "Faults first, then provider burn and hot endpoints.",
      notes: ["Active issues", "Provider pressure", "Endpoint faults"],
    };
  }

  if (matchesRoute(pathname, "/settings")) {
    return {
      eyebrow: "Current page",
      title: "Settings",
      detail: "Draft, validate, dry run, then promote.",
      notes: ["Draft", "Validate", "Dry run", "Promote"],
    };
  }

  return {
    eyebrow: "Current page",
    title: "Control desk",
    detail: "Exposure, queue pressure, and live faults at a glance.",
    links: [
      { href: "/candidates", label: "Candidate queue", badge: routeCount(shell, "/candidates") },
      { href: "/positions", label: "Open positions", badge: routeCount(shell, "/positions") },
      { href: "/telemetry", label: "Telemetry", badge: routeCount(shell, "/telemetry") },
    ],
  };
}

function shortMode(value?: string | null) {
  if (!value) {
    return "—";
  }
  return value.replace(/_/g, "").slice(0, 4).toUpperCase();
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
