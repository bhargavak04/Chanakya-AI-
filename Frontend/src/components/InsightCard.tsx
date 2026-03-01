'use client';

import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  Maximize2, 
  Download, 
  Save,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface InsightCardProps {
  title: string;
  value: string;
  change: string;
  isPositive?: boolean;
  type?: 'Forecast' | 'Anomaly' | 'Growth' | 'Drop';
  children?: React.ReactNode;
}

export function InsightCard({ 
  title, 
  value, 
  change, 
  isPositive = true, 
  type = 'Growth',
  children 
}: InsightCardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="bg-card border border-border rounded-xl p-6 shadow-sm hover:border-primary/20 transition-all group overflow-hidden relative"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-muted-foreground text-[13px] font-medium mb-1 tracking-tight">{title}</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground tabular-nums tracking-tight">{value}</span>
            <span className={cn(
              "text-[12px] font-medium flex items-center gap-0.5 px-1.5 py-0.5 rounded-full",
              isPositive ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10"
            )}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {change}
            </span>
          </div>
        </div>
        
        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-1.5 rounded-md hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-6 h-[200px] w-full bg-secondary/20 rounded-lg flex items-center justify-center border border-border/50">
        {children || <div className="text-muted-foreground text-xs italic">Chart visualization placeholder</div>}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <span className={cn(
            "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border",
            type === 'Growth' && "text-emerald-400 border-emerald-400/20 bg-emerald-400/5",
            type === 'Drop' && "text-rose-400 border-rose-400/20 bg-rose-400/5",
            type === 'Forecast' && "text-primary border-primary/20 bg-primary/5",
            type === 'Anomaly' && "text-amber-400 border-amber-400/20 bg-amber-400/5",
          )}>
            {type}
          </span>
          <span className="text-muted-foreground/60 text-[11px] flex items-center gap-1">
            • 4m ago
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="text-[12px] font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
            Compare <ArrowRight className="w-3 h-3" />
          </button>
          <button className="text-[12px] font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Explain
          </button>
          <button className="p-1.5 rounded-md bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors border border-border">
            <Save className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
