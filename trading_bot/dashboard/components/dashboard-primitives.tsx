import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { type Route } from "next";
import { AlertCircle, ChevronRight, CircleHelp } from "lucide-react";
import { NativeTable } from "@/components/ui/native-table";
import { smartFormatValue } from "@/lib/format";
import { deriveStatusTone } from "@/lib/status";

type TableRow = Record<string, unknown>;

export function PageHero(props: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <section className="panel-strong rounded-[14px] px-3 py-2.5 md:px-3.5 md:py-3">
      <div className="relative z-10 grid gap-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(13rem,15rem)] xl:items-start">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="section-kicker text-accent">{props.eyebrow}</p>
            {props.meta}
          </div>
          <h1 className="mt-1 font-display text-[1rem] font-semibold tracking-[-0.02em] text-balance text-text-primary md:text-[1.16rem]">
            {props.title}
          </h1>
          {props.description ? (
            <p className="mt-1 max-w-2xl text-xs leading-5 text-text-secondary">{props.description}</p>
          ) : null}
          {props.actions ? <div className="mt-1.5 flex flex-wrap gap-2">{props.actions}</div> : null}
        </div>
        {props.aside ? <div className="relative z-10">{props.aside}</div> : null}
      </div>
    </section>
  );
}

export function CompactPageHeader(props: {
  eyebrow: string;
  title: string;
  description?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("panel-strong relative overflow-hidden rounded-[16px] px-3 py-3.5 md:px-4", props.className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(166,241,135,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_72%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(166,241,135,0.35),transparent)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="section-kicker text-accent">{props.eyebrow}</div>
            {props.badges}
          </div>
          <div className="mt-1 flex flex-wrap items-end gap-3">
            <h1 className="font-display text-[1.08rem] font-semibold tracking-[-0.03em] text-text-primary md:text-[1.18rem]">
              {props.title}
            </h1>
            {props.description ? (
              <div className="max-w-3xl text-[11px] leading-5 text-text-secondary md:text-[12px]">{props.description}</div>
            ) : null}
          </div>
        </div>
        {props.actions ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{props.actions}</div>
        ) : null}
      </div>
      {props.children ? (
        <div className="relative mt-3 rounded-[16px] border border-bg-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-2.5 md:p-3">
          {props.children}
        </div>
      ) : null}
    </section>
  );
}

export function CompactStatGrid(props: {
  items: Array<{
    label: string;
    value: string;
    detail?: string;
    tooltip?: string;
    tone?: "default" | "accent" | "warning" | "danger";
  }>;
  className?: string;
}) {
  const items = props.items.filter(Boolean);

  return (
    <div className={clsx("grid gap-2 md:grid-cols-2 xl:grid-cols-4", props.className)}>
      {items.map((item) => (
        <ScanStat
          key={`${item.label}-${item.value}-${item.detail ?? ""}`}
          label={item.label}
          value={item.value}
          detail={item.detail}
          tooltip={item.tooltip}
          tone={item.tone}
        />
      ))}
    </div>
  );
}

export function Panel(props: {
  id?: string;
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  tone?: "default" | "critical" | "warning" | "passive";
}) {
  const toneClass = {
    default: "panel-shell",
    critical: "border-[rgba(251,113,133,0.24)] bg-[#141013]",
    danger: "border-[rgba(251,113,133,0.24)] bg-[#141013]",
    warning: "border-[rgba(250,204,21,0.2)] bg-[#15140f]",
    passive: "panel-muted",
  }[props.tone ?? "default"];

  return (
    <section id={props.id} className={clsx("rounded-[12px] p-3 md:p-3.5", toneClass, props.className)}>
      {props.eyebrow || props.action ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2.5 border-b border-bg-border/60 pb-2.5">
          <div>
            {props.eyebrow ? <p className="section-kicker">{props.eyebrow}</p> : null}
            <h2 className="mt-1 font-display text-[0.93rem] font-semibold tracking-[-0.02em] text-text-primary md:text-[1rem]">
              {props.title}
            </h2>
            {props.description ? (
              <p className="mt-0.5 max-w-3xl text-xs leading-5 text-text-secondary">{props.description}</p>
            ) : null}
          </div>
          {props.action}
        </div>
      ) : (
        <div className="mb-3 border-b border-bg-border/60 pb-2.5">
          <h2 className="font-display text-[0.93rem] font-semibold tracking-[-0.02em] text-text-primary md:text-[1rem]">
            {props.title}
          </h2>
          {props.description ? (
            <p className="mt-0.5 max-w-3xl text-xs leading-5 text-text-secondary">{props.description}</p>
          ) : null}
        </div>
      )}
      {props.children}
    </section>
  );
}

