"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { motion } from "motion/react";
import type { ApiService, ApiUsageResponse } from "@/lib/api";
import { apiUsageQueryOptions } from "@/lib/dashboard-query-options";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { chartColors } from "@/lib/chart-colors";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { SummaryTile } from "@/components/ui/summary-tile";
import { cn, dateRangeToDays, formatNumber } from "@/lib/utils";
import {
  Activity,
  AlarmClockCheck,
  Database,
  Gauge,
  Layers,
  ShieldAlert,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DATE_RANGES = ["7d", "14d", "30d", "60d", "90d"] as const;
const SERVICE_COLORS = {
  HELIUS: chartColors.capital,
  BIRDEYE: chartColors.s1,
  JUPITER: chartColors.s2,
  JITO: chartColors.warning,
} as const;
const EMPTY_CURRENT: NonNullable<ApiUsageResponse["current"]> = [];
const EMPTY_HISTORY: ApiUsageResponse["history"] = [];
const EMPTY_MONTHLY: ApiUsageResponse["monthly"] = [];
const EMPTY_ENDPOINTS: ApiUsageResponse["topEndpoints"] = [];

export function QuotaPageClient() {
  const { activeScope, worstQuota } = useDashboardShell();
  const { effectiveMode, effectiveProfile } = useDashboardFilters();
  const [dateRange, setDateRange] = useQueryState(
    "dateRange",
    parseAsStringLiteral(DATE_RANGES).withDefault("14d"),
  );
  const days = dateRangeToDays(dateRange);
  const apiUsageQuery = useQuery(apiUsageQueryOptions(days));

  const current = apiUsageQuery.data?.current ?? EMPTY_CURRENT;
  const history = apiUsageQuery.data?.history ?? EMPTY_HISTORY;
  const monthly = apiUsageQuery.data?.monthly ?? EMPTY_MONTHLY;
  const topEndpoints = apiUsageQuery.data?.topEndpoints ?? EMPTY_ENDPOINTS;
  const quotaBlockers = useMemo(() => {
    return Array.from(new Set(
      current.flatMap((entry) => {
        if (entry.pauseReason) return [entry.pauseReason];
        if (entry.quotaStatus === "PAUSED" || entry.quotaStatus === "HARD_LIMIT") {
          return [`${entry.service} ${entry.quotaStatus.toLowerCase().replace("_", " ")}`];
        }
        return [];
      }),
    ));
  }, [current]);

  const services = useMemo<ApiService[]>(() => {
    const values = new Set<ApiService>();
    current.forEach((row) => values.add(row.service));
    history.forEach((row) => values.add(row.service));
    monthly.forEach((row) => values.add(row.service));
    return Array.from(values);
  }, [current, history, monthly]);

  const historySeries = useMemo(() => {
    const rows = new Map<string, Record<string, number | string>>();

    for (const row of history) {
      const entry = rows.get(row.date) ?? { date: row.date.slice(5) };
      entry[`${row.service}_daily`] = row.dailyUsed;
      entry[`${row.service}_monthlyPct`] = row.budgetTotal > 0
        ? (row.monthlyUsed / row.budgetTotal) * 100
        : 0;
      rows.set(row.date, entry);
    }

    return Array.from(rows.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value);
  }, [history]);

  const currentByService = useMemo(
    () => new Map(current.map((entry) => [entry.service, entry])),
    [current],
  );
  const monthlyByService = useMemo(
    () => new Map(monthly.map((entry) => [entry.service, entry])),
    [monthly],
  );

  const focusEndpoints = useMemo(() => {
    const filtered = topEndpoints.filter((entry) => {
      const modeMatches = entry.mode == null || entry.mode === effectiveMode;
      const profileMatches = entry.configProfile == null || entry.configProfile === effectiveProfile;
      return modeMatches && profileMatches;
    });

    return filtered.length > 0 ? filtered : topEndpoints;
  }, [effectiveMode, effectiveProfile, topEndpoints]);

  const totals = useMemo(() => {
    const totalCredits = history.reduce((sum, row) => sum + row.dailyUsed, 0);
    const totalCalls = history.reduce((sum, row) => sum + row.totalCalls, 0);
    const totalCached = history.reduce((sum, row) => sum + row.cachedCalls, 0);
    const endpointCredits = focusEndpoints
      .slice(0, 5)
      .reduce((sum, entry) => sum + entry.totalCredits, 0);

    return {
      endpointConcentration: totalCredits > 0 ? endpointCredits / totalCredits : 0,
      totalCached,
      totalCalls,
      totalCredits,
    };
  }, [focusEndpoints, history]);

  const nextReset = useMemo(() => {
    return current
      .filter((entry) => entry.providerCycleEnd)
      .sort((left, right) => {
        const leftTime = new Date(left.providerCycleEnd ?? 0).getTime();
        const rightTime = new Date(right.providerCycleEnd ?? 0).getTime();
        return leftTime - rightTime;
      })[0] ?? null;
  }, [current]);

  const motionContainer = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
  const motionItem = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
  };

  return (
    <motion.div className="space-y-5" variants={motionContainer} initial="hidden" animate="visible">
      <motion.div variants={motionItem} className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Provider Runway</div>
          <div className="mt-1 text-sm text-text-secondary">
            {activeScope ? `${activeScope.mode}/${activeScope.configProfile}` : "runtime pending"}
            {" · "}service budgets are global
            {" · "}endpoint focus below narrows to {effectiveMode}/{effectiveProfile}
            {" · "}{dateRange} window
          </div>
        </div>
        <div className="flex items-center gap-2">
          {DATE_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`date-range-btn ${dateRange === range ? "date-range-btn-active" : "date-range-btn-inactive"}`}
            >
              {range}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div variants={motionItem} className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <SummaryTile
          label="Worst Service"
          value={worstQuota ? `${worstQuota.service}` : "—"}
          sub={worstQuota ? worstQuota.quotaStatus : "Awaiting quota data"}
          icon={<ShieldAlert className="h-3.5 w-3.5 text-accent-red" />}
          tone={worstQuota && worstQuota.quotaStatus !== "HEALTHY" ? "danger" : "default"}
        />
        <SummaryTile
          label="Window Burn"
          value={formatNumber(totals.totalCredits)}
          sub={`${formatNumber(totals.totalCalls)} calls over ${days} days`}
          icon={<Database className="h-3.5 w-3.5 text-accent-blue" />}
        />
        <SummaryTile
          label="Cached Calls"
          value={formatNumber(totals.totalCached)}
          sub={totals.totalCalls > 0 ? `${((totals.totalCached / totals.totalCalls) * 100).toFixed(0)}% of calls` : "No traffic"}
          icon={<Layers className="h-3.5 w-3.5 text-accent-cyan" />}
        />
        <SummaryTile
          label="Endpoint Concentration"
          value={`${(totals.endpointConcentration * 100).toFixed(0)}%`}
          sub="Top 5 endpoints share of burn"
          icon={<Gauge className="h-3.5 w-3.5 text-accent-yellow" />}
          tone={totals.endpointConcentration > 0.65 ? "warning" : "default"}
        />
        <SummaryTile
          label="Active Blockers"
          value={String(quotaBlockers.length)}
          sub={quotaBlockers.length > 0 ? quotaBlockers[0] : "No quota-driven pauses"}
          icon={<Activity className="h-3.5 w-3.5 text-accent-red" />}
          tone={quotaBlockers.length > 0 ? "danger" : "positive"}
        />
        <SummaryTile
          label="Next Reset"
          value={nextReset?.providerCycleEnd ? new Date(nextReset.providerCycleEnd).toLocaleDateString() : "Month end"}
          sub={nextReset ? `${nextReset.service} cycle` : "No provider cycle metadata"}
          icon={<AlarmClockCheck className="h-3.5 w-3.5 text-accent-green" />}
        />
      </motion.div>

      <motion.div variants={motionItem} className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-accent-green" />
                <span className="stat-label">Service Pressure</span>
              </div>
              <span className="text-[11px] text-text-muted">Current snapshot by provider</span>
            </div>
            <div className="space-y-4">
              {services.map((service) => {
                const snapshot = currentByService.get(service);
                const monthlySummary = monthlyByService.get(service);
                const monthlyPct = snapshot && snapshot.budgetTotal > 0
                  ? (snapshot.monthlyUsed / snapshot.budgetTotal) * 100
                  : 0;
                const dailyPct = snapshot && snapshot.dailyBudget > 0
                  ? (snapshot.dailyUsed / snapshot.dailyBudget) * 100
                  : 0;

                return (
                  <div key={service} className="rounded-xl border border-bg-border/80 bg-bg-hover/35 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-text-primary">{service}</div>
                      <div className={cn(
                        "text-xs font-medium",
                        snapshot?.quotaStatus === "HEALTHY"
                          ? "text-accent-green"
                          : snapshot?.quotaStatus === "SOFT_LIMIT"
                            ? "text-accent-yellow"
                            : "text-accent-red",
                      )}>
                        {snapshot?.quotaStatus ?? "No current row"}
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
                          <span>Monthly runway</span>
                          <span>{monthlyPct.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-bg-border">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              snapshot?.quotaStatus === "HEALTHY"
                                ? "bg-accent-green"
                                : snapshot?.quotaStatus === "SOFT_LIMIT"
                                  ? "bg-accent-yellow"
                                  : "bg-accent-red",
                            )}
                            style={{ width: `${Math.min(monthlyPct, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
                          <span>Daily burn</span>
                          <span>{dailyPct.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-bg-border">
                          <div
                            className="h-full rounded-full bg-accent-blue"
                            style={{ width: `${Math.min(dailyPct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-muted">
                      <div>{formatNumber(snapshot?.monthlyUsed ?? monthlySummary?.totalCredits ?? 0)} used</div>
                      <div className="text-right">{formatNumber(snapshot?.budgetTotal ?? 0)} total</div>
                      <div>{formatNumber(snapshot?.dailyUsed ?? 0)} today</div>
                      <div className="text-right">{formatNumber(snapshot?.dailyBudget ?? 0)} daily budget</div>
                      <div>Calls {formatNumber(monthlySummary?.totalCalls ?? snapshot?.totalCalls ?? 0)}</div>
                      <div className="text-right">Errors {formatNumber(monthlySummary?.totalErrors ?? 0)}</div>
                      <div>Cached {formatNumber(snapshot?.cachedCalls ?? 0)}</div>
                      <div className="text-right">{(snapshot?.avgCreditsPerCall ?? 0).toFixed(1)} cr/call</div>
                    </div>
                    {snapshot?.pauseReason ? (
                      <div className="mt-3 rounded-lg border border-accent-yellow/20 bg-accent-yellow/8 px-3 py-2 text-[11px] text-accent-yellow">
                        {snapshot.pauseReason}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!services.length ? (
                <div className="text-sm text-text-muted">No quota telemetry yet.</div>
              ) : null}
            </div>
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-accent-blue" />
                <span className="stat-label">Daily Credits Burned</span>
              </div>
              <span className="text-[11px] text-text-muted">Service-by-service daily load</span>
            </div>
            {historySeries.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={historySeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke={chartColors.gridLine} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: chartColors.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: chartColors.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatNumber(Number(value))} />
                  <Tooltip
                    wrapperStyle={{
                      background: chartColors.tooltipBg,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      borderRadius: "8px",
                    }}
                    contentStyle={{ background: chartColors.tooltipBg, border: "none" }}
                    labelStyle={{ color: chartColors.tooltipText, fontSize: 12 }}
                    itemStyle={{ color: chartColors.tooltipText, fontSize: 12 }}
                  />
                  <Legend />
                  {services.map((service) => (
                    <Bar
                      key={service}
                      dataKey={`${service}_daily`}
                      stackId="daily"
                      fill={SERVICE_COLORS[service as keyof typeof SERVICE_COLORS] ?? chartColors.neutral}
                      radius={[3, 3, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-text-muted">No daily usage history yet.</div>
            )}
          </div>
        </ErrorBoundary>
      </motion.div>

      <motion.div variants={motionItem}>
        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-accent-purple" />
                <span className="stat-label">Monthly Trajectory</span>
              </div>
              <span className="text-[11px] text-text-muted">Usage percent against current service ceilings</span>
            </div>
            {historySeries.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={historySeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke={chartColors.gridLine} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: chartColors.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: chartColors.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                  <Tooltip
                    wrapperStyle={{
                      background: chartColors.tooltipBg,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      borderRadius: "8px",
                    }}
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, "Usage"]}
                    labelStyle={{ color: chartColors.tooltipText, fontSize: 12 }}
                    itemStyle={{ color: chartColors.tooltipText, fontSize: 12 }}
                  />
                  <Legend />
                  {services.map((service) => (
                    <Line
                      key={service}
                      type="monotone"
                      dataKey={`${service}_monthlyPct`}
                      stroke={SERVICE_COLORS[service as keyof typeof SERVICE_COLORS] ?? chartColors.neutral}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-text-muted">No monthly trajectory history yet.</div>
            )}
          </div>
        </ErrorBoundary>
      </motion.div>

      <motion.div variants={motionItem}>
        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-accent-cyan" />
                <span className="stat-label">Endpoint Concentration</span>
              </div>
              <span className="text-[11px] text-text-muted">
                Focused on {effectiveMode}/{effectiveProfile} where telemetry carries lane metadata
              </span>
            </div>
            <div className="space-y-2">
              {focusEndpoints.map((entry) => (
                <div
                  key={`${entry.service}:${entry.endpoint}:${entry.purpose}:${entry.configProfile ?? "all"}`}
                  className="rounded-xl border border-bg-border/80 bg-bg-hover/35 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {entry.service} · {entry.endpoint}
                      </div>
                      <div className="truncate text-xs text-text-muted">
                        {entry.purpose} · {entry.configProfile ?? "all profiles"} · {entry.mode ?? "all modes"}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium text-text-primary">{formatNumber(entry.totalCredits)} credits</div>
                      <div className="text-text-muted">{formatNumber(entry.totalCalls)} calls</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-text-muted">
                    <div>Cached {formatNumber(entry.cachedCalls)}</div>
                    <div className="text-right">Errors {formatNumber(entry.errorCount)}</div>
                    <div>{entry.avgCreditsPerCall.toFixed(1)} cr/call</div>
                    <div className="text-right">{entry.avgLatencyMs.toFixed(0)} ms latency</div>
                    <div>{entry.avgBatchSize.toFixed(1)} avg batch</div>
                    <div className="text-right">{entry.essential ? "Essential" : "Degradable"}</div>
                  </div>
                </div>
              ))}
              {!focusEndpoints.length ? (
                <div className="text-sm text-text-muted">No endpoint telemetry yet.</div>
              ) : null}
            </div>
          </div>
        </ErrorBoundary>
      </motion.div>
    </motion.div>
  );
}
