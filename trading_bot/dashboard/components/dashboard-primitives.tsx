import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, ChevronRight } from "lucide-react";
import { humanizeKey, smartFormatValue } from "@/lib/format";

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
    <section className="panel-strong rounded-[20px] p-5 md:p-6">
      <div className="relative z-10 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,21rem)] xl:items-end">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="section-kicker text-accent">{props.eyebrow}</p>
            {props.meta}
          </div>
          <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em] text-balance text-text-primary md:text-[2.5rem]">
            {props.title}
          </h1>
          {props.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary md:text-[15px]">{props.description}</p>
          ) : null}
          {props.actions ? <div className="mt-4 flex flex-wrap gap-2.5">{props.actions}</div> : null}
        </div>
        {props.aside ? <div className="relative z-10">{props.aside}</div> : null}
      </div>
    </section>
  );
}

export function Panel(props: {
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
    warning: "border-[rgba(250,204,21,0.2)] bg-[#15140f]",
    passive: "panel-muted",
  }[props.tone ?? "default"];

  return (
    <section className={clsx("rounded-[18px] p-5", toneClass, props.className)}>
      {(props.eyebrow || props.action) ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            {props.eyebrow ? <p className="section-kicker">{props.eyebrow}</p> : null}
            <h2 className="mt-2 font-display text-[1.2rem] font-semibold tracking-[-0.03em] text-text-primary md:text-[1.45rem]">{props.title}</h2>
            {props.description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{props.description}</p> : null}
          </div>
          {props.action}
        </div>
      ) : (
        <div className="mb-4">
          <h2 className="font-display text-[1.2rem] font-semibold tracking-[-0.03em] text-text-primary md:text-[1.45rem]">{props.title}</h2>
          {props.description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{props.description}</p> : null}
        </div>
      )}
      {props.children}
    </section>
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
    <div className={clsx("rounded-[16px] border px-4 py-4", tones[props.tone ?? "default"])}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">{props.label}</div>
        {Icon ? <Icon className="h-4 w-4 text-text-secondary" /> : null}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-text-primary">{props.value}</div>
      <div className="mt-2 text-[13px] leading-5 text-text-secondary">{props.detail}</div>
    </div>
  );
}

export function EmptyState(props: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-bg-border bg-bg-hover text-text-muted">
        <AlertCircle className="h-4 w-4" />
      </div>
      <div className="text-sm font-medium text-text-secondary">{props.title}</div>
      <div className="mt-1 max-w-xs text-xs text-text-muted">{props.detail}</div>
    </div>
  );
}

export function StatusPill(props: { value: string | null | undefined }) {
  const value = String(props.value ?? "unknown").toUpperCase();
  const tone = value.includes("REJECT") || value.includes("ERROR") || value.includes("BLOCK") || value.includes("FAIL") || value.includes("DANGER")
    ? "border-[rgba(251,113,133,0.26)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]"
    : value.includes("OPEN") || value.includes("ACCEPT") || value.includes("BOUGHT") || value.includes("READY") || value.includes("PASS") || value.includes("HEALTHY") || value.includes("LIVE") || value.includes("RUNNING") || value === "OK"
      ? "border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]"
      : value.includes("WARNING") || value.includes("PAUSE") || value.includes("WAIT") || value.includes("QUEUE") || value.includes("STALE") || value.includes("DISCOVER") || value.includes("SKIP") || value.includes("CHANGED")
        ? "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.12)] text-[var(--warning)]"
        : "border-[var(--line)] bg-white/[0.05] text-text-secondary";

  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em]", tone)}>
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
      .concat(Object.keys(sampleRow).filter((key) => !props.preferredKeys.includes(key)).slice(0, Math.max(0, 8 - props.preferredKeys.length)))
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
          detail={props.emptyDetail ?? "The backend returned no rows for this slice, which is still better than lying with placeholder numbers."}
        />
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-bg-border/80 bg-bg-card/45">
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-bg-hover/60">
                <tr>
                  {keys.map((key) => (
                    <th key={key} className="table-header whitespace-nowrap">{humanizeKey(key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowKey(row, rowIndex)} className="table-row align-top">
                    {keys.map((key) => {
                      const value = row[key];
                      const rendered = key === "status" || key.endsWith("_status")
                        ? <StatusPill value={String(value ?? "unknown")} />
                        : key.includes("reason") && typeof value === "string" && value.length > 0
                          ? <span className="line-clamp-2 max-w-[28ch] text-text-muted">{value}</span>
                          : <span className="text-text-secondary">{smartFormatValue(key, value)}</span>;

                      return (
                        <td
                          key={key}
                          className={clsx(
                            "table-cell max-w-[320px]",
                            looksNumeric(key) ? "text-right tabular-nums" : "",
                          )}
                        >
                          <div
                            className={clsx(
                              "min-w-[7rem]",
                              looksLikeIdentifier(key) ? "font-mono text-xs tracking-[0.04em] text-text-muted" : "",
                            )}
                          >
                            {rendered}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}

function rowKey(row: TableRow, index: number): string {
  const candidate = row.id ?? row.mint ?? row.symbol ?? row.endpoint ?? row.provider;
  return `${String(candidate ?? "row")}-${index}`;
}

function looksLikeIdentifier(key: string): boolean {
  return key.includes("id") || key.includes("mint") || key.includes("address") || key.includes("endpoint");
}

function looksNumeric(key: string): boolean {
  return /(price|amount|pnl|count|units|percent|ratio|volume|liquidity|cap|remaining|priority)/i.test(key);
}
