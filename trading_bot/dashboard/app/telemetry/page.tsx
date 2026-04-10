import { ActivitySquare, Gauge, RadioTower, SlidersHorizontal } from "lucide-react";
import { DataTable, PageHero, StatCard } from "@/components/dashboard-primitives";
import { serverFetch } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import type { ViewRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TelemetryPage() {
  const [providerDaily, endpointEfficiency, snapshotTriggers, rejectReasons, settings, candidateState] = await Promise.all([
    serverFetch<ViewRow[]>("/api/views/v_api_provider_daily"),
    serverFetch<ViewRow[]>("/api/views/v_api_endpoint_efficiency"),
    serverFetch<ViewRow[]>("/api/views/v_snapshot_trigger_daily"),
    serverFetch<ViewRow[]>("/api/views/v_candidate_reject_reason_daily"),
    serverFetch<ViewRow[]>("/api/views/v_runtime_settings_current"),
    serverFetch<ViewRow[]>("/api/views/v_candidate_latest_filter_state"),
  ]);

  const providerCalls = providerDaily.reduce((sum, row) => sum + Number(row.total_calls ?? 0), 0);
  const providerErrors = providerDaily.reduce((sum, row) => sum + Number(row.error_count ?? 0), 0);
  const snapshotCount = snapshotTriggers.reduce((sum, row) => sum + Number(row.snapshot_count ?? 0), 0);
  const rejectedCandidates = rejectReasons.reduce((sum, row) => sum + Number(row.candidate_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Telemetry desk"
        title="Provider spend, trigger shape, and live config without rummaging through logs"
        description="This page exists so the overview can stay operational. Cost, failure, trigger mix, and current runtime configuration are all here before you graduate the analysis to Grafana."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Provider calls" value={formatInteger(providerCalls)} detail={`${formatInteger(providerErrors)} errors in the period`} tone="accent" icon={RadioTower} />
        <StatCard label="Snapshot rows" value={formatInteger(snapshotCount)} detail="Trigger volume across the snapshot view" tone="success" icon={ActivitySquare} />
        <StatCard label="Reject count" value={formatInteger(rejectedCandidates)} detail="Candidate rejects in the daily view" tone="warning" icon={Gauge} />
        <StatCard label="Runtime config rows" value={formatInteger(settings.length)} detail="Current persisted settings surface" tone="default" icon={SlidersHorizontal} />
      </section>

      <section className="grid gap-6 2xl:grid-cols-2">
        <DataTable
          title="Provider daily"
          eyebrow="Spend by provider"
          rows={providerDaily}
          preferredKeys={["session_date", "provider", "total_calls", "total_units", "avg_latency_ms", "error_count"]}
          emptyTitle="No provider daily rows yet"
          emptyDetail="The provider daily view has no rows for the selected period yet."
        />
        <DataTable
          title="Endpoint efficiency"
          eyebrow="Which endpoints are burning the budget"
          rows={endpointEfficiency}
          preferredKeys={["provider", "endpoint", "total_calls", "total_units", "avg_latency_ms", "error_count", "last_called_at"]}
          emptyTitle="No endpoint rows yet"
          emptyDetail="The endpoint efficiency view has not recorded any provider calls yet."
        />
      </section>

      <section className="grid gap-6 2xl:grid-cols-2">
        <DataTable
          title="Snapshot trigger mix"
          eyebrow="Why snapshot rows exist"
          rows={snapshotTriggers}
          preferredKeys={["session_date", "trigger", "snapshot_count", "unique_tokens", "avg_liquidity_usd", "avg_buy_sell_ratio"]}
          emptyTitle="No trigger rows yet"
          emptyDetail="Snapshot trigger history appears here once capture points start accumulating."
        />
        <DataTable
          title="Reject reason daily"
          eyebrow="How the bot is saying no"
          rows={rejectReasons}
          preferredKeys={["session_date", "reject_reason", "candidate_count"]}
          emptyTitle="No reject rows yet"
          emptyDetail="No reject-reason aggregates are available yet."
        />
      </section>

      <DataTable
        title="Latest candidate filter state"
        eyebrow="Current filter spine"
        rows={candidateState}
        preferredKeys={["symbol", "status", "liquidity_usd", "volume_5m_usd", "buy_sell_ratio", "price_change_5m_percent", "top10_holder_percent", "largest_holder_percent"]}
        emptyTitle="No candidate state rows yet"
        emptyDetail="The candidate latest filter state view has no rows yet."
      />

      <DataTable
        title="Runtime settings current"
        eyebrow="Persisted runtime config"
        rows={settings}
        preferredKeys={["trade_mode", "capital_usd", "position_size_usd", "max_open_positions", "min_liquidity_usd", "tp1_multiplier", "trailing_stop_percent"]}
        emptyTitle="No runtime settings rows yet"
        emptyDetail="The runtime settings view should usually have one row. If it doesn't, the config pipeline needs attention."
      />
    </div>
  );
}
