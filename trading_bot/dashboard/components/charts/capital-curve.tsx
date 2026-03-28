"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chartColors } from "@/lib/chart-colors";
import { capitalCurveQueryOptions } from "@/lib/dashboard-query-options";
import type { TradeMode } from "@/lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function CapitalCurveChart({
  days = 30,
  mode,
  profile,
}: {
  days?: number;
  mode?: TradeMode | null;
  profile?: string | null;
}) {
  const { data: curve } = useQuery(capitalCurveQueryOptions(days, mode, profile));

  const chartData = useMemo(() => (curve ?? []).map((p) => ({
    date: new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    capital: p.capital,
    pnl: p.cumulativePnl,
  })), [curve]);

  if (chartData.length === 0) {
    return <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data yet</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="capitalGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColors.capital} stopOpacity={0.28} />
            <stop offset="95%" stopColor={chartColors.capital} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          wrapperStyle={{
            background: chartColors.tooltipBg,
            border: `1px solid ${chartColors.tooltipBorder}`,
            borderRadius: "8px",
          }}
          itemStyle={{ color: chartColors.tooltipText, fontSize: 12 }}
          labelStyle={{ color: chartColors.tooltipText, fontSize: 12 }}
          formatter={(value, name) => [
            `$${(Number(value) || 0).toFixed(2)}`,
            name === "capital" ? "Capital" : "Cum. P&L",
          ]}
        />
        <Area
          type="monotone"
          dataKey="capital"
          stroke={chartColors.capital}
          fill="url(#capitalGradient)"
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
