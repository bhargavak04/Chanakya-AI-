'use client';

import React from 'react';
import {
  X,
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  Table as TableIcon,
  ScatterChart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const CHART_TYPES: { icon: typeof LineChart; label: string; value: 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'table' }[] = [
  { icon: LineChart, label: 'Line', value: 'line' },
  { icon: BarChart3, label: 'Bar', value: 'bar' },
  { icon: AreaChart, label: 'Area', value: 'area' },
  { icon: PieChart, label: 'Pie', value: 'pie' },
  { icon: ScatterChart, label: 'Scatter', value: 'scatter' },
  { icon: TableIcon, label: 'Table', value: 'table' },
];

function formatLabel(k: string) {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RightPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { customizeTargetMessageId, customizeTargetResponse, getChartConfigOverride, setChartConfigOverride, clearChartConfigOverride } = useApp();
  if (!isOpen) return null;

  const messageId = customizeTargetMessageId ?? "";
  const chartConfigOverride = getChartConfigOverride(messageId) ?? {};
  const response = customizeTargetResponse;
  const data = response?.data ?? [];
  const config = response?.chart_config;
  const keys = data[0] ? Object.keys(data[0]) : [];
  const numericKeys = keys.filter((k) => {
    const v = data[0]?.[k];
    return typeof v === 'number' || (typeof v === 'string' && !Number.isNaN(Number(v)));
  });
  const effectiveType = chartConfigOverride.type ?? config?.type ?? 'line';
  const effectiveX = chartConfigOverride.x_axis ?? config?.x_axis ?? keys[0] ?? '';
  const effectiveY = Array.isArray(chartConfigOverride.y_axis) && chartConfigOverride.y_axis.length > 0
    ? chartConfigOverride.y_axis
    : Array.isArray(config?.y_axis) && (config.y_axis.length > 0)
      ? config.y_axis
      : keys.filter((k) => k !== effectiveX).slice(0, 2);

  const update = (patch: import("@/context/AppContext").ChartConfigOverride) => {
    if (messageId) setChartConfigOverride(messageId, (prev) => ({ ...prev, ...patch }));
  };

  const handleYToggle = (key: string, checked: boolean) => {
    const next = checked ? [...effectiveY, key] : effectiveY.filter((k) => k !== key);
    update({ y_axis: next });
  };

  const hasOverrides = Object.keys(chartConfigOverride).length > 0;

  return (
    <aside className="w-80 border-l border-border bg-sidebar h-screen flex flex-col sticky top-0 animate-in slide-in-from-right duration-300 ease-out">
      <div className="h-14 border-b border-border flex items-center justify-between px-6">
        <h2 className="text-[13px] font-semibold text-foreground">Chart Customization</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {!response || keys.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Click Customize on a chart to configure it.</p>
        ) : (
          <>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 block">Chart Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {CHART_TYPES.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => update({ type: item.value })}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border transition-all',
                      effectiveType === item.value
                        ? 'bg-primary/10 border-primary/50 text-primary'
                        : 'border-border hover:bg-secondary/50 text-muted-foreground'
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {effectiveType !== 'table' && (
              <>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">X-axis</Label>
                  <Select value={effectiveX} onValueChange={(v) => update({ x_axis: v })}>
                    <SelectTrigger className="w-full h-8 text-[12px]">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {keys.map((k) => (
                        <SelectItem key={k} value={k} className="text-[12px]">
                          {formatLabel(k)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Y-axis</Label>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    {effectiveType === 'scatter' || effectiveType === 'pie' ? 'Primary metric' : 'Select metrics to display'}
                  </p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {(numericKeys.length > 0 ? numericKeys : keys.filter((k) => k !== effectiveX)).map((k) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={effectiveY.includes(k)}
                          onChange={(e) => handleYToggle(k, e.target.checked)}
                          className="rounded border-border"
                        />
                        <span className="text-[12px]">{formatLabel(k)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {effectiveType === 'bar' && (
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Group by (optional)</Label>
                    <Select
                      value={chartConfigOverride.group_by?.[0] ?? config?.group_by?.[0] ?? '__none__'}
                      onValueChange={(v) => update({ group_by: v === '__none__' ? undefined : [v] })}
                    >
                      <SelectTrigger className="w-full h-8 text-[12px]">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-[12px]">None</SelectItem>
                        {keys.filter((k) => k !== effectiveX).map((k) => (
                          <SelectItem key={k} value={k} className="text-[12px]">
                            {formatLabel(k)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Label htmlFor="show-y-axis" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Show Y-axis labels
                  </Label>
                  <Switch
                    id="show-y-axis"
                    checked={chartConfigOverride.showYAxis === true}
                    onCheckedChange={(c) => update({ showYAxis: c })}
                  />
                </div>
              </>
            )}

            {hasOverrides && (
              <button
                onClick={() => messageId && clearChartConfigOverride(messageId)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Reset all
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
