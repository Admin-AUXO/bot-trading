import { CandlestickChart, DatabaseZap, ShieldAlert, TriangleAlert } from "lucide-react";
import { DataTable, PageHero, StatCard } from "@/components/dashboard-primitives";
import { serverFetch } from "@/lib/api";
import { formatInteger } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const [candidates, snapshots, payloads] = await Promise.all([
    serverFetch<Array<Record<string, unknown>>>("/api/views/v_candidate_latest_filter_state"),
    serverFetch<Array<Record<string, unknown>>>("/api/snapshots?limit=120"),
    serverFetch<Array<Record<string, unknown>>>("/api/provider-payloads?limit=120"),
  ]);

  const promoted = candidates.filter((row) => row.status === "ACCEPTED" || row.status === "BOUGHT").length;
  const rejected = candidates.filter((row) => row.status === "REJECTED").length;
  const errorCount = candidates.filter((row) => row.status === "ERROR").length;
  const payloadErrors = payloads.filter((row) => row.success === false).length;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Candidate archaeology"
        title="Signal review without replaying the whole session in your head"
        description="Candidates, normalized snapshots, and raw provider payloads sit side by side here so you can inspect why the bot promoted a token, rejected it, or tripped over a provider response."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total candidates" value={formatInteger(candidates.length)} detail="Recent candidate state rows" tone="accent" icon={CandlestickChart} />
        <StatCard label="Promoted" value={formatInteger(promoted)} detail="Accepted or bought" tone="success" icon={ShieldAlert} />
        <StatCard label="Rejected" value={formatInteger(rejected)} detail="Failed validation" tone="warning" icon={TriangleAlert} />
        <StatCard label="Payload errors" value={formatInteger(payloadErrors)} detail={`${formatInteger(errorCount)} candidate errors logged`} tone={payloadErrors > 0 ? "danger" : "default"} icon={DatabaseZap} />
      </section>

      <DataTable
        title="Candidates"
        eyebrow="Latest filter state"
        rows={candidates}
        preferredKeys={["symbol", "status", "source", "liquidity_usd", "volume_5m_usd", "buy_sell_ratio", "top10_holder_percent", "reject_reason", "discovered_at"]}
        emptyTitle="No candidate rows yet"
        emptyDetail="Discovery has not written candidate-state rows yet, so there is nothing to audit."
      />

      <section className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <DataTable
          title="Token snapshots"
          eyebrow="Recent capture points"
          rows={snapshots}
          preferredKeys={["symbol", "trigger", "priceUsd", "liquidityUsd", "volume5mUsd", "buySellRatio", "top10HolderPercent", "capturedAt"]}
          maxRows={30}
          emptyTitle="No snapshots yet"
          emptyDetail="Once discovery or trade events land, snapshots appear here with the normalized filter state."
        />
        <DataTable
          title="Recent provider payloads"
          eyebrow="What the providers actually said"
          rows={payloads.slice(0, 20)}
          preferredKeys={["provider", "endpoint", "success", "entityKey", "capturedAt", "errorMessage"]}
          emptyTitle="No raw payload rows yet"
          emptyDetail="Provider payload persistence is on, but no recent payloads are available in the API response."
        />
      </section>
    </div>
  );
}
