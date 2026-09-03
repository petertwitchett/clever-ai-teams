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
  Trash2,
  ArrowDown,
  Layers,
  Shield,
  Code2,
  TrendingUp,
  Cpu,
  CornerDownLeft,
  XCircle,
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
  const [streamingStep, setStreamingStep] = useState<string>("Orchestrator decomposing milestones...");

  // Ledgers State
  const [taskLedger, setTaskLedger] = useState<TaskLedger | null>(null);
  const [progressLedger, setProgressLedger] = useState<ProgressLedger | null>(null);
  const [critiques, setCritiques] = useState<DialecticalCritique[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Quick starter prompt suggestions
  const quickPrompts = [
    {
      title: "Deconstruct Architecture",
      desc: "Plan sprint milestones & code modules",
      icon: <Layers className="w-3.5 h-3.5 text-amber-500" />,
      prompt: "Deconstruct our software architecture into 3 verifiable sprint milestones with clear acceptance criteria.",
    },
    {
      title: "Dialectical Risk Audit",
      desc: "Stress-test against black swans",
      icon: <Shield className="w-3.5 h-3.5 text-rose-500" />,
      prompt: "Run a dialectical stress-test on current system invariants and identify critical single points of failure.",
    },
    {
      title: "AST Python Sandbox",
      desc: "Generate & execute verified tool",
      icon: <Code2 className="w-3.5 h-3.5 text-cyan-500" />,
      prompt: "Generate an AST-validated Python skill to calculate rolling volatility and verify it inside the Voyager sandbox.",
    },
    {
      title: "Quantitative Risk Model",
      desc: "Asset allocation & downside bounds",
      icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />,
      prompt: "Formulate a quantitative risk matrix for autonomous agents with strict capital preservation invariants.",
    },
  ];

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

  // Scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Handle scroll detection for "Scroll to bottom" button
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 120;
    setShowScrollBottom(!isAtBottom);
  };

  // Auto-resize textarea
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

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
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
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
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsStreaming(true);
    setStreamingStep("Orchestrator decomposing milestones into Task Ledger...");

    try {
      const { run_id } = await api.sendMessage(sessionId, text);

      // Subscribe to live SSE stream
      subscribeToRunEvents(run_id, {
        onLedgerUpdate: (tl, pl) => {
          setTaskLedger(tl);
          setProgressLedger(pl);
          setStreamingStep("Specialists dispatching inner progress loop...");
        },
        onAgentDebate: (crit) => {
          setCritiques((prev) => [...prev, crit]);
          setStreamingStep("Dialectical Critic verifying constitutional invariants...");
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const activeGraph = graphs.find((g) => g.id === selectedGraphId) || graphs[0];

  return (
    <div className="flex h-[calc(100vh-130px)] rounded-2xl border border-surface-border overflow-hidden bg-surface-card shadow-mat">
      {/* 1. Left Sidebar: Chat Sessions History */}
      <div className="w-68 border-r border-surface-border flex flex-col bg-surface-hover/20 shrink-0 hidden md:flex">
        {/* New Session Header Button */}
        <div className="p-3.5 border-b border-surface-border">
          <button
            onClick={handleNewSession}
            className="w-full mat-btn mat-btn-primary text-xs font-semibold py-2.5 flex items-center justify-center gap-2 shadow-mat-glow"
          >
            <Plus className="w-4 h-4" />
            <span>New Deliberation Session</span>
          </button>
        </div>

        {/* Team Selector */}
        <div className="p-3 border-b border-surface-border">
          <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider block px-1 mb-1.5 flex items-center gap-1">
            <Cpu className="w-3 h-3 text-primary" />
            <span>Active Team Graph</span>
          </label>
          <select
            value={selectedGraphId}
            onChange={(e) => setSelectedGraphId(e.target.value)}
            className="mat-input text-xs py-1.5 px-2.5 font-medium w-full"
          >
            {graphs.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Sessions List */}
        <div className="flex-1 p-2.5 overflow-y-auto space-y-1.5 text-xs">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-content-subtle uppercase tracking-wider">
            <span>Sessions History</span>
            <span className="px-1.5 py-0.2 rounded bg-surface-hover font-mono">
              {sessions.length}
            </span>
          </div>

          {sessions.map((s) => {
            const isSelected = currentSession?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentSession(s)}
                className={`w-full text-left p-3 rounded-xl transition-all block group relative ${
                  isSelected
                    ? "bg-primary/15 text-primary font-bold shadow-xs border border-primary/30"
                    : "text-content-main hover:bg-surface-hover font-medium border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate block flex-1">{s.title}</span>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </div>
                <span className="text-[10px] text-content-muted block mt-1 font-mono">
                  {new Date(s.created_at).toLocaleDateString()} • {new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Middle Panel: Conversation Message Stream & Composer */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-bg/40 relative">
        {/* Chat Header */}
        <div className="p-3.5 px-6 border-b border-surface-border flex items-center justify-between bg-surface-card/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary/20 to-amber-500/20 text-primary flex items-center justify-center font-bold shadow-xs border border-primary/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-content-main leading-tight flex items-center gap-2">
                {activeGraph?.name || "Clever AI Team"}
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Magentic-One Dual-Ledger
                </span>
              </h3>
              <p className="text-[11px] text-content-muted mt-0.5 flex items-center gap-2">
                <span>{activeGraph?.node_count || 4} Specialists bound</span>
                <span>•</span>
                <span className="font-mono text-content-subtle">Checkpointer: PostgreSQL</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen((prev) => !prev)}
              className={`mat-btn text-xs px-3.5 py-2 flex items-center gap-2 transition-all ${
                drawerOpen
                  ? "bg-primary/15 text-primary font-bold border border-primary/30 shadow-mat-glow"
                  : "mat-btn-outline"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{drawerOpen ? "Hide Thought Panel" : "Show Thought Panel"}</span>
            </button>
          </div>
        </div>

        {/* Message Stream Scroll Area */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-10 py-8 relative"
        >
          {/* Centered Constrained Column for Optimal Reading Ergonomics */}
          <div className="max-w-4xl mx-auto w-full space-y-6 pb-6">
            {messages.length === 0 ? (
              /* Hero Empty State */
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-primary/20 via-amber-500/15 to-primary/10 text-primary flex items-center justify-center shadow-mat-glow animate-float-slow border border-primary/30">
                  <Bot className="w-10 h-10" />
                </div>
                <div className="max-w-lg space-y-2">
                  <h4 className="font-bold text-lg text-content-main">
                    Autonomous Multi-Agent Collective Ready
                  </h4>
                  <p className="text-xs text-content-muted leading-relaxed">
                    Issue complex goals to your agent team. The Magentic Orchestrator will construct a
                    structured Task Ledger, dispatch subtasks to specialists, and enforce constitutional invariants.
                  </p>
                </div>

                {/* Quick Prompts 2x2 Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full max-w-2xl pt-2 text-left">
                  {quickPrompts.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(item.prompt)}
                      className="p-4 rounded-2xl border border-surface-border bg-surface-card hover:border-primary/50 hover:shadow-mat-hover text-content-main transition-all group flex items-start gap-3"
                    >
                      <div className="w-9 h-9 rounded-xl bg-surface-hover flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-content-main flex items-center justify-between">
                          <span>{item.title}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-content-muted group-hover:text-primary transition-colors" />
                        </div>
                        <p className="text-[11px] text-content-muted truncate mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Render Real Live Messages */
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}

            {/* Deliberation Streaming Indicator */}
            {isStreaming && (
              <div className="max-w-3xl rounded-2xl p-5 bg-gradient-to-r from-primary/10 via-amber-500/5 to-surface-card border border-primary/30 text-xs shadow-mat-glow my-6 animate-pulse">
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
                    <RefreshCw className="w-4.5 h-4.5 animate-spin text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-xs text-content-main flex items-center gap-2">
                      <span>Autonomous Collective Active</span>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-primary/20 text-primary font-mono font-semibold">
                        Dual-Ledger Loop
                      </span>
                    </h5>
                    <p className="text-xs text-content-muted mt-0.5 truncate font-mono">
                      {streamingStep}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Floating Scroll to Bottom Button */}
          {showScrollBottom && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-6 right-8 p-3 rounded-full bg-surface-card border border-surface-border text-primary shadow-mat-hover hover:scale-110 transition-all z-20 flex items-center gap-2 text-xs font-semibold"
            >
              <ArrowDown className="w-4 h-4" />
              <span>Jump to bottom</span>
            </button>
          )}
        </div>

        {/* 3. Floating State-of-the-Art Composer (Input Box) */}
        <div className="p-4 sm:p-6 bg-gradient-to-t from-surface-bg via-surface-bg/95 to-transparent z-10">
          <div className="max-w-4xl mx-auto w-full space-y-3.5">
            {/* Quick Prompt Suggestion Pills (Horizontal Scrollable Carousel) */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5 no-scrollbar text-xs">
              <span className="text-[10px] font-bold text-content-subtle uppercase tracking-wider shrink-0 flex items-center gap-1.5 px-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Suggestions:</span>
              </span>
              {quickPrompts.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setInputText(item.prompt)}
                  className="px-3.5 py-2 rounded-full border border-surface-border bg-surface-card hover:border-primary/50 text-content-muted hover:text-content-main hover:bg-surface-hover text-xs font-semibold shrink-0 transition-all flex items-center gap-2 shadow-2xs hover:-translate-y-0.5"
                >
                  {item.icon}
                  <span>{item.title}</span>
                </button>
              ))}
            </div>

            {/* Composer Capsule Card */}
            <div className="rounded-2xl border border-surface-border bg-surface-card/95 backdrop-blur-lg shadow-mat p-4 sm:p-5 transition-all focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-mat-glow">
              {/* Composer Header Pill */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-surface-border/70 text-xs text-content-subtle px-1">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-content-muted">Target Collective:</span>
                  <span className="font-bold text-content-main truncate max-w-[280px]">
                    {activeGraph?.name || "Clever AI Team"}
                  </span>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-content-subtle">
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-hover border border-surface-border text-content-muted font-mono">
                    Enter ↵
                  </kbd>
                  <span>to send</span>
                  <span>•</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-hover border border-surface-border text-content-muted font-mono">
                    Shift + Enter
                  </kbd>
                  <span>for newline</span>
                </div>
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="Instruct the autonomous agent collective (e.g. 'Audit this architecture against security invariants and draft execution milestones')..."
                disabled={isStreaming}
                className="w-full bg-transparent text-sm sm:text-base text-content-main placeholder:text-content-subtle resize-none focus:outline-hidden leading-relaxed px-1 py-1.5 max-h-[220px] min-h-[56px]"
              />

              {/* Composer Footer Actions & Send Button */}
              <div className="flex items-center justify-between pt-3 border-t border-surface-border/70 mt-2">
                <div className="flex items-center gap-2">
                  {inputText.trim().length > 0 && (
                    <button
                      onClick={() => setInputText("")}
                      className="p-1.5 px-2.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content-main transition-colors text-xs flex items-center gap-1.5 border border-surface-border/50"
                      title="Clear prompt"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  )}
                  <span className="text-[11px] font-mono text-content-subtle px-2.5 py-1 rounded-lg bg-surface-hover/60 border border-surface-border/50">
                    {inputText.length > 0 ? `${inputText.length} chars` : "Ready"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputText.trim() || isStreaming}
                    className="mat-btn mat-btn-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 rounded-xl shadow-mat-glow disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    {isStreaming ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Deliberating...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Directive</span>
                        <Send className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
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
