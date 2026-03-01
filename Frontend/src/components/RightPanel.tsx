'use client';

import React from 'react';
import { 
  X, 
  BarChart3, 
  LineChart, 
  PieChart, 
  AreaChart,
  Table as TableIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const CHART_TYPES: { icon: typeof LineChart; label: string; value: 'line' | 'bar' | 'area' | 'pie' | 'table' }[] = [
  { icon: LineChart, label: 'Line', value: 'line' },
  { icon: BarChart3, label: 'Bar', value: 'bar' },
  { icon: AreaChart, label: 'Area', value: 'area' },
  { icon: PieChart, label: 'Pie', value: 'pie' },
  { icon: TableIcon, label: 'Table', value: 'table' },
];

export function RightPanel({ isOpen, onClose }: RightPanelProps) {
  const { chartTypeOverride, setChartTypeOverride } = useApp();
  if (!isOpen) return null;

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

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-4 block">Chart Type</label>
          <p className="text-[11px] text-muted-foreground mb-3">Override visualization for the latest response</p>
          <div className="grid grid-cols-3 gap-2">
            {CHART_TYPES.map((item) => (
              <button 
                key={item.value}
                onClick={() => setChartTypeOverride(chartTypeOverride === item.value ? null : item.value)}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 p-3 rounded-lg border transition-all",
                  chartTypeOverride === item.value 
                    ? "bg-primary/10 border-primary/50 text-primary" 
                    : "border-border hover:bg-secondary/50 text-muted-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            ))}
          </div>
          {chartTypeOverride && (
            <button
              onClick={() => setChartTypeOverride(null)}
              className="mt-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Reset to default
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
