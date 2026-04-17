"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Activity,
  FlaskConical,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Settings2,
  Sparkles,
} from "lucide-react";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import { formatInteger } from "@/lib/format";
import type { DeskShellPayload } from "@/lib/types";
import { StatusPill } from "@/components/dashboard-primitives";
import { PinnedItemsSidebar } from "@/components/pinned-items";
import { Button } from "@/components/ui/button";

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

interface SidebarProps {
  shell: DeskShellPayload | null;
  sidebarCollapsed: boolean;
  sidebarReady: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ shell, sidebarCollapsed, sidebarReady, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const currentPath = pathname ?? "/";

  return (
    <aside
      className={clsx(
        "fixed inset-y-0 left-0 hidden border-r border-bg-border/80 bg-bg-secondary transition-[width] duration-200 lg:flex lg:flex-col",
        sidebarCollapsed ? "w-[6.75rem]" : "w-[17rem]",
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
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-10 w-10 bg-[#101012]"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

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
