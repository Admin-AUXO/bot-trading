import type { DiscoveryLabRunDetail } from "@/lib/types";

export type WorkbenchRunOutcome = "WINNER" | "PASS" | "REJECTED";

export type WorkbenchRunResultRow = {
  id: string;
  symbol: string;
  mint: string;
  outcome: WorkbenchRunOutcome;
  outcomeRank: number;
  winner: "Yes" | "No";
  recipeName: string;
  source: string;
  playScore: number | null;
  entryScore: number | null;
  suggestedCapitalUsd: number | null;
  liquidityUsd: number | null;
  volume5mUsd: number | null;
  buySellRatio: number | null;
  marketCapUsd: number | null;
  timeSinceGraduationMin: number | null;
  profile: string | null;
  grade: string;
  primaryReason: string;
  notes: string | null;
  rejectReason: string | null;
};

export type WorkbenchRunOutcomeSummary = {
  total: number;
  winners: number;
  passes: number;
  rejected: number;
};

export function buildWorkbenchRunResultRows(run: DiscoveryLabRunDetail): WorkbenchRunResultRow[] {
  const report = run.report;
  if (!report) {
    return [];
  }

  const winners = new Map(report.winners.map((winner) => [winner.address, winner]));
  const rowsByMint = new Map<string, WorkbenchRunResultRow>();

  for (const evaluation of report.deepEvaluations) {
    const existingScore = rowsByMint.get(evaluation.mint)?.playScore ?? -Infinity;
    if ((evaluation.playScore ?? -Infinity) < existingScore) {
      continue;
    }

    const winner = winners.get(evaluation.mint);
    const outcome: WorkbenchRunOutcome = winner ? "WINNER" : evaluation.pass ? "PASS" : "REJECTED";
    const noteParts = [...evaluation.softIssues.slice(0, 2), ...evaluation.notes.slice(0, 2)].filter(Boolean);
    const primaryReason = outcome === "WINNER"
      ? noteParts[0] ?? "Winner-selected token from this run."
      : outcome === "PASS"
        ? noteParts[0] ?? "Passed thresholds but did not land in the winner set."
        : evaluation.rejectReason ?? noteParts[0] ?? "Rejected during evaluation.";

    rowsByMint.set(evaluation.mint, {
      id: evaluation.mint,
      symbol: evaluation.symbol,
      mint: evaluation.mint,
      outcome,
      outcomeRank: outcome === "WINNER" ? 2 : outcome === "PASS" ? 1 : 0,
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
      primaryReason,
      notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
      rejectReason: evaluation.rejectReason,
    });
  }

  return [...rowsByMint.values()].sort((left, right) => {
    if (right.outcomeRank !== left.outcomeRank) {
      return right.outcomeRank - left.outcomeRank;
    }
    return Number(right.playScore ?? -Infinity) - Number(left.playScore ?? -Infinity);
  });
}

export function summarizeWorkbenchRunResults(rows: WorkbenchRunResultRow[]): WorkbenchRunOutcomeSummary {
  return rows.reduce<WorkbenchRunOutcomeSummary>((summary, row) => {
    summary.total += 1;
    if (row.outcome === "WINNER") {
      summary.winners += 1;
    } else if (row.outcome === "PASS") {
      summary.passes += 1;
    } else {
      summary.rejected += 1;
    }
    return summary;
  }, { total: 0, winners: 0, passes: 0, rejected: 0 });
}

function round(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}
