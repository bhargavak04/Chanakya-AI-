"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, User, Bot, Loader2, BarChart3, TrendingUp, Calculator, Search, Zap } from "lucide-react";
import { addBookmark, removeBookmark, isBookmarked, getBookmarkId } from "@/lib/bookmarks";
import { ResponseBlock } from "./ResponseBlock";
import { motion, AnimatePresence } from "framer-motion";
import { api, isChatError, type ChatResponseSuccess } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

export const CHAT_MODES = [
  {
    id: "analyze",
    label: "Analyze",
    icon: BarChart3,
    desc: "Query and visualize your data with charts and insights.",
    suggestions: [
      "Show me revenue by month",
      "Top 10 customers by order count",
      "Compare sales across regions",
    ],
  },
  {
    id: "forecast",
    label: "Forecast",
    icon: TrendingUp,
    desc: "Project trends and future values from historical data.",
    suggestions: [
      "Forecast next quarter revenue",
      "Predict customer churn trend",
      "Project growth for the next 6 months",
    ],
  },
  {
    id: "simulate",
    label: "Simulate",
    icon: Calculator,
    desc: "What-if scenarios: adjust variables and see the impact.",
    suggestions: [
      "What if conversion rate increases by 10%?",
      "Simulate 20% price increase on margin",
      "What happens if we cut costs by 15%?",
    ],
  },
  {
    id: "diagnose",
    label: "Diagnose",
    icon: Search,
    desc: "Root-cause analysis: compare periods and find drivers.",
    suggestions: [
      "Why did revenue drop last month?",
      "Compare this quarter vs last quarter",
      "Break down decline by region",
    ],
  },
  {
    id: "max",
    label: "Max",
    icon: Zap,
    desc: "Full analyst mode: comprehensive analysis with comparisons.",
    suggestions: [
      "Give me a full analysis of our performance",
      "Comprehensive view: trends, anomalies, and drivers",
      "Deep dive into key metrics and recommendations",
    ],
  },
] as const;

export type ChatModeId = (typeof CHAT_MODES)[number]["id"];

type Message =
  | { id: string; type: "user"; content: string }
  | {
      id: string;
      type: "ai";
      content: string;
      response: ChatResponseSuccess;
    }
  | { id: string; type: "ai"; content: string; error: string };

interface ChatAreaProps {
  onOpenChartCustomize?: (messageId: string, response: ChatResponseSuccess) => void;
}

