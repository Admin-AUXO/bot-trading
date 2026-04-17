"use client";

import type { OperatorEvent } from "@/lib/types";
import { formatRelativeMinutes } from "@/lib/format";
import { Panel } from "@/components/dashboard-primitives";
import { AlertTriangle, FlaskConical, CirclePause, RadioTower } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface EventsListProps {
  events: OperatorEvent[];
}

export function EventsList({ events }: EventsListProps) {
  return (
    <Panel
      title="Recent events"
      eyebrow="Activity"
      description="Last 6 operator events."
      tone={events.some((e) => e.level !== "info") ? "warning" : "passive"}
    >
      {events.length === 0 ? (
        <div className="py-3 text-xs text-text-muted">No recent events.</div>
      ) : (
        <div className="space-y-1.5">
          {events.slice(0, 6).map((event) => (
            <EventItem key={event.id} event={event} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function EventItem({ event }: { event: OperatorEvent }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-[10px] border border-bg-border bg-bg-hover/30 px-3 py-2">
      <div className="flex items-start gap-2 min-w-0">
        <div
          className={cn(
            "mt-0.5 rounded-[6px] border border-bg-border p-1",
            event.kind.includes("failure") || event.level === "warning"
              ? "bg-[rgba(251,113,133,0.1)] text-[var(--danger)]"
              : "bg-bg-primary/70 text-text-muted"
          )}
        >
          <EventIcon event={event} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-text-primary">{event.title}</div>
          <div className="text-[10px] text-text-muted">{event.kind.replace(/_/g, " ")}</div>
        </div>
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-text-muted">
        {formatRelativeMinutes(event.createdAt)}
      </span>
    </div>
  );
}

function EventIcon({ event }: { event: OperatorEvent }) {
  if (event.kind.includes("research")) return <FlaskConical className="h-3.5 w-3.5" />;
  if (event.kind.includes("control") || event.kind.includes("pause") || event.kind.includes("resume"))
    return <CirclePause className="h-3.5 w-3.5" />;
  if (event.kind.includes("failure") || event.level !== "info") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <RadioTower className="h-3.5 w-3.5" />;
}
