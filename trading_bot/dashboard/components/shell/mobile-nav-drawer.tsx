"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Radar,
  X,
} from "lucide-react";
import { dashboardNavGroups, matchesDashboardRoute } from "@/lib/dashboard-navigation";
import { formatInteger, formatMinutesAgo } from "@/lib/format";
import type { DeskShellPayload } from "@/lib/types";
import { StatusPill } from "@/components/dashboard-primitives";
import { PinnedItemsSidebar } from "@/components/pinned-items";
import { Button } from "@/components/ui/button";

interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shell: DeskShellPayload | null;
}

export function MobileNavDrawer({ open, onOpenChange, shell }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const currentPath = pathname ?? "/";

  return (
    <>
      <div
        className={clsx(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col border-r border-bg-border/80 bg-bg-secondary transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-bg-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-xl border border-[rgba(163,230,53,0.2)] bg-[var(--panel-raised)] p-2 text-accent">
                <Radar className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-sm font-semibold tracking-[0.2em] text-text-primary">GRADUATION CONTROL</div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-10 w-10"
              title="Close navigation"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="mt-3 space-y-2 rounded-[12px] border border-bg-border bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3">
            <div className="flex items-center justify-between gap-2">
              <StatusPill value={shell?.health ?? "waiting"} />
              <span className="text-[11px] text-text-muted">
                Sync {formatMinutesAgo(shell?.lastSyncAt)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
              <ShellMetric label="Mode" value={shortMode(shell?.mode)} />
              <ShellMetric label="Open" value={shell ? formatInteger(shell.statusSummary.openPositions) : "—"} />
              <ShellMetric label="Queue" value={shell ? formatInteger(shell.statusSummary.queuedCandidates) : "—"} />
              <ShellMetric label="Sync" value={compactSyncLabel(shell?.lastSyncAt)} />
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto py-3">
          {dashboardNavGroups.map((group) => (
            <div key={group.id} className="space-y-1.5 px-4">
              <div className="flex items-center gap-2 px-1">
                <group.icon className="h-3.5 w-3.5 text-text-muted" />
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{group.label}</div>
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = matchesDashboardRoute(currentPath, item);
                const link = (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    className={clsx(
                      "relative flex items-center rounded-[14px] border py-2.5 px-3 transition",
                      active
                        ? "border-l-2 border-l-accent border-[rgba(163,230,53,0.3)] bg-[#121511] text-text-primary"
                        : "border-bg-border/30 text-text-secondary hover:border-bg-border hover:bg-[#141417] hover:text-text-primary",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={clsx("h-4 w-4", active && "text-accent")} />
                      <div className="min-w-0 text-sm font-medium">{item.label}</div>
                    </div>
                    {active ? <div className="ml-auto h-2 w-2 rounded-full bg-accent" /> : null}
                  </Link>
                );

                if (!item.detail) return link;

                return (
                  <Tooltip.Root key={item.id}>
                    <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side="right"
                        sideOffset={12}
                        className="rounded-[12px] border border-bg-border bg-[#111214] px-3 py-2 text-xs font-medium text-text-primary shadow-2xl z-50"
                      >
                        <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{group.label}</div>
                        <div className="mt-1">{item.label}</div>
                        <div className="mt-1 max-w-[16rem] text-[11px] font-normal leading-5 text-text-secondary">{item.detail}</div>
                        <Tooltip.Arrow className="fill-[#111214]" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-bg-border px-4 pb-4 pt-3">
          <PinnedItemsSidebar hideWhenEmpty />
        </div>
      </aside>
    </>
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

function shortMode(value?: string | null) {
  if (!value) return "—";
  const normalized = value.toUpperCase();
  if (normalized.includes("DRY")) return "DRY";
  if (normalized.includes("LIVE")) return "LIVE";
  if (normalized.includes("PAPER")) return "PAPR";
  if (normalized.includes("WAIT")) return "WAIT";
  return normalized.replace(/_/g, "").slice(0, 4);
}

function compactSyncLabel(value?: string | null) {
  const minutesAgo = formatMinutesAgo(value);
  return minutesAgo === "awaiting" ? "—" : minutesAgo.replace(" ago", "");
}