export function InlineNotice(props: {
  children: React.ReactNode;
  tone?: "default" | "accent" | "warning" | "danger" | "critical";
  className?: string;
}) {
  const toneClass = {
    default: "border-bg-border bg-bg-hover/25 text-text-secondary",
    accent: "border-[rgba(163,230,53,0.22)] bg-[rgba(163,230,53,0.08)] text-text-primary",
    warning: "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.08)] text-[var(--warning,#eab308)]",
    danger: "border-[rgba(251,113,133,0.24)] bg-[rgba(251,113,133,0.08)] text-[var(--danger,#ef4444)]",
    critical: "border-[rgba(251,113,133,0.24)] bg-[rgba(251,113,133,0.08)] text-[var(--danger,#ef4444)]",
  }[props.tone ?? "default"];

  return (
    <div className={clsx("rounded-[12px] border px-4 py-3 text-sm", toneClass, props.className)}>
      {props.children}
    </div>
  );
}

export function DisclosurePanel(props: {
  title: string;
  description: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={clsx("group rounded-[14px] border border-bg-border bg-bg-secondary/70 p-3", props.className)}>
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3"
        aria-expanded="false"
        aria-controls={`disclosure-${props.title.replace(/\s+/g, "-").toLowerCase()}`}
      >
        <div className="min-w-0">
          <div className="section-kicker">Details</div>
          <div className="mt-1 text-sm font-semibold text-text-primary">{props.title}</div>
          <div className="mt-1 text-xs leading-5 text-text-secondary">{props.description}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {props.badge}
          <div className="text-[11px] text-text-muted group-open:hidden">Open</div>
          <div className="hidden text-[11px] text-text-muted group-open:block">Hide</div>
        </div>
      </summary>
      <div id={`disclosure-${props.title.replace(/\s+/g, "-").toLowerCase()}`} className="mt-3">{props.children}</div>
    </details>
  );
}

export function StatCard(props: {
  label: string;
  value: string;
  detail: string;
  tone?: "accent" | "success" | "warning" | "danger" | "default";
  icon?: LucideIcon;
}) {
  const tones = {
    accent: "border-[rgba(255,255,255,0.08)] bg-[#131315]",
    success: "border-[rgba(255,255,255,0.08)] bg-[#121412]",
    warning: "border-[rgba(255,255,255,0.08)] bg-[#14130f]",
    danger: "border-[rgba(255,255,255,0.08)] bg-[#151013]",
    default: "border-[var(--line)] bg-[#121214]",
  };
  const Icon = props.icon;

  return (
    <div className={clsx("rounded-[12px] border px-3 py-[0.6rem]", tones[props.tone ?? "default"])}>
      <div className="scorecard-grid">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="scorecard-label wrap-anywhere">{props.label}</div>
          {Icon ? <Icon className="h-4 w-4 text-text-secondary" /> : null}
        </div>
        <div className="scorecard-value wrap-anywhere text-[1.16rem] font-semibold tracking-tight">
          {props.value}
        </div>
        <div className="scorecard-detail text-[12px]">{props.detail}</div>
      </div>
    </div>
  );
}

export function ScanStat(props: {
  label: string;
  value: string;
  detail?: string;
  tooltip?: string;
  tone?: "default" | "accent" | "warning" | "danger" | "critical";
}) {
  const toneClass = {
    default: "border-bg-border bg-[#101112]",
    accent: "border-[rgba(163,230,53,0.2)] bg-[#10140f]",
    warning: "border-[rgba(250,204,21,0.18)] bg-[#14120f]",
    danger: "border-[rgba(251,113,133,0.2)] bg-[#151012]",
    critical: "border-[rgba(251,113,133,0.2)] bg-[#151012]",
  }[props.tone ?? "default"];

  return (
    <div className={clsx("rounded-[12px] border px-3 py-2.5", toneClass)}>
      <div className="scorecard-grid">
        <div className="flex items-center justify-center gap-1.5">
          <div className="scorecard-label wrap-anywhere">{props.label}</div>
          {props.tooltip ? <StatTooltip content={props.tooltip} /> : null}
        </div>
        <div className="scorecard-value wrap-anywhere text-[0.98rem] font-semibold tracking-tight">
          {props.value}
        </div>
        {props.detail ? <div className="scorecard-detail line-clamp-2 text-xs">{props.detail}</div> : <div />}
      </div>
    </div>
  );
}

function StatTooltip(props: { content: string }) {
  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-text-muted transition hover:text-text-primary"
            aria-label="Show stat detail"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={8}
            className="max-w-[18rem] rounded-[12px] border border-bg-border bg-[#111214] px-3 py-2 text-[11px] leading-5 text-text-primary shadow-2xl"
          >
            {props.content}
            <Tooltip.Arrow className="fill-[#111214]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function EmptyState(props: {
  title: string;
  detail: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center text-center",
        props.compact ? "px-4 py-5" : "px-4 py-8",
        props.className,
      )}
    >
      <div
        className={clsx(
          "mb-3 flex items-center justify-center rounded-xl border border-bg-border bg-bg-hover text-text-muted",
          props.compact ? "h-8 w-8" : "h-10 w-10",
        )}
      >
        <AlertCircle className="h-4 w-4" />
      </div>
      <div className="text-sm font-medium text-text-secondary">{props.title}</div>
      <div className="mt-1 max-w-xs text-xs text-text-muted">{props.detail}</div>
    </div>
  );
}

