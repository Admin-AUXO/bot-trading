"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCapitalCurve } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export function CapitalCurveChart() {
  const { mode } = useDashboardStore();

  const { data: curve } = useQuery({
    queryKey: ["capital-curve", mode],
    queryFn: () => fetchCapitalCurve(mode),
    refetchInterval: 60000,
  });

  if (!curve || curve.length === 0) {
    return <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data yet</div>;
  }

  const chartData = useMemo(() => curve.map((p) => ({
    date: new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    capital: p.capital,
    pnl: p.cumulativePnl,
  })), [curve]);

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="capitalGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: "#71717a", fontSize: 10 }}
          axisLine={{ stroke: "#242433" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          wrapperStyle={{ background: "#16161f", border: "1px solid #242433", borderRadius: "8px" }}
          itemStyle={{ color: "#e4e4e7", fontSize: 12 }}
          labelStyle={{ color: "#e4e4e7", fontSize: 12 }}
          formatter={(value, name) => [
            `$${(Number(value) || 0).toFixed(2)}`,
            name === "capital" ? "Capital" : "Cum. P&L",
          ]}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="capital"
          stroke="#3b82f6"
          fill="url(#capitalGradient)"
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
