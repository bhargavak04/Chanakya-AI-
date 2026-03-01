"use client";

import React, { useState } from "react";
import { Download, ChevronDown, ChevronRight, Code, BarChart3, Table2, FileText, Loader2, Settings, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DynamicChart } from "./charts/DynamicChart";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { ChatResponseSuccess, ChartConfig } from "@/lib/api";
import type { ChartConfigOverride } from "@/context/AppContext";
import { api } from "@/lib/api";
import { downloadReport } from "@/lib/report";

type DataView = "chart" | "table";

interface ResponseBlockProps {
  response: ChatResponseSuccess;
  chartTypeOverride?: ChartConfig["type"];
  /** Merged into chart config when this block is the customize target */
  chartConfigOverride?: ChartConfigOverride;
  onExport?: (format: "csv") => void;
  /** When true, insights are rendered outside by the parent */
  hideInsights?: boolean;
  /** Open the chart customization panel */
  onOpenChartCustomize?: () => void;
  /** Bookmark: show star to save this question */
  bookmark?: {
    userQuestion: string;
    dbId: string;
    isBookmarked: boolean;
    onToggle: () => void;
  };
}

export function ResponseBlock({ response, chartTypeOverride, chartConfigOverride, onExport, hideInsights, onOpenChartCustomize, bookmark }: ResponseBlockProps) {
  const [sqlExpanded, setSqlExpanded] = useState(false);
  const [dataView, setDataView] = useState<DataView>("chart");
  const {
    title,
    data,
    chart_config,
    insights,
    badges,
    export: exportMeta,
    meta,
  } = response;

  const baseConfig: ChartConfig =
    dataView === "table"
      ? { ...chart_config, type: "table" }
      : chartTypeOverride
        ? { ...chart_config, type: chartTypeOverride }
        : chart_config;
  const effectiveChartConfig: ChartConfig = chartConfigOverride
    ? {
        ...baseConfig,
        ...chartConfigOverride,
        x_axis: chartConfigOverride.x_axis ?? baseConfig.x_axis,
        y_axis: chartConfigOverride.y_axis ?? baseConfig.y_axis,
      }
    : baseConfig;

  const handleExportCsv = async () => {
    try {
      const blob = await api.exportCsv(data, title.replace(/\W+/g, "_").slice(0, 50));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\W+/g, "_").slice(0, 50)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      onExport?.("csv");
    }
  };

  const [reportLoading, setReportLoading] = useState(false);
  const handleDownloadReport = async () => {
    setReportLoading(true);
    try {
      await downloadReport(response);
    } finally {
      setReportLoading(false);
    }
  };

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
          <div className="flex items-center gap-2 flex-wrap">
            {badges.map((b) => (
              <span
                key={b.type}
                className={cn(
                  "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border",
                  b.type === "drop" && "text-rose-400 border-rose-400/20 bg-rose-400/5",
                  b.type === "anomaly" && "text-amber-400 border-amber-400/20 bg-amber-400/5",
                  b.type === "growth" && "text-emerald-400 border-emerald-400/20 bg-emerald-400/5",
                  !["drop", "anomaly", "growth"].includes(b.type) && "text-primary border-primary/20 bg-primary/5"
                )}
              >
                {b.value}
              </span>
            ))}
            <span className="text-muted-foreground/60 text-[11px]">
              {meta.db_source} • {meta.query_time_ms}ms
            </span>
          </div>
        </div>
        <div className={cn("flex gap-1 transition-opacity", bookmark?.isBookmarked ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
          {bookmark && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={bookmark.onToggle}
              title={bookmark.isBookmarked ? "Remove from bookmarks" : "Bookmark this question"}
            >
              <Star
                className={cn("w-3.5 h-3.5", bookmark.isBookmarked && "fill-amber-400 text-amber-400")}
              />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownloadReport}
            disabled={reportLoading}
            title="Download report (chart + table + analysis)"
          >
            {reportLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
          </Button>
          {exportMeta.csv_available && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleExportCsv}
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6 min-h-[200px]">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDataView("chart")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                dataView === "chart"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-transparent"
              )}
            >
              <BarChart3 className="w-3 h-3" />
              Chart
            </button>
            <button
              type="button"
              onClick={() => setDataView("table")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                dataView === "table"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-transparent"
              )}
            >
              <Table2 className="w-3 h-3" />
              Table
            </button>
          </div>
          {onOpenChartCustomize && dataView === "chart" && (
            <button
              type="button"
              onClick={onOpenChartCustomize}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                chartConfigOverride && Object.keys(chartConfigOverride).length > 0
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-transparent"
              )}
              title="Customize chart (axes, type, options)"
            >
              <Settings className="w-3 h-3" />
              Customize
            </button>
          )}
        </div>
        <DynamicChart data={data} config={effectiveChartConfig} showYAxis={chartConfigOverride?.showYAxis ?? false} />
      </div>

      {!hideInsights && insights.length > 0 && (
        <ul className="mb-4 space-y-1 text-[13px] text-muted-foreground">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      )}

      {(meta.sql || meta.diagnostic_queries?.length) && (
        <div className="border-t border-border pt-4 mt-4">
          <button
            onClick={() => setSqlExpanded(!sqlExpanded)}
            className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {sqlExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <Code className="w-3.5 h-3.5" />
            SQL{meta.queries_executed ? ` (${meta.queries_executed} queries)` : ""}
          </button>
          <AnimatePresence>
            {sqlExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 space-y-2 overflow-hidden"
              >
                {(meta.diagnostic_queries ?? (meta.sql ? [meta.sql] : [])).map((sql, i) => (
                  <pre
                    key={i}
                    className="p-3 rounded-lg bg-secondary/50 text-[11px] font-mono overflow-x-auto"
                  >
                    {sql}
                  </pre>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
