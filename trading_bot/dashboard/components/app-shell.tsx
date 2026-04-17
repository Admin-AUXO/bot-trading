"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import {
  Activity,
  FlaskConical,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import { fetchJson } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import type { ActionResponse, DeskShellPayload } from "@/lib/types";
import { StatusPill } from "@/components/dashboard-primitives";
import { PinnedItemsProvider } from "@/components/pinned-items";
import { Badge } from "@/components/ui/badge";
import { Sidebar } from "./shell/sidebar";
import { CommandPalette } from "./shell/command-palette";
import { ShellActions } from "./shell/shell-actions";

const SIDEBAR_STORAGE_KEY = "graduation-control-sidebar-collapsed";

const actionEndpoint: Record<DeskShellPayload["availableActions"][number]["id"], string> = {
  pause: "/control/pause",
  resume: "/control/resume",
  "discover-now": "/control/discover-now",
  "evaluate-now": "/control/evaluate-now",
  "exit-check-now": "/control/exit-check-now",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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

  const refreshShell = useEffectEvent(async () => {
    try {
      const next = await fetchJson<DeskShellPayload>("/desk/shell");
      setShell(next);
      setShellError(null);
    } catch (error) {
      setShell(null);
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
          <Sidebar
            shell={shell}
            sidebarCollapsed={sidebarCollapsed}
            sidebarReady={sidebarReady}
            onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          />

          <div
            className={clsx(
              "min-h-screen transition-[padding] duration-200",
              sidebarCollapsed ? "lg:pl-[6.75rem]" : "lg:pl-[17rem]",
            )}
          >
            <header
              ref={headerRef}
              className="sticky top-0 z-30 border-b border-bg-border/80 bg-bg-secondary/95 backdrop-blur-sm"
            >
              <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-2 px-4 py-2 lg:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill value={shell?.mode ?? "waiting"} />
                  <StatusPill value={shell?.health ?? "waiting"} />
                  {shellError ? (
                    <Badge variant="danger" className="normal-case">{shellError}</Badge>
                  ) : null}
                  {actionError ? (
                    <Badge variant="danger" className="normal-case">{actionError}</Badge>
                  ) : null}
                </div>

                <ShellActions
                  shell={shell}
                  shellError={shellError}
                  actionError={actionError}
                  isPending={isPending}
                  onRefresh={() => refreshShell()}
                  onCommandOpen={() => setCommandOpen(true)}
                  onRunAction={runAction}
                />
              </div>
            </header>

            <main className="overflow-x-hidden px-4 py-3 lg:px-6 lg:py-4">
              <div className="mx-auto w-full max-w-[1680px]">{children}</div>
            </main>
          </div>

          <CommandPalette
            open={commandOpen}
            commandOpen={commandOpen}
            commandQuery={commandQuery}
            selectedCommandIndex={selectedCommandIndex}
            commandItems={commandItems}
            onCommandOpenChange={setCommandOpen}
            onCommandQueryChange={setCommandQuery}
            onSelectedCommandIndexChange={setSelectedCommandIndex}
          />
        </div>
      </PinnedItemsProvider>
    </Tooltip.Provider>
  );
}

type NavItem = {
  id: string;
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefixes: string[];
};

const navItems: NavItem[] = [
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
];