export function ChatArea({ onOpenChartCustomize }: ChatAreaProps) {
  const { activeDbId, conversationId, setConversationId, chartTypeOverride, getChartConfigOverride, loadDatabases } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [mode, setMode] = useState<ChatModeId>("analyze");

  const LOADING_STEPS_ANALYZE = ["Thinking...", "Running SQL...", "Fetching data...", "Analysing with vectors..."] as const;
  const LOADING_STEPS_DIAGNOSE = [
    "Thinking longer—this may take a minute...",
    "Running diagnostic queries...",
    "Investigating patterns across tables...",
    "Identifying root causes...",
    "Synthesising findings...",
  ] as const;
  const LOADING_STEPS = mode === "diagnose" ? LOADING_STEPS_DIAGNOSE : LOADING_STEPS_ANALYZE;
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentMode = CHAT_MODES.find((m) => m.id === mode) ?? CHAT_MODES[0];

  useEffect(() => {
    loadDatabases();
  }, [loadDatabases]);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('chanakya:new-chat')) {
      sessionStorage.removeItem('chanakya:new-chat');
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    const onNewChat = () => setMessages([]);
    window.addEventListener('chanakya:new-chat', onNewChat);
    return () => window.removeEventListener('chanakya:new-chat', onNewChat);
  }, []);

  useEffect(() => {
    const onUseBookmark = (e: Event) => {
      const { question } = (e as CustomEvent<{ question: string }>).detail;
      setInput(question);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener("chanakya:use-bookmark", onUseBookmark);
    return () => window.removeEventListener("chanakya:use-bookmark", onUseBookmark);
  }, []);

  const [, setBookmarksVersion] = useState(0);
  useEffect(() => {
    const onUpdate = () => setBookmarksVersion((v) => v + 1);
    window.addEventListener("chanakya:bookmarks-updated", onUpdate);
    return () => window.removeEventListener("chanakya:bookmarks-updated", onUpdate);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeDbId || loading) return;

    setInput("");
    const userMsg: Message = { id: crypto.randomUUID(), type: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    setLoadingStep(0);

    const stepIntervalMs = mode === "diagnose" ? 3000 : 800;
    const stepInterval = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, stepIntervalMs);

    try {
      const res = await api.chat({
        dbId: activeDbId,
        message: text,
        mode,
        conversationId: conversationId ?? undefined,
      });

      if (isChatError(res)) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            type: "ai",
            content: "Sorry, I couldn't process that.",
            error: res.error.message,
          },
        ]);
        return;
      }

      if (res.conversationId) setConversationId(res.conversationId);

      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          type: "ai",
          content: "",
          response: res,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          type: "ai",
          content: "Something went wrong.",
          error: err instanceof Error ? err.message : "Request failed",
        },
      ]);
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (text: string) => {
    setInput(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const isEmpty = activeDbId && messages.length === 0;

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center py-8 px-6 max-w-4xl mx-auto w-full chat-scroll">
      {!activeDbId && (
        <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground">
          <p className="text-sm">No database selected.</p>
          <p className="text-xs mt-1 opacity-80">Add a data source and select it to start.</p>
        </div>
      )}

      {isEmpty && (
        <div className="flex-1 w-full max-w-xl flex flex-col items-center justify-center text-center px-4 py-12">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
            <currentMode.icon className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-base font-medium text-foreground mb-1">{currentMode.label}</h2>
          <p className="text-[13px] text-muted-foreground mb-8 max-w-sm">{currentMode.desc}</p>
          <p className="text-[11px] text-muted-foreground/80 uppercase tracking-wider mb-3">Suggestions</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {currentMode.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestionClick(s)}
                className="px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted/80 text-[13px] text-foreground/90 transition-colors text-left max-w-xs"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {messages.map((message, idx) => {
          const userQuestion =
            message.type === "ai" && "response" in message
              ? messages[idx - 1]?.type === "user"
                ? messages[idx - 1].content
                : undefined
              : undefined;

          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full mb-10"
            >
              <div className="flex gap-3 items-start">
                <div className="flex-shrink-0 mt-0.5">
                  {message.type === "user" ? (
                    <div className="w-7 h-7 rounded-full bg-muted/80 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  {message.type === "user" ? (
                    <p className="text-[14px] leading-relaxed text-foreground">
                      {message.content}
                    </p>
                  ) : "error" in message ? (
                    <>
                      <p className="text-[14px] leading-relaxed text-foreground">{message.content}</p>
                      <p className="text-[12px] text-destructive/90 mt-1">{message.error}</p>
                    </>
                  ) : "response" in message && message.response ? (
                    <div className="space-y-3">
                      <ResponseBlock
                        response={message.response}
                        chartTypeOverride={chartTypeOverride ?? undefined}
                        chartConfigOverride={getChartConfigOverride(message.id)}
                        hideInsights
                        onOpenChartCustomize={onOpenChartCustomize ? () => onOpenChartCustomize(message.id, message.response) : undefined}
                        bookmark={
                          activeDbId && userQuestion
                            ? {
                                userQuestion,
                                dbId: activeDbId,
                                isBookmarked: isBookmarked(activeDbId, userQuestion),
                                onToggle: () => {
                                  const id = getBookmarkId(activeDbId, userQuestion);
                                  if (id) removeBookmark(activeDbId, id);
                                  else addBookmark(activeDbId, userQuestion);
                                },
                              }
                            : undefined
                        }
                      />
                      {message.response.insights.length > 0 && (
                        <div className="text-[14px] leading-relaxed text-foreground/90">
                          {message.response.insights.map((insight, i) => (
                            <p key={i} className="mb-1.5 last:mb-0">
                              {insight}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex gap-3 items-start w-full mb-10"
        >
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          </div>
          <p className="text-[14px] text-muted-foreground pt-1">{LOADING_STEPS[loadingStep]}</p>
        </motion.div>
      )}

      <div ref={bottomRef} className="h-28 shrink-0" />

      {activeDbId && (
        <div className="fixed bottom-0 left-64 right-0 flex justify-center px-6 py-6 bg-background border-t border-border/30">
          <div className="w-full max-w-2xl">
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {CHAT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors",
                    mode === m.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <m.icon className="w-3 h-3" />
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-3 py-2 focus-within:border-border focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center text-primary" title={currentMode.desc}>
                <currentMode.icon className="w-3.5 h-3.5" />
              </div>
              <input
                ref={inputRef}
                type="text"
                placeholder={mode === "analyze" ? "Ask anything about your data..." : `Ask in ${currentMode.label} mode...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="flex-1 bg-transparent border-none outline-none py-2 text-[14px] placeholder:text-muted-foreground/60 disabled:opacity-50 min-w-0"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
