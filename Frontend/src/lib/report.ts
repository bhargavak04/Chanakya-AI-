/**
 * Generate and download HTML report: chart + table + AI insights
 */
import type { ChatResponseSuccess, ChartConfig } from "./api";
import type { ChartConfigOverride } from "@/context/AppContext";
import { createRoot } from "react-dom/client";
import React from "react";
import { DynamicChart } from "@/components/charts/DynamicChart";

const REPORT_CHART_WIDTH = 600;
const REPORT_CHART_HEIGHT = 360;

function formatCell(v: unknown): string {
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
}

function buildTableHtml(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";
  const keys = Object.keys(data[0] ?? {});
  const headers = keys.map((k) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).join("</th><th>");
  const rows = data
    .slice(0, 100)
    .map(
      (row) =>
        `<tr>${keys.map((k) => `<td>${escapeHtml(formatCell(row[k]))}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;"><thead><tr><th>${headers}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function captureChartAsSvg(
  data: Record<string, unknown>[],
  config: ChartConfig,
  options?: { showYAxis?: boolean }
): Promise<string> {
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${REPORT_CHART_WIDTH}px;height:${REPORT_CHART_HEIGHT}px;background:#FFFFFF;`;
  document.body.appendChild(container);

  const chartConfig: ChartConfig =
    config.type === "table" ? { ...config, type: "bar" } : config;

  return new Promise((resolve) => {
    const root = createRoot(container);
    root.render(
      React.createElement(DynamicChart, {
        data,
        config: chartConfig,
        className: "report-chart",
        showYAxis: options?.showYAxis ?? false,
        reportMode: true,
      })
    );

    const extractSvg = () => {
      const svg = container.querySelector("svg");
      if (svg) {
        const clone = svg.cloneNode(true) as SVGElement;
        clone.setAttribute("width", String(REPORT_CHART_WIDTH));
        clone.setAttribute("height", String(REPORT_CHART_HEIGHT));
        resolve(clone.outerHTML);
      } else {
        resolve("");
      }
      root.unmount();
      container.remove();
    };

    setTimeout(extractSvg, 800);
  });
}

export interface DownloadReportOptions {
  /** Use customized chart config (axes, type, showYAxis) instead of LLM default */
  chartConfig?: ChartConfig & ChartConfigOverride;
}

export async function downloadReport(
  response: ChatResponseSuccess,
  options?: DownloadReportOptions
): Promise<void> {
  const { title, data, chart_config, insights, meta } = response;

  const chartConfigForReport: ChartConfig =
    (options?.chartConfig ?? chart_config).type === "table"
      ? { ...(options?.chartConfig ?? chart_config), type: "bar" }
      : (options?.chartConfig ?? chart_config);

  const chartSvg = await captureChartAsSvg(data, chartConfigForReport, {
    showYAxis: options?.chartConfig?.showYAxis ?? false,
  });

  const chartSection = chartSvg
    ? `<div style="margin-bottom:24px"><h3 style="font-size:14px;color:#6B6B6B;margin-bottom:8px">Chart</h3><div style="background:#F8F8F8;padding:16px;border-radius:8px;border:1px solid #E4E4E4">${chartSvg}</div></div>`
    : "";

  const tableSection = `<div style="margin-bottom:24px"><h3 style="font-size:14px;color:#6B6B6B;margin-bottom:8px">Data</h3>${buildTableHtml(data)}</div>`;

  const insightsSection =
    insights.length > 0
      ? `<div style="margin-bottom:24px"><h3 style="font-size:14px;color:#6B6B6B;margin-bottom:8px">Analysis</h3><div style="line-height:1.6;color:#333">${insights.map((i) => `<p style="margin:0 0 8px 0">${escapeHtml(i)}</p>`).join("")}</div></div>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Chanakya Report</title>
  <style>
    :root {
      --primary: #E06348;
      --background: #FFFFFF;
      --section: #F8F8F8;
      --border: #E4E4E4;
      --muted: #6B6B6B;

      --chart-1: #E06348;
      --chart-2: #F0C1B7;
      --chart-3: #F3D9D4;
      --chart-4: #F6EDEB;
      --chart-5: #F6F6F6;
    }

    body {
      font-family: system-ui, sans-serif;
      background: var(--background);
      color: #1A1A1A;
      padding: 32px;
      max-width: 900px;
      margin: 0 auto;
    }

    h1 {
      font-size: 20px;
      margin-bottom: 8px;
    }

    h3 {
      font-size: 14px;
      margin-bottom: 8px;
      color: var(--muted);
    }

    .meta {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 24px;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 13px;
      border: 1px solid var(--border);
    }

    th {
      background: var(--section);
      text-align: left;
      padding: 8px;
      color: #444;
    }

    td {
      padding: 8px;
      border-top: 1px solid var(--border);
    }

    tr:nth-child(even) {
      background: #FAFAFA;
    }

    svg {
      display: block;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(meta.db_source)} • ${meta.query_time_ms}ms</p>
  ${chartSection}
  ${tableSection}
  ${insightsSection}
  <p style="font-size:11px;color:#6B6B6B;margin-top:24px">Generated by Chanakya</p>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\W+/g, "_").slice(0, 50)}_report.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string | number): string {
  const str = String(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
