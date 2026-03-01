"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { ChartConfig } from "@/lib/api";
import type { ChatResponseSuccess } from "@/lib/api";

type DbInfo = { id: string; name: string; type: string };

export type ChartConfigOverride = Partial<ChartConfig> & { showYAxis?: boolean };

interface AppContextValue {
  activeDbId: string | null;
  setActiveDbId: (id: string | null) => void;
  setActiveDbIdAndClearChat: (id: string | null) => void;
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  databases: DbInfo[];
  loadDatabases: () => Promise<void>;
  view: "chat" | "dataSources";
  setView: (v: "chat" | "dataSources") => void;
  chartTypeOverride: "line" | "bar" | "area" | "pie" | "scatter" | "table" | null;
  setChartTypeOverride: (t: "line" | "bar" | "area" | "pie" | "scatter" | "table" | null) => void;
  customizeTargetMessageId: string | null;
  customizeTargetResponse: ChatResponseSuccess | null;
  setCustomizeTarget: (messageId: string | null, response: ChatResponseSuccess | null) => void;
  /** Per-message overrides (persist across panel open/close) */
  chartConfigOverridesByMessage: Record<string, ChartConfigOverride>;
  getChartConfigOverride: (messageId: string) => ChartConfigOverride | undefined;
  setChartConfigOverride: (messageId: string, patch: ChartConfigOverride | ((prev: ChartConfigOverride) => ChartConfigOverride)) => void;
  clearChartConfigOverride: (messageId: string) => void;
}

const STORAGE_KEY = "chanakya:active-db-id";

function getStoredDbId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredDbId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [activeDbId, setActiveDbId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [databases, setDatabases] = useState<DbInfo[]>([]);
  const [view, setView] = useState<"chat" | "dataSources">("chat");
  const [chartTypeOverride, setChartTypeOverride] = useState<"line" | "bar" | "area" | "pie" | "scatter" | "table" | null>(null);
  const [customizeTargetMessageId, setCustomizeTargetMessageId] = useState<string | null>(null);
  const [customizeTargetResponse, setCustomizeTargetResponse] = useState<ChatResponseSuccess | null>(null);
  const [chartConfigOverridesByMessage, setChartConfigOverridesByMessage] = useState<Record<string, ChartConfigOverride>>({});

  const setCustomizeTarget = useCallback((messageId: string | null, response: ChatResponseSuccess | null) => {
    setCustomizeTargetMessageId(messageId);
    setCustomizeTargetResponse(response);
  }, []);

  const getChartConfigOverride = useCallback(
    (messageId: string) => chartConfigOverridesByMessage[messageId],
    [chartConfigOverridesByMessage]
  );

  const setChartConfigOverride = useCallback((messageId: string, patch: ChartConfigOverride | ((prev: ChartConfigOverride) => ChartConfigOverride)) => {
    setChartConfigOverridesByMessage((prev) => {
      const next = { ...prev };
      const current = next[messageId] ?? {};
      next[messageId] = typeof patch === "function" ? patch(current) : { ...current, ...patch };
      return next;
    });
  }, []);

  const clearChartConfigOverride = useCallback((messageId: string) => {
    setChartConfigOverridesByMessage((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
  }, []);

  const handleSetActiveDbId = useCallback((id: string | null) => {
    setActiveDbId(id);
    setStoredDbId(id);
    setConversationId(null);
  }, []);

  const loadDatabases = useCallback(async () => {
    try {
      const res = await api.getDatabases();
      setDatabases(res.databases);
      const ids = res.databases.map((d) => d.id);
      const stored = getStoredDbId();
      if (res.databases.length === 0) {
        setActiveDbId(null);
        setStoredDbId(null);
        return;
      }
      const next = (stored && ids.includes(stored) ? stored : ids[0]) ?? res.databases[0].id;
      setActiveDbId(next);
      setStoredDbId(next);
    } catch {
      setDatabases([]);
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        activeDbId,
        setActiveDbId,
        setActiveDbIdAndClearChat: handleSetActiveDbId,
        conversationId,
        setConversationId,
        databases,
        loadDatabases,
        view,
        setView,
        chartTypeOverride,
        setChartTypeOverride,
        customizeTargetMessageId,
        customizeTargetResponse,
        setCustomizeTarget,
        chartConfigOverridesByMessage,
        getChartConfigOverride,
        setChartConfigOverride,
        clearChartConfigOverride,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
