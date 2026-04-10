import { ArrowUpDown, CircleDollarSign, TimerReset, Wallet } from "lucide-react";
import { DataTable, PageHero, StatCard } from "@/components/dashboard-primitives";
import { serverFetch } from "@/lib/api";
import { formatCompactCurrency, formatInteger } from "@/lib/format";
import type { ViewRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const [positions, fills, performance] = await Promise.all([
    serverFetch<Array<Record<string, unknown>>>("/api/positions?limit=120"),
    serverFetch<Array<Record<string, unknown>>>("/api/fills?limit=200"),
    serverFetch<ViewRow[]>("/api/views/v_position_performance"),
  ]);

  const openCount = positions.filter((row) => row.status === "OPEN").length;
  const closedCount = positions.filter((row) => row.status === "CLOSED").length;
  const realizedUsd = performance.reduce((sum, row) => sum + Number(row.realized_pnl_usd ?? 0), 0);
  const avgHoldMinutes = performance.length
    ? performance.reduce((sum, row) => sum + Number(row.hold_minutes ?? 0), 0) / performance.length
    : 0;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Exposure desk"
        title="Open risk, fill trail, and realized edge in one lane"
        description="This page is the position book. It tells you what is still carrying risk, what has already exited, and what the fill trail says about realized performance."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open positions" value={formatInteger(openCount)} detail="Still carrying risk" tone="success" icon={Wallet} />
        <StatCard label="Closed positions" value={formatInteger(closedCount)} detail="Fully exited" tone="default" icon={ArrowUpDown} />
        <StatCard label="Realized PnL" value={formatCompactCurrency(realizedUsd)} detail="From position performance view" tone={realizedUsd >= 0 ? "success" : "danger"} icon={CircleDollarSign} />
        <StatCard label="Average hold" value={`${avgHoldMinutes.toFixed(1)} min`} detail={`${formatInteger(fills.length)} recent fills on record`} tone="accent" icon={TimerReset} />
      </section>

      <DataTable
        title="Positions"
        eyebrow="Current book"
        rows={positions}
        preferredKeys={["symbol", "status", "entryPriceUsd", "currentPriceUsd", "remainingToken", "openedAt", "closedAt", "exitReason"]}
        emptyTitle="No positions yet"
        emptyDetail="The runtime has not opened any dry-run positions yet, so the book is empty."
      />

      <section className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
        <DataTable
          title="Fills"
          eyebrow="Trade trail"
          rows={fills}
          preferredKeys={["side", "priceUsd", "amountUsd", "amountToken", "pnlUsd", "createdAt", "positionId"]}
          emptyTitle="No fills yet"
          emptyDetail="No buy or sell fills have been written yet."
        />
        <DataTable
          title="Performance view"
          eyebrow="Realized edge"
          rows={performance}
          preferredKeys={["symbol", "status", "realized_pnl_usd", "realized_pnl_pct", "hold_minutes", "gross_exit_usd", "exit_reason"]}
          emptyTitle="No performance rows yet"
          emptyDetail="The performance view has no rows yet because nothing has been bought and sold through the desk."
        />
      </section>
    </div>
  );
}
