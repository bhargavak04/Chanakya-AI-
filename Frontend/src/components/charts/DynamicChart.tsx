"use client";

import React from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { ChartConfig } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CHART_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
  padding: "8px 12px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
};

const axisStyle = {
  fill: "var(--muted-foreground)",
  fontSize: 10,
};

function formatAxisTick(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T[\d:.]+Z?$/);
  if (m) {
    const [, y, mo, d] = m;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(mo!, 10) - 1]} ${d}`;
  }
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (d) {
    const [, y, mo, day] = d;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(mo!, 10) - 1]} ${day}`;
  }
  return s.length > 12 ? `${s.slice(0, 10)}…` : s;
}

interface DynamicChartProps {
  data: Record<string, unknown>[];
  config: ChartConfig;
  className?: string;
}

export function DynamicChart({ data, config, className = "" }: DynamicChartProps) {
  const { type, x_axis, y_axis, group_by } = config;

  if (type === "table") {
    const formatCell = (v: unknown): string => {
      if (v == null) return "—";
      const s = String(v);
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T[\d:.]+Z?$/);
      if (m) {
        const [, , mo, d] = m;
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[parseInt(mo!, 10) - 1]} ${d}, ${s.slice(11, 19)}`;
      }
      const d2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (d2) {
        const [, , mo, day] = d2;
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[parseInt(mo!, 10) - 1]} ${day}`;
      }
      return s;
    };
    return (
      <div className={`w-full overflow-x-auto ${className}`}>
        <Table>
          <TableHeader>
            <TableRow>
              {data[0]
                ? Object.keys(data[0]).map((k) => (
                    <TableHead key={k} className="text-xs">
                      {k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </TableHead>
                  ))
                : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 50).map((row, i) => (
              <TableRow key={i}>
                {Object.values(row).map((v, j) => (
                  <TableCell key={j} className="text-xs py-1.5">
                    {formatCell(v)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No data to display
      </div>
    );
  }

  const keys = Object.keys(data[0] ?? {});
  const findKey = (name: string) => keys.find((k) => k === name || k.toLowerCase() === name.toLowerCase());
  const xKey = findKey(x_axis) ?? keys[0] ?? "x";
  const matchedY = y_axis.map((k) => findKey(k)).filter(Boolean) as string[];
  const yKeys = matchedY.length > 0 ? matchedY : keys.filter((k) => k !== xKey).slice(0, 3);

  // Normalize data for line/area: ensure y-axis values are numbers to prevent scale clipping
  const isLineOrArea = type === "line" || type === "area";
  const chartData = isLineOrArea
    ? data.map((row) => {
        const out: Record<string, unknown> = { ...row };
        for (const k of yKeys) {
          const v = row[k];
          out[k] = typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
        }
        return out;
      })
    : data;

  // Explicit domain for line/area to prevent y-axis clipping (Recharts can clip with string values or auto domain)
  const yDomain: [number, number] | undefined = isLineOrArea
    ? (() => {
        let max = 0;
        for (const row of chartData) {
          for (const k of yKeys) {
            const v = Number(row[k]);
            if (!Number.isNaN(v) && v > max) max = v;
          }
        }
        const top = max > 0 ? max * 1.05 : 1;
        return [0, top];
      })()
    : undefined;

  if (type === "pie") {
    const formatLabel = (k: string) =>
      k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    let pieData: { name: string; value: number }[];
    if (data.length === 1 && yKeys.length > 0) {
      const row = data[0];
      pieData = yKeys
        .map((k) => ({ name: formatLabel(k), value: Number(row?.[k]) || 0 }))
        .filter((d) => d.value > 0);
    } else {
      const nameKey = group_by?.[0] ?? xKey;
      const valueKey = yKeys[0] ?? "value";
      pieData = data.map((r) => ({
        name: String(r[nameKey] ?? r[xKey] ?? ""),
        value: Number(r[valueKey]) || 0,
      })).filter((d) => d.value > 0);
    }
    if (pieData.length === 0) pieData = [{ name: "No data", value: 1 }];

    const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
      if (!active || !payload?.length) return null;
      const p = payload[0].payload;
      return (
        <div style={tooltipStyle}>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div style={{ opacity: 0.9, marginTop: 2 }}>{Number(p.value).toLocaleString()}</div>
        </div>
      );
    };

    return (
      <ResponsiveContainer width="100%" height={200} className={className}>
        <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="var(--background)" strokeWidth={1} />
            ))}
            <LabelList
              dataKey="name"
              position="outside"
              fill="var(--foreground)"
              fontSize={11}
              stroke="none"
            />
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const chartMargin = { top: 10, right: 10, left: 0, bottom: 0 };

  const commonProps = {
    data: chartData,
    margin: chartMargin,
    style: { minHeight: 200 },
  };

  const gridStyle = { strokeDasharray: "3 3", stroke: "var(--border)", opacity: 0.5 };

  return (
    <div className={`h-[200px] w-full ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        {type === "area" ? (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="dynamicAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={axisStyle} dy={10} tickFormatter={formatAxisTick} />
            <YAxis hide domain={yDomain} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--primary)" }} />
            {yKeys.map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#dynamicAreaGrad)"
                connectNulls
              />
            ))}
          </AreaChart>
        ) : type === "bar" ? (
          <BarChart {...commonProps}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={axisStyle} dy={10} tickFormatter={formatAxisTick} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--secondary)", opacity: 0.5 }} />
            {yKeys.map((key) => (
              <Bar key={key} dataKey={key} fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={24} />
            ))}
          </BarChart>
        ) : (
          <LineChart {...commonProps}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={axisStyle} dy={10} tickFormatter={formatAxisTick} />
            <YAxis hide domain={yDomain} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--primary)" }} />
            {yKeys.map((key) => (
              <Line key={key} type="monotone" dataKey={key} stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
