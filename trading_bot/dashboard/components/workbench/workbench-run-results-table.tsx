import { AgGridTable } from "@/components/ag-grid-table";
import type { DiscoveryLabRunDetail } from "@/lib/types";

type RunResultRow = Record<string, string | number | null>;

export function WorkbenchRunResultsTable(props: {
  run: DiscoveryLabRunDetail;
  heightClassName?: string;
}) {
  const report = props.run.report;
  if (!report) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/20 px-4 py-4 text-sm text-text-secondary">
        No persisted report yet. This run has summary metadata, but no token board to review.
      </div>
    );
  }

  const rows = buildResultRows(props.run);
  if (rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/20 px-4 py-4 text-sm text-text-secondary">
        The report exists, but it did not persist any deep-evaluation rows.
      </div>
    );
  }

  return (
    <AgGridTable
      rows={rows}
      preferredKeys={[
        "symbol",
        "status",
        "recipeName",
        "source",
        "playScore",
        "entryScore",
        "winner",
        "suggestedCapitalUsd",
        "liquidityUsd",
        "volume5mUsd",
        "buySellRatio",
        "marketCapUsd",
        "timeSinceGraduationMin",
        "notes",
      ]}
      emptyTitle="No result rows"
      emptyDetail="The report did not include any token-level evaluation rows."
      heightClassName={props.heightClassName ?? "h-[28rem]"}
      pageSize={18}
    />
  );
}

function buildResultRows(run: DiscoveryLabRunDetail): RunResultRow[] {
  const report = run.report;
  if (!report) {
    return [];
  }

  const winners = new Map(report.winners.map((winner) => [winner.address, winner]));
  const rowsByMint = new Map<string, RunResultRow>();

  for (const evaluation of report.deepEvaluations) {
    const existingScore = typeof rowsByMint.get(evaluation.mint)?.playScore === "number"
      ? Number(rowsByMint.get(evaluation.mint)?.playScore)
      : -Infinity;
    if ((evaluation.playScore ?? -Infinity) < existingScore) {
      continue;
    }

    const winner = winners.get(evaluation.mint);
    const noteParts = [...evaluation.softIssues.slice(0, 2), ...evaluation.notes.slice(0, 2)].filter(Boolean);

    rowsByMint.set(evaluation.mint, {
      id: evaluation.mint,
      symbol: evaluation.symbol,
      mint: evaluation.mint,
      status: winner ? "PASS" : evaluation.pass ? "PASS" : "REJECT",
      winner: winner ? "Yes" : "No",
      recipeName: evaluation.recipeName,
      source: evaluation.source,
      playScore: round(evaluation.playScore),
      entryScore: round(evaluation.entryScore),
      suggestedCapitalUsd: round(evaluation.tradeSetup?.suggestedCapitalUsd ?? null),
      liquidityUsd: round(evaluation.liquidityUsd),
      volume5mUsd: round(evaluation.volume5mUsd),
      buySellRatio: round(evaluation.buySellRatio),
      marketCapUsd: round(evaluation.marketCapUsd),
      timeSinceGraduationMin: round(evaluation.timeSinceGraduationMin),
      profile: evaluation.tradeSetup?.profile ?? null,
      grade: evaluation.grade,
      notes: noteParts.length > 0 ? noteParts.join(" | ") : evaluation.rejectReason,
    });
  }

  return [...rowsByMint.values()].sort((left, right) => {
    const leftWinner = left.winner === "Yes" ? 1 : 0;
    const rightWinner = right.winner === "Yes" ? 1 : 0;
    if (rightWinner !== leftWinner) return rightWinner - leftWinner;

    const leftPass = left.status === "PASS" ? 1 : 0;
    const rightPass = right.status === "PASS" ? 1 : 0;
    if (rightPass !== leftPass) return rightPass - leftPass;

    return Number(right.playScore ?? -Infinity) - Number(left.playScore ?? -Infinity);
  });
}

function round(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}
