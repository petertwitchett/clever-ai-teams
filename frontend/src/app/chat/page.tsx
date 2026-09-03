"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  ChatSession,
  ChatMessage,
  GraphSummary,
  TaskLedger,
  ProgressLedger,
  DialecticalCritique,
} from "@/lib/types";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { DeliberationDrawer } from "@/components/chat/DeliberationDrawer";
import { subscribeToRunEvents } from "@/lib/sse";
import {
  Bot,
  Send,
  Plus,
  Sparkles,
  Workflow,
  ChevronRight,
  RefreshCw,
  Sliders,
  Play,
  Layers,
  CheckCircle2,
} from "lucide-react";

function ChatContent() {
  const searchParams = useSearchParams();
  const graphParam = searchParams.get("graph");

  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string>("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);

  // Ledgers State
  const [taskLedger, setTaskLedger] = useState<TaskLedger | null>(null);
  const [progressLedger, setProgressLedger] = useState<ProgressLedger | null>(null);
  const [critiques, setCritiques] = useState<DialecticalCritique[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load Graphs and Sessions
  useEffect(() => {
    async function init() {
      try {
        const [gList, sList] = await Promise.all([
          api.getGraphs(),
          api.getSessions(),
        ]);
        setGraphs(gList);
        setSessions(sList);

        const initialGraphId = graphParam || (gList[0] ? gList[0].id : "");
        setSelectedGraphId(initialGraphId);

        if (sList.length > 0) {
          const matched = sList.find((s) => s.graph_id === initialGraphId) || sList[0];
          setCurrentSession(matched);
        }
      } catch (err) {
        console.error("Init chat failed:", err);
      }
    }
    init();
  }, [graphParam]);

  // Load Messages for Current Session
  useEffect(() => {
    if (!currentSession) return;
    async function loadSessionData() {
      try {
        const msgs = await api.getSessionMessages(currentSession!.id);
        setMessages(msgs);

        // Load real run state from API
        const runs = await api.getSessionRuns(currentSession!.id);
        if (runs.length > 0) {
          const latest = runs[0];
          setTaskLedger(latest.task_ledger);
          setProgressLedger(latest.progress_ledger);
          setCritiques(latest.critiques);
        } else {
          setTaskLedger(null);
          setProgressLedger(null);
          setCritiques([]);
        }
      } catch (err) {
        console.error("Load session messages and runs failed:", err);
      }
    }
    loadSessionData();
  }, [currentSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Create New Session
  const handleNewSession = async () => {
    try {
      const gId = selectedGraphId || (graphs[0] ? graphs[0].id : "");
      const title = `Session #${sessions.length + 1} (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;
      const created = await api.createSession(gId, title);
      setSessions([created, ...sessions]);
      setCurrentSession(created);
      setMessages([]);
      setTaskLedger(null);
      setProgressLedger(null);
      setCritiques([]);
    } catch (err) {
      console.error("Create session error:", err);
    }
  };

  // Send Command to Multi-Agent Team
  const handleSendMessage = async (customText?: string) => {
    const text = customText || inputText;
    if (!text.trim() || isStreaming) return;

    let sess = currentSession;
    if (!sess) {
      const gId = selectedGraphId || (graphs[0] ? graphs[0].id : "");
      sess = await api.createSession(gId, `Session #${sessions.length + 1}`);
      setSessions([sess, ...sessions]);
      setCurrentSession(sess);
    }

    const sessionId = sess.id;
    const clientMsg: ChatMessage = {
      id: `client-${Date.now()}`,
      session_id: sessionId,
      sender_type: "user",
      sender_name: "You",
      content: text.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, clientMsg]);
    setInputText("");
    setIsStreaming(true);

    try {
      const { run_id } = await api.sendMessage(sessionId, text);

      // Subscribe to live SSE stream
      subscribeToRunEvents(run_id, {
        onLedgerUpdate: (tl, pl) => {
          setTaskLedger(tl);
          setProgressLedger(pl);
        },
        onAgentDebate: (crit) => {
          setCritiques((prev) => [...prev, crit]);
        },
        onFinalChunk: () => {},
        onComplete: async () => {
          setIsStreaming(false);
          const updatedMsgs = await api.getSessionMessages(sessionId);
          setMessages(updatedMsgs);
          const updatedRun = await api.getRun(run_id);
          setTaskLedger(updatedRun.task_ledger);
          setProgressLedger(updatedRun.progress_ledger);
          setCritiques(updatedRun.critiques);
        },
        onError: async () => {
          setIsStreaming(false);
          const updatedMsgs = await api.getSessionMessages(sessionId);
          setMessages(updatedMsgs);
        },
      });
    } catch (err: any) {
      console.error("SendMessage error:", err);
      setIsStreaming(false);
      const updatedMsgs = await api.getSessionMessages(sessionId);
      setMessages(updatedMsgs);
    }
  };

  const activeGraph = graphs.find((g) => g.id === selectedGraphId) || graphs[0];

  return (
    <div className="flex h-[calc(100vh-140px)] rounded-2xl border border-surface-border overflow-hidden bg-surface-card shadow-mat">
      {/* 1. Left Sidebar: Chat Sessions History */}
      <div className="w-64 border-r border-surface-border flex flex-col bg-surface-hover/30 shrink-0 hidden md:flex">
        <div className="p-3.5 border-b border-surface-border">
          <button
            onClick={handleNewSession}
            className="w-full mat-btn mat-btn-primary text-xs font-semibold py-2 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Session</span>
          </button>
        </div>

        <div className="p-2 border-b border-surface-border">
          <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider block px-2 mb-1">
            Active Team Graph
          </label>
          <select
            value={selectedGraphId}
            onChange={(e) => setSelectedGraphId(e.target.value)}
            className="mat-input text-xs py-1 px-2 font-medium"
          >
            {graphs.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Sessions List */}
        <div className="flex-1 p-2 overflow-y-auto space-y-1 text-xs">
          <span className="text-[10px] font-bold text-content-subtle uppercase tracking-wider block px-2 py-1">
            Recent Sessions ({sessions.length})
          </span>
          {sessions.map((s) => {
            const isSelected = currentSession?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentSession(s)}
                className={`w-full text-left p-2.5 rounded-xl transition-all block truncate ${
                  isSelected
                    ? "bg-primary/10 text-primary font-bold shadow-xs border border-primary/20"
                    : "text-content-main hover:bg-surface-hover font-medium"
                }`}
              >
                <span className="truncate block">{s.title}</span>
                <span className="text-[10px] text-content-muted block mt-0.5">
                  {new Date(s.created_at).toLocaleDateString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Middle Panel: Conversation Message Stream */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-bg/50">
        {/* Chat Header */}
        <div className="p-3.5 px-5 border-b border-surface-border flex items-center justify-between bg-surface-card">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-content-main leading-tight flex items-center gap-2">
                {activeGraph?.name || "Clever AI Team"}
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Magentic-One
                </span>
              </h3>
              <p className="text-[11px] text-content-muted">
                {activeGraph?.node_count || 4} Specialists • Outer Task Loop + Inner Progress Loop
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen((prev) => !prev)}
              className={`mat-btn text-xs px-3 py-1.5 flex items-center gap-1.5 ${
                drawerOpen
                  ? "bg-primary/10 text-primary font-bold border border-primary/30"
                  : "mat-btn-outline"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{drawerOpen ? "Hide Thought Panel" : "Show Thought Panel"}</span>
            </button>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary/20 to-amber-500/20 text-primary flex items-center justify-center shadow-mat-glow animate-float-slow">
                <Bot className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-bold text-base text-content-main">
                  AI Collective Ready for Directives
                </h4>
                <p className="text-xs text-content-muted mt-1 leading-relaxed">
                  Submit a goal or research objective. The Magentic Orchestrator will construct a
                  Task Ledger and dispatch subtasks to specialists.
                </p>
              </div>

              {/* Quick Prompts */}
              <div className="w-full space-y-2 pt-2 text-xs">
                {[
                  "Evaluate inference cost economics: DeepSeek-R1 vs commercial frontiers",
                  "Formulate a quantitative risk matrix for autonomous code execution",
                  "Cross-examine market growth assumptions for Q3 2026 AI platforms",
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(prompt)}
                    className="w-full text-left p-2.5 rounded-xl border border-surface-border bg-surface-card hover:border-primary/50 text-content-main transition-all font-medium flex items-center justify-between group"
                  >
                    <span className="truncate">{prompt}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-content-muted group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}

          {isStreaming && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-card border border-surface-border text-xs text-content-muted animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              <span>Orchestrator decomposing milestones and auditing peer debate...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3.5 px-4 bg-surface-card border-t border-surface-border">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Instruct the AI team (e.g. 'Analyze market competitors and verify claims')..."
              disabled={isStreaming}
              className="flex-1 mat-input text-xs py-2.5 px-3.5"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isStreaming}
              className="mat-btn mat-btn-primary px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* 3. Right Panel: Deliberation Thought Drawer */}
      <DeliberationDrawer
        taskLedger={taskLedger}
        progressLedger={progressLedger}
        critiques={critiques}
        isOpen={drawerOpen}
        onToggle={() => setDrawerOpen((prev) => !prev)}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 mat-card flex items-center justify-center">
          <Bot className="w-8 h-8 text-primary animate-pulse" />
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
