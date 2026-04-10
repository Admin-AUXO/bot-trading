import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { AlertCircle } from "lucide-react";
import { humanizeKey, smartFormatValue } from "@/lib/format";

type TableRow = Record<string, unknown>;

export function PageHero(props: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="panel-strong overflow-hidden rounded-[28px] p-6 md:p-7">
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="absolute inset-x-[-12%] top-[-72%] h-56 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.16),transparent_68%)] blur-3xl" />
        <div className="relative z-10 max-w-4xl">
          <p className="section-kicker text-accent-blue">{props.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">{props.title}</h1>
          {props.description ? (
            <p className="mt-4 max-w-3xl text-sm leading-7 text-text-secondary md:text-[15px]">{props.description}</p>
          ) : null}
          {props.actions ? <div className="mt-5 flex flex-wrap gap-3">{props.actions}</div> : null}
        </div>
        {props.aside ? <div className="relative z-10 xl:max-w-sm">{props.aside}</div> : null}
      </div>
    </section>
  );
}

export function Panel(props: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={clsx("panel-shell rounded-[24px] p-5 md:p-6", props.className)}>
      {(props.eyebrow || props.action) ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            {props.eyebrow ? <p className="section-kicker">{props.eyebrow}</p> : null}
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-text-primary md:text-2xl">{props.title}</h2>
          </div>
          {props.action}
        </div>
      ) : (
        <h2 className="mb-5 text-xl font-semibold tracking-tight text-text-primary md:text-2xl">{props.title}</h2>
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
    accent: "border-[rgba(255,209,102,0.32)] bg-[rgba(255,209,102,0.08)]",
    success: "border-[rgba(103,232,165,0.3)] bg-[rgba(103,232,165,0.08)]",
    warning: "border-[rgba(255,159,104,0.3)] bg-[rgba(255,159,104,0.08)]",
    danger: "border-[rgba(255,107,107,0.3)] bg-[rgba(255,107,107,0.08)]",
    default: "border-[var(--line)] bg-white/4",
  };
  const Icon = props.icon;

  return (
    <div className={clsx("rounded-xl border px-3 py-3 backdrop-blur-sm", tones[props.tone ?? "default"])}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] uppercase tracking-wider text-text-muted">{props.label}</div>
        {Icon ? <Icon className="h-4 w-4 text-accent-blue" /> : null}
      </div>
      <div className="mt-2 text-base font-bold tabular-nums text-text-primary md:text-lg">{props.value}</div>
      <div className="mt-1 text-[11px] text-text-muted">{props.detail}</div>
    </div>
  );
}

export function EmptyState(props: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-bg-border bg-bg-hover text-text-muted">
        <AlertCircle className="h-4 w-4" />
      </div>
      <div className="text-sm font-medium text-text-secondary">{props.title}</div>
      <div className="mt-1 max-w-xs text-xs text-text-muted">{props.detail}</div>
    </div>
  );
}

export function StatusPill(props: { value: string | null | undefined }) {
  const value = String(props.value ?? "unknown").toUpperCase();
  const tone = value.includes("OPEN") || value.includes("ACCEPT") || value.includes("BOUGHT")
    ? "border-[rgba(103,232,165,0.28)] bg-[rgba(103,232,165,0.1)] text-[var(--success)]"
    : value.includes("REJECT") || value.includes("ERROR") || value.includes("CLOSED")
      ? "border-[rgba(255,107,107,0.28)] bg-[rgba(255,107,107,0.1)] text-[var(--danger)]"
      : value.includes("DISCOVER") || value.includes("SKIP") || value.includes("PAUSE")
        ? "border-[rgba(255,159,104,0.28)] bg-[rgba(255,159,104,0.1)] text-[var(--warning)]"
        : "border-[var(--line)] bg-white/6 text-ink";

  return (
    <span className={clsx("inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium tracking-[0.12em]", tone)}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function DataTable(props: {
  title: string;
  rows: TableRow[];
  preferredKeys: string[];
  eyebrow?: string;
  maxRows?: number;
  className?: string;
  emptyTitle?: string;
  emptyDetail?: string;
}) {
  const rows = props.maxRows ? props.rows.slice(0, props.maxRows) : props.rows;
  const sampleRow = rows[0];
  const keys = sampleRow
    ? props.preferredKeys
      .filter((key) => key in sampleRow)
      .concat(Object.keys(sampleRow).filter((key) => !props.preferredKeys.includes(key)).slice(0, Math.max(0, 8 - props.preferredKeys.length)))
    : [];

  return (
    <Panel title={props.title} eyebrow={props.eyebrow} className={props.className}>
      {rows.length === 0 || keys.length === 0 ? (
        <EmptyState
          title={props.emptyTitle ?? "Nothing to show yet"}
          detail={props.emptyDetail ?? "The backend returned no rows for this slice, which is still better than lying with placeholder numbers."}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-bg-border/80 bg-bg-card/45">
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-bg-hover/40">
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
                        <td key={key} className="table-cell max-w-[320px]">
                          <div className={clsx(
                            "min-w-[7rem]",
                            looksLikeIdentifier(key) ? "font-mono text-xs tracking-[0.04em]" : "",
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
