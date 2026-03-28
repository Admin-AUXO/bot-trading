"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chartColors } from "@/lib/chart-colors";
import { dailyStatsQueryOptions, overviewQueryOptions } from "@/lib/dashboard-query-options";
import type { TradeMode } from "@/lib/api";
import {
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Line,
  ComposedChart,
} from "recharts";

export function PnlChart({
  days = 30,
  mode,
  profile,
  dailyLossLimit,
}: {
  days?: number;
  mode?: TradeMode | null;
  profile?: string | null;
  dailyLossLimit?: number;
}) {
  const { data: stats } = useQuery(dailyStatsQueryOptions(days, mode, profile));
  const { data: overview } = useQuery(overviewQueryOptions());

  const filtered = (stats ?? []).filter((s) => s.strategy === null);
  const lossGuardrail = dailyLossLimit ?? overview?.dailyLossLimit ?? 10;

  const chartData = useMemo(() => filtered.map((s, i) => {
    const d = new Date(s.date);
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    const start = Math.max(0, i - 6);
    const window = filtered.slice(start, i + 1);
    const ma7 = window.reduce((sum, x) => sum + x.netPnlUsd, 0) / window.length;

    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      day: dayName,
      pnl: s.netPnlUsd,
      trades: s.tradesTotal,
      winRate: s.winRate,
      ma7,
    };
  }), [filtered]);

  if (chartData.length === 0) {
    return <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data yet</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: chartColors.muted, fontSize: 10 }}
          axisLine={{ stroke: chartColors.gridLine }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: chartColors.muted, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div
                className="rounded-lg border p-2 text-xs"
                style={{
                  background: chartColors.tooltipBg,
                  borderColor: chartColors.tooltipBorder,
                  color: chartColors.tooltipText,
                }}
              >
                <div className="font-medium">{d.date} ({d.day})</div>
                <div className={d.pnl >= 0 ? "text-accent-green" : "text-accent-red"}>
                  P&L: ${d.pnl.toFixed(2)}
                </div>
                <div className="text-text-muted">{d.trades} trades</div>
                {d.winRate > 0 && (
                  <div className="text-text-muted">Win rate: {(d.winRate * 100).toFixed(0)}%</div>
                )}
              </div>
            );
          }}
        />
        <ReferenceLine y={0} stroke={chartColors.gridLine} />
        <ReferenceLine y={-lossGuardrail} stroke={chartColors.loss} strokeDasharray="4 4" strokeOpacity={0.55} />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {chartData.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.pnl >= 0 ? chartColors.win : chartColors.loss}
              fillOpacity={0.8}
            />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="ma7"
          stroke={chartColors.neutral}
          strokeWidth={1.5}
          dot={false}
          strokeOpacity={0.6}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
