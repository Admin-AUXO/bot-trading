import Link from "next/link";
import type { Route } from "next";
import { FlaskConical, PlayCircle, Settings2, SlidersHorizontal, Beaker, CheckSquare } from "lucide-react";
import { StatusPill } from "@/components/dashboard-primitives";
import { cn } from "@/components/ui/cn";
import { workbenchRoutes } from "@/lib/dashboard-routes";

type WorkbenchStageId = "packs" | "editor" | "runs" | "sandbox" | "grader" | "sessions";

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
    id: "runs",
    step: "03",
    label: "Review run",
    shortLabel: "Runs",
    detail: "Results, grade, and deployability live together.",
    href: workbenchRoutes.runs,
    icon: PlayCircle,
  },
  {
    id: "sandbox",
    step: "04",
    label: "Sandbox run",
    shortLabel: "Sandbox",
    detail: "Test strategy against live market conditions.",
    href: workbenchRoutes.sandbox,
    icon: Beaker,
  },
  {
    id: "grader",
    step: "05",
    label: "Grade run",
    shortLabel: "Grader",
    detail: "Evaluate performance and assign score.",
    href: workbenchRoutes.grader,
    icon: CheckSquare,
  },
  {
    id: "sessions",
    step: "06",
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-kicker text-accent">Workbench flow</div>
          <div className="mt-1 text-sm font-semibold text-text-primary">Pack, run, decide, deploy.</div>
          <div className="mt-1 text-[11px] leading-5 text-text-secondary">
            Keep the same object in view and move it forward instead of bouncing between sibling pages.
          </div>
        </div>
        {props.focusLabel ? <StatusPill value="active focus" /> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {stages.map((stage) => {
          const Icon = stage.icon;
          const active = stage.id === props.current;
          return (
            <Link
              key={stage.id}
              href={stage.href}
              prefetch={false}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
                active
                  ? "border-[rgba(163,230,53,0.26)] bg-[#11150f]"
                  : "border-bg-border bg-bg-hover/20 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/40",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{stage.step}</span>
              <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-text-muted")} />
              <span className="font-medium text-text-primary">{stage.shortLabel}</span>
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
