"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { api } from "@/lib/api";

type DbInfo = { id: string; name: string; type: string };

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
  chartTypeOverride: "line" | "bar" | "area" | "pie" | "table" | null;
  setChartTypeOverride: (t: "line" | "bar" | "area" | "pie" | "table" | null) => void;
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
  const [chartTypeOverride, setChartTypeOverride] = useState<"line" | "bar" | "area" | "pie" | "table" | null>(null);

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