export function LoadingSkeleton(props: { className?: string }) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded-[14px] bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.06)_50%,rgba(255,255,255,0.03)_100%)]",
        props.className,
      )}
      aria-hidden="true"
      role="status"
      aria-live="polite"
    />
  );
}

export function LoadingPage() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <LoadingSkeleton className="h-20 w-full" />
        <LoadingSkeleton className="h-12 w-3/4" />
      </div>
      <LoadingSkeleton className="h-40 w-full" />
      <div className="grid gap-3">
        <LoadingSkeleton className="h-24 w-full" />
        <LoadingSkeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

export type BreadcrumbItem = {
  label: string;
  href?: Route;
};

export function Breadcrumbs(props: { items: BreadcrumbItem[]; className?: string }) {
  if (props.items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={clsx("flex items-center gap-1 text-xs", props.className)}>
      {props.items.map((item, index) => {
        const isLast = index === props.items.length - 1;
        return (
          <span key={index} className="flex items-center gap-1">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-text-muted transition hover:text-text-primary"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-text-primary font-medium" : "text-text-muted"}>
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight className="h-3 w-3 text-text-muted" />}
          </span>
        );
      })}
    </nav>
  );
}

export function StatusPill(props: { value: string | null | undefined }) {
  const value = String(props.value ?? "unknown").toUpperCase();
  const tone = deriveStatusTone(props.value);
  const toneClass = {
    danger: "border-[rgba(251,113,133,0.26)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]",
    accent: "border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]",
    warning: "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.12)] text-[var(--warning)]",
    default: "border-[var(--line)] bg-white/[0.05] text-text-secondary",
  }[tone];

  const statusLabel = {
    DRY_RUN: "Dry Run",
    DRY: "Dry Run",
    LIVE: "Live",
    PAPER: "Paper Trade",
    PAPR: "Paper Trade",
    WAIT: "Waiting",
    HEALTHY: "Healthy",
    DEGRADED: "Degraded",
    BLOCKED: "Blocked",
  }[value] ?? value.replace(/_/g, " ").toLowerCase();

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em]",
        toneClass,
      )}
      aria-label={`Status: ${statusLabel}`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function IconAction(props: {
  href: string;
  icon: LucideIcon;
  label: string;
  title?: string;
  subtle?: boolean;
}) {
  const Icon = props.icon;
  return (
    <a
      href={props.href}
      className={clsx(
        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition",
        props.subtle
          ? "border-bg-border bg-bg-hover text-text-secondary hover:border-[rgba(255,255,255,0.12)] hover:text-text-primary"
          : "border-[rgba(163,230,53,0.3)] bg-[#0f0f10] text-text-primary hover:text-accent",
      )}
      title={props.title ?? props.label}
      aria-label={props.title ?? props.label}
    >
      <Icon className="h-3.5 w-3.5" />
      {props.label}
      <ChevronRight className="h-3.5 w-3.5" />
    </a>
  );
}

export function DataTable(props: {
  title: string;
  rows: TableRow[];
  preferredKeys: string[];
  eyebrow?: string;
  description?: string;
  maxRows?: number;
  className?: string;
  emptyTitle?: string;
  emptyDetail?: string;
  panelTone?: "default" | "critical" | "warning" | "passive";
}) {
  const rows = props.maxRows ? props.rows.slice(0, props.maxRows) : props.rows;
  const sampleRow = rows[0];
  const keys = sampleRow
    ? props.preferredKeys
        .filter((key) => key in sampleRow)
        .concat(
          Object.keys(sampleRow)
            .filter((key) => !props.preferredKeys.includes(key))
            .slice(0, Math.max(0, 8 - props.preferredKeys.length)),
        )
    : [];

  return (
    <Panel
      title={props.title}
      eyebrow={props.eyebrow}
      description={props.description}
      className={props.className}
      tone={props.panelTone}
    >
      {rows.length === 0 || keys.length === 0 ? (
        <EmptyState
          title={props.emptyTitle ?? "Nothing to show yet"}
          detail={
            props.emptyDetail ??
            "The backend returned no rows for this slice, which is still better than lying with placeholder numbers."
          }
        />
      ) : (
        <NativeTable<TableRow>
          rows={rows}
          rowKey={(row, index) => String(row.id ?? row.mint ?? row.symbol ?? index)}
          columns={keys.map((key) => ({
            id: key,
            header: humanizeLabel(key),
            align: isNumericColumn(key, rows) ? "center" : "left",
            render: (row: TableRow) => (
              <span className={clsx("inline-block", key.includes("reason") && "line-clamp-2")}>
                {smartFormatValue(key, row[key])}
              </span>
            ),
            cellClassName: key.includes("reason") ? "min-w-[16rem]" : undefined,
          }))}
          maxHeightClassName="max-h-[20rem]"
        />
      )}
    </Panel>
  );
}

function humanizeLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isNumericColumn(key: string, rows: TableRow[]) {
  return rows.some((row) => typeof row[key] === "number");
}
