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
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Legend,
  ReferenceLine,
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

const CURRENCY_PATTERNS: { pattern: RegExp; symbol: string }[] = [
  { pattern: /\b(usd|dollar|us_dollar)\b/i, symbol: "$" },
  { pattern: /\b(eur|euro)\b/i, symbol: "€" },
  { pattern: /\b(gbp|pound)\b/i, symbol: "£" },
  {
    pattern:
      /\b(inr|rupee|rs|amount|revenue|price|cost|salary|income|profit|fee|payment|balance|total|value)\b/i,
    symbol: "₹",
  },
];

function detectCurrencySymbol(columnName: string): string | null {
  const lower = columnName.toLowerCase();
  for (const { pattern, symbol } of CURRENCY_PATTERNS) {
    if (pattern.test(lower)) return symbol;
  }
  return null;
}

/** Format numbers for chart labels/tooltips: compact above 5 digits, currency prefix when applicable */
function formatChartValue(value: unknown, columnName?: string): string {
  if (value == null) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);

  const symbol = columnName ? detectCurrencySymbol(columnName) : null;
  const prefix = symbol ?? "";

  const abs = Math.abs(num);
  if (abs >= 1e9) return `${prefix}${(num / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${prefix}${(num / 1e6).toFixed(2)}M`;
  if (abs >= 10000) return `${prefix}${(num / 1000).toFixed(2)}K`;
  if (Number.isInteger(num)) return `${prefix}${num.toLocaleString()}`;
  return `${prefix}${num.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}

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
  /** When true, show Y-axis scale labels. Default false; enable via Customize. */
  showYAxis?: boolean;
  /** When true, use larger height and margins (for report export to avoid clipping) */
  reportMode?: boolean;
}

export function DynamicChart({ data, config, className = "", showYAxis = false, reportMode = false }: DynamicChartProps) {
  const { type, x_axis, y_axis, group_by, stacked, y_axis_right, reference_line } = config;
  const hideY = !showYAxis;
  const chartHeight = reportMode ? 340 : 200;

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
  const matchedYRight = (y_axis_right ?? []).map((k) => findKey(k)).filter(Boolean) as string[];
  const yKeysRight = matchedYRight.filter((k) => !yKeys.includes(k));
  const formatLabel = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const formatYAxisTick = (v: number, keys: string[]) =>
    formatChartValue(v, keys[0]);

  // Bar with group_by: pivot so each group value becomes a series (colored bar with legend)
  const groupKey = group_by?.[0] ? findKey(group_by[0]) : null;
  const useGroupedBars = type === "bar" && groupKey && yKeys.length > 0;
  // Bar with single row + multiple metrics: pivot so each metric is a bar with a label (fixes x-axis showing raw numbers)
  const useComparisonBars = type === "bar" && !useGroupedBars && data.length === 1 && yKeys.length > 1;
  let barChartData: Record<string, unknown>[] = data;
  let barSeriesKeys: string[] = yKeys;
  let barXKey = xKey;

  if (useComparisonBars) {
    const row = data[0];
    barChartData = yKeys.map((k) => ({ name: formatLabel(k), value: Number(row?.[k]) ?? 0, _column: k }));
    barSeriesKeys = ["value"];
    barXKey = "name";
  } else if (useGroupedBars) {
    const valueKey = yKeys[0];
    const groupValues = [...new Set(data.map((r) => String(r[groupKey!] ?? "").trim()))].filter(Boolean);
    if (groupValues.length > 0) {
      const xValues = [...new Set(data.map((r) => r[xKey]))];
      barChartData = xValues.map((xVal) => {
        const out: Record<string, unknown> = { [xKey]: xVal };
        for (const gv of groupValues) {
          const rows = data.filter(
            (r) => r[xKey] === xVal && String(r[groupKey!] ?? "").trim() === gv
          );
          const val = rows.length
            ? rows.reduce((sum, r) => sum + (Number(r[valueKey]) || 0), 0)
            : 0;
          out[gv] = val;
        }
        return out;
      });
      barSeriesKeys = groupValues;
    }
  }

  // Normalize data for line/area/scatter: ensure y-axis values are numbers
  const isLineOrArea = type === "line" || type === "area";
  const isScatter = type === "scatter";
  const allYKeys = [...yKeys, ...yKeysRight];
  const chartData =
    isLineOrArea || isScatter
      ? data.map((row) => {
          const out: Record<string, unknown> = { ...row };
          for (const k of allYKeys) {
            const v = row[k];
            out[k] = typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
          }
          return out;
        })
      : data;

  const calcDomain = (keys: string[]) => {
    let max = 0;
    for (const row of chartData) {
      for (const k of keys) {
        const v = Number(row[k]);
        if (!Number.isNaN(v) && v > max) max = v;
      }
    }
    return max > 0 ? ([0, max * 1.05] as [number, number]) : undefined;
  };
  const yDomain = isLineOrArea || isScatter ? calcDomain(yKeys) : undefined;
  const yDomainRight = (isLineOrArea || isScatter) && yKeysRight.length > 0 ? calcDomain(yKeysRight) : undefined;

  if (type === "pie") {
    let pieData: { name: string; value: number; _column?: string }[];
    if (data.length === 1 && yKeys.length > 0) {
      const row = data[0];
      pieData = yKeys
        .map((k) => ({ name: formatLabel(k), value: Number(row?.[k]) || 0, _column: k }))
        .filter((d) => d.value > 0);
    } else {
      const nameKey = group_by?.[0] ?? xKey;
      const valueKey = yKeys[0] ?? "value";
      pieData = data.map((r) => ({
        name: String(r[nameKey] ?? r[xKey] ?? ""),
        value: Number(r[valueKey]) || 0,
        _column: valueKey,
      })).filter((d) => d.value > 0);
    }
    if (pieData.length === 0) pieData = [{ name: "No data", value: 1 }];

    const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload?: { name: string; value: number; _column?: string } }[] }) => {
      if (!active || !payload?.length) return null;
      const p = payload[0]?.payload ?? payload[0];
      const col = "_column" in p ? p._column : undefined;
      return (
        <div style={tooltipStyle}>
          <div style={{ fontWeight: 600 }}>{"name" in p ? p.name : ""}</div>
          <div style={{ opacity: 0.9, marginTop: 2 }}>{formatChartValue("value" in p ? p.value : 0, col)}</div>
        </div>
      );
    };

    return (
      <ResponsiveContainer width="100%" height={chartHeight} className={className}>
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

  const chartMargin = reportMode
    ? { top: 24, right: 16, left: hideY ? 0 : 48, bottom: 24 }
    : { top: 10, right: 10, left: hideY ? 0 : 40, bottom: 0 };

  const refLine =
    reference_line && typeof reference_line.value === "number" ? (
      <ReferenceLine
        y={reference_line.value}
        stroke="var(--muted-foreground)"
        strokeDasharray="4 4"
        strokeOpacity={0.8}
        label={reference_line.label ? { value: reference_line.label, position: "right" } : undefined}
      />
    ) : null;

  const commonProps = {
    data: chartData,
    margin: chartMargin,
    style: { minHeight: chartHeight },
  };

  const gridStyle = { strokeDasharray: "3 3", stroke: "var(--border)", opacity: 0.5 };

  return (
    <div className={`w-full ${className}`} style={{ height: chartHeight }}>
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
            <YAxis hide={hideY} domain={yDomain} tickFormatter={(v) => formatYAxisTick(v, yKeys)} tick={axisStyle} width={40} />
            {yKeysRight.length > 0 && <YAxis yAxisId="right" hide={hideY} domain={yDomainRight} orientation="right" tickFormatter={(v) => formatYAxisTick(v, yKeysRight)} tick={axisStyle} width={40} />}
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--primary)" }} formatter={(value: unknown, name: string) => [formatChartValue(value, name), formatLabel(name)]} />
            {refLine}
            {yKeys.map((key, idx) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                strokeWidth={2}
                fill={CHART_COLORS[idx % CHART_COLORS.length]}
                fillOpacity={0.2}
                connectNulls
                isAnimationActive={!reportMode}
              />
            ))}
            {yKeysRight.map((key, idx) => (
              <Area
                key={`right-${key}`}
                type="monotone"
                dataKey={key}
                yAxisId="right"
                stroke={CHART_COLORS[(yKeys.length + idx) % CHART_COLORS.length]}
                strokeWidth={2}
                fill={CHART_COLORS[(yKeys.length + idx) % CHART_COLORS.length]}
                fillOpacity={0.15}
                connectNulls
                isAnimationActive={!reportMode}
              />
            ))}
          </AreaChart>
        ) : type === "bar" ? (
          <BarChart {...commonProps} data={barChartData}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis dataKey={barXKey} axisLine={false} tickLine={false} tick={axisStyle} dy={10} tickFormatter={useComparisonBars ? (v: unknown) => String(v) : formatAxisTick} />
            <YAxis hide={hideY} tickFormatter={(v) => formatYAxisTick(v, useComparisonBars ? yKeys : useGroupedBars ? yKeys : barSeriesKeys)} tick={axisStyle} width={40} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
              formatter={(value: unknown, name: string, item: { payload?: { _column?: string; name?: string } }) => {
                const col = useComparisonBars ? item?.payload?._column : useGroupedBars ? yKeys[0] : name;
                const label = useComparisonBars ? item?.payload?.name : formatLabel(name);
                return [formatChartValue(value, col), label];
              }}
            />
            {useComparisonBars ? (
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                payload={barChartData.map((entry, i) => ({
                  value: (entry as { name: string }).name,
                  type: "square",
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))}
              />
            ) : (barSeriesKeys.length > 1 || useGroupedBars) && (
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => formatLabel(value)} />
            )}
            {refLine}
            {useComparisonBars ? (
              <Bar dataKey="value" name="value" radius={[4, 4, 0, 0]} barSize={24}>
                {barChartData.map((entry, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Bar>
            ) : (
              barSeriesKeys.map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={formatLabel(key)}
                  fill={CHART_COLORS[idx % CHART_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  barSize={useGroupedBars ? 20 : 24}
                  stackId={stacked && useGroupedBars ? "stack1" : undefined}
                />
              ))
            )}
          </BarChart>
        ) : type === "scatter" ? (
          yKeys.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              Scatter requires numeric x and y columns
            </div>
          ) : (
            <ScatterChart {...commonProps}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey={xKey} type="number" axisLine={false} tickLine={false} tick={axisStyle} dy={10} tickFormatter={formatAxisTick} />
              <YAxis type="number" hide={hideY} domain={yDomain} tickFormatter={(v) => formatYAxisTick(v, yKeys)} tick={axisStyle} width={40} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} formatter={(value: unknown, name: string) => [formatChartValue(value, name), formatLabel(name)]} />
              {refLine}
              {yKeys.slice(0, 1).map((key, idx) => (
                <Scatter key={key} name={formatLabel(key)} data={chartData} dataKey={[xKey, key]} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </ScatterChart>
          )
        ) : (
          <LineChart {...commonProps}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={axisStyle} dy={10} tickFormatter={formatAxisTick} />
            <YAxis hide={hideY} domain={yDomain} tickFormatter={(v) => formatYAxisTick(v, yKeys)} tick={axisStyle} width={40} />
            {yKeysRight.length > 0 && <YAxis yAxisId="right" hide={hideY} domain={yDomainRight} orientation="right" tickFormatter={(v) => formatYAxisTick(v, yKeysRight)} tick={axisStyle} width={40} />}
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--primary)" }} formatter={(value: unknown, name: string) => [formatChartValue(value, name), formatLabel(name)]} />
            {refLine}
            {(yKeys.length > 1 || yKeysRight.length > 0) && (
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => formatLabel(value)} />
            )}
            {yKeys.map((key, idx) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={!reportMode}
              />
            ))}
            {yKeysRight.map((key, idx) => (
              <Line
                key={`right-${key}`}
                type="monotone"
                dataKey={key}
                yAxisId="right"
                stroke={CHART_COLORS[(yKeys.length + idx) % CHART_COLORS.length]}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
                isAnimationActive={!reportMode}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
