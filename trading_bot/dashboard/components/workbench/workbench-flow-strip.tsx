import Link from "next/link";
import type { Route } from "next";
import { FlaskConical, LineChart, PlayCircle, Settings2, SlidersHorizontal } from "lucide-react";
import { StatusPill } from "@/components/dashboard-primitives";
import { cn } from "@/components/ui/cn";
import { workbenchRoutes } from "@/lib/dashboard-routes";

type WorkbenchStageId = "packs" | "editor" | "sandbox" | "grader" | "sessions";

const stages: Array<{
  id: WorkbenchStageId;
  step: string;
  label: string;
  shortLabel: string;
  detail: string;
  href: Route;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "packs",
    step: "01",
    label: "Choose pack",
    shortLabel: "Packs",
    detail: "Pick the strategy shape first.",
    href: workbenchRoutes.packs,
    icon: FlaskConical,
  },
  {
    id: "editor",
    step: "02",
    label: "Tune draft",
    shortLabel: "Editor",
    detail: "Adjust the pack before you run it.",
    href: workbenchRoutes.editor,
    icon: SlidersHorizontal,
  },
  {
    id: "sandbox",
    step: "03",
    label: "Run sandbox",
    shortLabel: "Sandbox",
    detail: "Inspect the run output before review.",
    href: workbenchRoutes.sandbox,
    icon: PlayCircle,
  },
  {
    id: "grader",
    step: "04",
    label: "Review evidence",
    shortLabel: "Grader",
    detail: "Decide whether the signal is real.",
    href: workbenchRoutes.grader,
    icon: LineChart,
  },
  {
    id: "sessions",
    step: "05",
    label: "Start session",
    shortLabel: "Sessions",
    detail: "Deploy only from an eligible run.",
    href: workbenchRoutes.sessions,
    icon: Settings2,
  },
];

export function WorkbenchFlowStrip(props: {
  current: WorkbenchStageId;
  focusLabel?: string | null;
  focusDetail?: string | null;
  className?: string;
}) {
  return (
    <section className={cn("panel-strong rounded-[16px] px-3 py-3", props.className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-kicker text-accent">Workbench flow</div>
          <div className="mt-1 text-sm font-semibold text-text-primary">One path. No detours.</div>
          <div className="mt-1 text-[11px] leading-5 text-text-secondary">
            Pick, edit, run, review, deploy. Stop stacking the same facts on five screens.
          </div>
        </div>
        {props.focusLabel ? <StatusPill value="active focus" /> : null}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-5">
        {stages.map((stage) => {
          const Icon = stage.icon;
          const active = stage.id === props.current;
          return (
            <Link
              key={stage.id}
              href={stage.href}
              prefetch={false}
              className={cn(
                "rounded-[14px] border px-3 py-2.5 transition",
                active
                  ? "border-[rgba(163,230,53,0.26)] bg-[#11150f]"
                  : "border-bg-border bg-bg-hover/20 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{stage.step}</div>
                <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-text-muted")} />
              </div>
              <div className="mt-2 text-sm font-medium text-text-primary">{stage.shortLabel}</div>
              <div className="mt-1 text-[11px] leading-5 text-text-secondary">{active ? stage.label : stage.detail}</div>
            </Link>
          );
        })}
      </div>

      {props.focusLabel ? (
        <div className="mt-3 grid gap-2 rounded-[14px] border border-bg-border bg-bg-hover/20 px-3 py-2.5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Current</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-primary">{props.focusLabel}</div>
            {props.focusDetail ? <div className="mt-1 text-[11px] leading-5 text-text-secondary">{props.focusDetail}</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
