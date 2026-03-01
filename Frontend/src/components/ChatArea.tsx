"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, User, Bot, Loader2, BarChart3, TrendingUp, Calculator, Search, Zap } from "lucide-react";
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
  onOpenChartCustomize?: () => void;
}

export function ChatArea({ onOpenChartCustomize }: ChatAreaProps) {
  const { activeDbId, conversationId, setConversationId, chartTypeOverride, loadDatabases } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [mode, setMode] = useState<ChatModeId>("analyze");

  const LOADING_STEPS = ["Thinking...", "Running SQL...", "Fetching data...", "Analysing with vectors..."] as const;
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

    const stepInterval = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 800);

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
    <div className="flex-1 overflow-y-auto flex flex-col items-center py-10 px-6 max-w-5xl mx-auto w-full space-y-12 chat-scroll">
      {!activeDbId && (
        <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground">
          <p className="text-sm mb-2">No database selected.</p>
          <p className="text-xs">Add a data source and select it to start chatting.</p>
        </div>
      )}

      {isEmpty && (
        <div className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center text-center px-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <currentMode.icon className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-1">{currentMode.label} mode</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">{currentMode.desc}</p>
          <p className="text-xs text-muted-foreground/80 mb-3">Try asking:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {currentMode.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestionClick(s)}
                className="px-4 py-2 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/60 text-[13px] text-foreground/90 transition-colors text-left max-w-xs"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full"
          >
            <div className="flex gap-4 items-start mb-6">
              <div className="flex-shrink-0 mt-1">
                {message.type === "user" ? (
                  <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center overflow-hidden">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
              </div>
              <div className="flex-1 pt-1.5 min-w-0">
                {message.type === "user" ? (
                  <p className="text-[15px] leading-relaxed text-foreground/90 max-w-2xl font-normal">
                    {message.content}
                  </p>
                ) : "error" in message ? (
                  <>
                    <p className="text-[15px] leading-relaxed text-foreground/90">{message.content}</p>
                    <p className="text-[13px] text-rose-400/90 mt-1">{message.error}</p>
                  </>
                ) : "response" in message && message.response ? (
                  <div className="space-y-4">
                    <ResponseBlock
                      response={message.response}
                      chartTypeOverride={chartTypeOverride ?? undefined}
                      hideInsights
                      onOpenChartCustomize={onOpenChartCustomize}
                    />
                    {message.response.insights.length > 0 && (
                      <div className="text-[15px] leading-relaxed text-foreground/90 w-full">
                        {message.response.insights.map((insight, i) => (
                          <p key={i} className="mb-2 last:mb-0">
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
        ))}
      </AnimatePresence>

      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex gap-4 items-start w-full"
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
          <p className="text-[15px] text-muted-foreground pt-2">{LOADING_STEPS[loadingStep]}</p>
        </motion.div>
      )}

      <div ref={bottomRef} className="h-24 shrink-0" />

      {activeDbId && (
        <div className="fixed bottom-0 left-64 right-0 p-8 flex justify-center bg-gradient-to-t from-background via-background/90 to-transparent pt-12">
          <div className="relative w-full max-w-2xl group shadow-2xl">
            <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
            <div className="flex flex-wrap gap-2 mb-3 px-1">
              {CHAT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
                    mode === m.id
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-transparent"
                  )}
                >
                  <m.icon className="w-3.5 h-3.5" />
                  {m.label}
                </button>
              ))}
            </div>
            <div className="relative glass border border-border/60 hover:border-border transition-colors p-3 rounded-2xl flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-secondary/50 flex items-center justify-center text-primary" title={currentMode.desc}>
                <currentMode.icon className="w-4 h-4" />
              </div>
              <input
                ref={inputRef}
                type="text"
                placeholder={mode === "analyze" ? "Ask anything about your data..." : `Ask in ${currentMode.label} mode...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="flex-1 bg-transparent border-none outline-none py-2 text-[15px] placeholder:text-muted-foreground/60 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="flex-shrink-0 w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:hover:scale-100"
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
