"use client";

import { ExternalLink, Trophy } from "lucide-react";
import type { DiscoveryLabRunDetail, DiscoveryLabRunReport } from "@/lib/types";
import { StatusPill } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCompactCurrency, formatInteger, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/components/ui/cn";

type TokenBoardRow = {
  mint: string;
  symbol: string;
  source: string;
  recipe: string;
  passed: boolean;
  grade: string;
  playScore: number;
  entryScore: number;
  liquidityUsd: number | null;
  volume5mUsd: number | null;
  priceChange5mPercent: number | null;
  top10HolderPercent: number | null;
  timeSinceGraduationMin: number | null;
  rejectReason: string | null;
};

interface ResultsDisplayProps {
  report: DiscoveryLabRunReport | null;
  completedRunDetail: DiscoveryLabRunDetail | null;
  isPending: boolean;
  onApplyLiveStrategy: () => void;
  selectedRunId: string;
  onSelectRun: (runId: string) => void;
  recentRuns: Array<{
    id: string;
    status: string;
    packName: string;
    evaluationCount: number | null;
    winnerCount: number | null;
  }>;
}

export function ResultsDisplay({
  report,
  completedRunDetail,
  isPending,
  onApplyLiveStrategy,
  selectedRunId,
  onSelectRun,
  recentRuns,
}: ResultsDisplayProps) {
  const tokenRows = buildTokenRows(report);

  return (
    <div className="space-y-4">
      <ResultsTable
        tokenRows={tokenRows}
        completedRunDetail={completedRunDetail}
        isPending={isPending}
        onApplyLiveStrategy={onApplyLiveStrategy}
      />
      <RecentRunsList
        runs={recentRuns}
        selectedRunId={selectedRunId}
        onSelectRun={onSelectRun}
      />
    </div>
  );
}

interface ResultsTableProps {
  tokenRows: TokenBoardRow[];
  completedRunDetail: DiscoveryLabRunDetail | null;
  isPending: boolean;
  onApplyLiveStrategy: () => void;
}

function ResultsTable({ tokenRows, completedRunDetail, isPending, onApplyLiveStrategy }: ResultsTableProps) {
  if (tokenRows.length === 0) {
    return (
      <Card className="border-[#2a2a35] bg-[#111318]">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Trophy className="h-12 w-12 text-text-muted mb-4" />
          <p className="text-text-secondary">No results yet</p>
          <p className="text-xs text-text-muted mt-1">Run a pack to see token results</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#2a2a35] bg-[#111318]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{tokenRows.length} Tokens</CardTitle>
            <CardDescription className="text-xs">
              {tokenRows.filter(r => r.passed).length} passed · {completedRunDetail?.winnerCount ?? 0} winners
            </CardDescription>
          </div>
          {completedRunDetail?.strategyCalibration && (
            <Button size="sm" onClick={onApplyLiveStrategy} disabled={isPending}>
              <PlayCircleIcon className="h-4 w-4 mr-1" />
              Apply to Live
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#111318]">
              <tr className="border-b border-[#2a2a35]">
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Token</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Status</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Liquidity</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Vol 5m</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Chg 5m</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Score</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {tokenRows.slice(0, 50).map(row => (
                <tr key={row.mint} className="border-b border-[#1f1f28] hover:bg-[#1a1a22]">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">{row.symbol}</span>
                      <span className="text-xs text-text-muted">{truncateMiddle(row.mint, 4, 3)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Badge variant={row.passed ? "accent" : "danger"} className="text-[10px]">{row.passed ? "PASS" : "FAIL"}</Badge>
                      <Badge variant="default" className="text-[10px]">{row.grade}</Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {row.liquidityUsd !== null ? formatCompactCurrency(row.liquidityUsd) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {row.volume5mUsd !== null ? formatCompactCurrency(row.volume5mUsd) : "—"}
                  </td>
                  <td className={cn("px-3 py-2 text-right", (row.priceChange5mPercent ?? 0) >= 0 ? "text-[#10b981]" : "text-[#f43f5e]")}>
                    {row.priceChange5mPercent !== null ? formatPercent(row.priceChange5mPercent) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-accent">
                    {formatNumber(row.playScore)}
                  </td>
                  <td className="px-3 py-2">
                    <a href={`https://dexscreener.com/solana/${row.mint}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex p-1 text-text-muted hover:text-text-primary">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PlayCircleIcon({ className }: { className?: string }) {
  return <PlayCircle className={className} />;
}

interface RecentRunsListProps {
  runs: Array<{
    id: string;
    status: string;
    packName: string;
    evaluationCount: number | null;
    winnerCount: number | null;
  }>;
  selectedRunId: string;
  onSelectRun: (runId: string) => void;
}

function RecentRunsList({ runs, selectedRunId, onSelectRun }: RecentRunsListProps) {
  return (
    <Card className="border-[#2a2a35] bg-[#111318]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Recent Runs</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[200px] overflow-auto">
          {runs.slice(0, 10).map(run => (
            <button
              key={run.id}
              type="button"
              onClick={() => onSelectRun(run.id)}
              className={cn(
                "flex w-full items-center justify-between border-b border-[#1f1f28] px-3 py-2 text-left transition-colors hover:bg-[#1a1a22]",
                selectedRunId === run.id && "bg-accent/5"
              )}
            >
              <div className="flex items-center gap-2">
                <StatusPill value={run.status} />
                <span className="text-xs text-text-primary">{run.packName}</span>
              </div>
              <span className="text-[10px] text-text-muted">
                {run.evaluationCount !== null ? `${formatInteger(run.evaluationCount)}` : ""} evals
                {run.winnerCount !== null ? ` · ${formatInteger(run.winnerCount)} won` : ""}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function buildTokenRows(report: DiscoveryLabRunReport | null): TokenBoardRow[] {
  if (!report) return [];
  const byMint = new Map<string, TokenBoardRow>();
  for (const eval_ of report.deepEvaluations) {
    const existing = byMint.get(eval_.mint);
    if (!existing || eval_.playScore > existing.playScore) {
      byMint.set(eval_.mint, {
        mint: eval_.mint,
        symbol: eval_.symbol,
        source: eval_.source,
        recipe: eval_.recipeName,
        passed: eval_.pass,
        grade: eval_.grade,
        playScore: eval_.playScore,
        entryScore: eval_.entryScore,
        liquidityUsd: eval_.liquidityUsd,
        volume5mUsd: eval_.volume5mUsd,
        priceChange5mPercent: eval_.priceChange5mPercent,
        top10HolderPercent: eval_.top10HolderPercent,
        timeSinceGraduationMin: eval_.timeSinceGraduationMin,
        rejectReason: eval_.rejectReason,
      });
    }
  }
  return Array.from(byMint.values());
}

function truncateMiddle(str: string, start: number, end: number): string {
  if (str.length <= start + end + 3) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
}

import { PlayCircle } from "lucide-react";
