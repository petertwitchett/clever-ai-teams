"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/lib/types";
import {
  Bot,
  User,
  Crown,
  Check,
  Copy,
  Sparkles,
  Scale,
  Search,
  Code2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Terminal,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Layers,
  ShieldAlert,
} from "lucide-react";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const isUser = message.sender_type === "user";
  const isOrchestrator = message.sender_type === "orchestrator";

  // Parse JSON content if present
  let parsedJson: any = null;
  let isJson = false;
  const trimmed = message.content.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      parsedJson = JSON.parse(trimmed);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  // Check if this is an LLM provider fallback notice
  const isProviderNotice =
    isJson &&
    parsedJson &&
    (parsedJson.note || parsedJson.mock !== undefined || parsedJson.echo_digest);

  // Role visual configuration
  const getRoleConfig = () => {
    if (isUser) {
      return {
        roleTitle: "Architect (You)",
        badgeText: "Operator",
        badgeColor: "bg-primary/20 text-primary border-primary/30",
        borderColor: "border-primary/40",
        accentBar: "border-l-primary",
        icon: <User className="w-4 h-4 text-white" />,
        avatarBg: "bg-gradient-to-tr from-primary to-amber-500 shadow-mat-glow",
        modelName: "Direct Input",
      };
    }

    if (isOrchestrator) {
      return {
        roleTitle: "Magentic Orchestrator",
        badgeText: "Lead Coordinator",
        badgeColor: "bg-amber-500/15 text-amber-500 border-amber-500/30",
        borderColor: "border-amber-500/30",
        accentBar: "border-l-amber-500",
        icon: <Crown className="w-4 h-4 text-amber-500" />,
        avatarBg: "bg-amber-500/10 border border-amber-500/30 text-amber-500",
        modelName: "o1-preview",
      };
    }

    const nameLower = (message.sender_name || "").toLowerCase();
    const contentLower = message.content.toLowerCase();

    if (nameLower.includes("critic") || contentLower.includes("fallacy") || contentLower.includes("dialectical")) {
      return {
        roleTitle: "Dialectical Critic",
        badgeText: "Constitutional Auditor",
        badgeColor: "bg-rose-500/15 text-rose-500 border-rose-500/30",
        borderColor: "border-rose-500/30",
        accentBar: "border-l-rose-500",
        icon: <Scale className="w-4 h-4 text-rose-500" />,
        avatarBg: "bg-rose-500/10 border border-rose-500/30 text-rose-500",
        modelName: "deepseek-r1",
      };
    }

    if (nameLower.includes("dev") || nameLower.includes("engineer") || contentLower.includes("def ") || contentLower.includes("function")) {
      return {
        roleTitle: "Fullstack Engineer",
        badgeText: "Code & Sandbox",
        badgeColor: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30",
        borderColor: "border-cyan-500/30",
        accentBar: "border-l-cyan-500",
        icon: <Code2 className="w-4 h-4 text-cyan-500" />,
        avatarBg: "bg-cyan-500/10 border border-cyan-500/30 text-cyan-500",
        modelName: "deepseek-coder-v2",
      };
    }

    if (nameLower.includes("research") || nameLower.includes("analyst") || contentLower.includes("empirical") || contentLower.includes("retrieved")) {
      return {
        roleTitle: "Senior Researcher",
        badgeText: "Empirical Grounding",
        badgeColor: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
        borderColor: "border-indigo-500/30",
        accentBar: "border-l-indigo-500",
        icon: <Search className="w-4 h-4 text-indigo-500" />,
        avatarBg: "bg-indigo-500/10 border border-indigo-500/30 text-indigo-500",
        modelName: "claude-3-5-sonnet",
      };
    }

    return {
      roleTitle: message.sender_name || "Autonomous Specialist",
      badgeText: "Domain Specialist",
      badgeColor: "bg-purple-500/15 text-purple-400 border-purple-500/30",
      borderColor: "border-surface-border",
      accentBar: "border-l-primary",
      icon: <Bot className="w-4 h-4 text-primary" />,
      avatarBg: "bg-primary/10 border border-primary/30 text-primary",
      modelName: "gpt-4o",
    };
  };

  const roleCfg = getRoleConfig();

  const copyToClipboard = (text: string, isRaw = false) => {
    navigator.clipboard.writeText(text);
    if (isRaw) {
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTimestamp = (ts?: string) => {
    if (!ts) return "Just now";
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return ts;
    }
  };

  return (
    <div
      className={`flex items-start gap-3.5 group my-2 ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-transform group-hover:scale-105 ${roleCfg.avatarBg}`}
      >
        {roleCfg.icon}
      </div>

      {/* Main Message Card */}
      <div
        className={`flex-1 max-w-3xl rounded-2xl p-4.5 text-xs transition-all ${
          isUser
            ? "bg-gradient-to-br from-primary/15 via-primary/10 to-surface-card border border-primary/30 text-content-main rounded-tr-xs shadow-mat-glow"
            : `bg-surface-card border ${roleCfg.borderColor} border-l-4 ${roleCfg.accentBar} text-content-main rounded-tl-xs shadow-mat hover:shadow-mat-hover`
        }`}
      >
        {/* Header: Identity, Badges, Timestamp & Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between pb-2.5 mb-3 border-b border-surface-border gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs text-content-main tracking-tight">
              {roleCfg.roleTitle}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${roleCfg.badgeColor}`}
            >
              {roleCfg.badgeText}
            </span>
            <span className="text-[10px] font-mono text-content-subtle hidden sm:inline-block">
              {roleCfg.modelName}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-content-muted">
            <span className="text-[10px] font-mono flex items-center gap-1">
              <Clock className="w-3 h-3 text-content-subtle" />
              {formatTimestamp(message.created_at)}
            </span>

            {/* Toolbar Buttons */}
            <div className="flex items-center gap-1 ml-2 border-l border-surface-border pl-2">
              <button
                onClick={() => copyToClipboard(message.content)}
                className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content-main transition-colors"
                title="Copy message content"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              {isJson && (
                <button
                  onClick={() => setShowRawJson(!showRawJson)}
                  className={`p-1.5 rounded-lg hover:bg-surface-hover transition-colors ${
                    showRawJson ? "text-primary bg-primary/10" : "text-content-muted hover:text-content-main"
                  }`}
                  title={showRawJson ? "Show formatted view" : "View raw JSON payload"}
                >
                  <Terminal className="w-3.5 h-3.5" />
                </button>
              )}

              {!isUser && (
                <>
                  <button
                    onClick={() => setFeedback(feedback === "up" ? null : "up")}
                    className={`p-1.5 rounded-lg hover:bg-surface-hover transition-colors ${
                      feedback === "up" ? "text-emerald-500 bg-emerald-500/10" : "text-content-muted hover:text-content-main"
                    }`}
                    title="Helpful response"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setFeedback(feedback === "down" ? null : "down")}
                    className={`p-1.5 rounded-lg hover:bg-surface-hover transition-colors ${
                      feedback === "down" ? "text-rose-500 bg-rose-500/10" : "text-content-muted hover:text-content-main"
                    }`}
                    title="Needs refinement"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        {showRawJson ? (
          /* Raw JSON Debug View */
          <div className="relative rounded-xl bg-slate-950 p-3.5 text-slate-100 font-mono text-[11px] overflow-x-auto border border-slate-800">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[10px] text-slate-400">
              <span>RAW TELEMETRY PAYLOAD</span>
              <button
                onClick={() => copyToClipboard(JSON.stringify(parsedJson, null, 2), true)}
                className="hover:text-white flex items-center gap-1"
              >
                {copiedRaw ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedRaw ? "Copied" : "Copy JSON"}</span>
              </button>
            </div>
            <pre>{JSON.stringify(parsedJson, null, 2)}</pre>
          </div>
        ) : isProviderNotice ? (
          /* Provider / Engine Telemetry Notice Card */
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-primary/5 to-transparent border border-amber-500/30">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <h4 className="font-bold text-xs text-content-main flex items-center gap-2">
                    <span>Magentic-One Autonomous Execution Loop</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                      Verified Dispatch
                    </span>
                  </h4>
                  <p className="text-xs text-content-muted leading-relaxed">
                    {parsedJson.note ||
                      "The multi-agent collective processed your directive and advanced the Magentic-One task ledger."}
                  </p>
                </div>
              </div>

              {/* Engine Metrics Chips */}
              <div className="mt-3.5 pt-3 border-t border-amber-500/20 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                {parsedJson.echo_digest && (
                  <span className="px-2.5 py-1 rounded-lg bg-surface-hover border border-surface-border text-content-muted">
                    Digest: <strong className="text-content-main">{parsedJson.echo_digest}</strong>
                  </span>
                )}
                {parsedJson.received_chars !== undefined && (
                  <span className="px-2.5 py-1 rounded-lg bg-surface-hover border border-surface-border text-content-muted">
                    Payload: <strong className="text-content-main">{parsedJson.received_chars} chars</strong>
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 font-semibold">
                  Dual-Ledger Orchestrated
                </span>
              </div>
            </div>

            {/* Quick Helper to expand raw JSON */}
            <div className="flex items-center justify-between text-[11px] text-content-subtle px-1">
              <span>Underlying agent turn persisted to PostgreSQL</span>
              <button
                onClick={() => setShowRawJson(true)}
                className="text-primary hover:underline flex items-center gap-1 font-medium"
              >
                <span>Inspect Raw JSON</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : isJson ? (
          /* General JSON Formatted Card */
          <div className="space-y-2.5">
            <div className="rounded-xl bg-slate-950 p-3.5 text-slate-100 font-mono text-[11px] overflow-x-auto border border-slate-800">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[10px] text-slate-400">
                <span className="flex items-center gap-1 text-primary font-semibold">
                  <Terminal className="w-3.5 h-3.5" />
                  JSON DATA OBJECT
                </span>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(parsedJson, null, 2))}
                  className="hover:text-white flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre>{JSON.stringify(parsedJson, null, 2)}</pre>
            </div>
          </div>
        ) : (
          /* Rich Markdown Content */
          <div className="leading-relaxed space-y-2.5 text-[13px] text-content-main prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-base font-bold text-content-main pb-1 border-b border-surface-border mt-3 mb-2">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-sm font-bold text-content-main mt-3 mb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xs font-bold text-content-main mt-2 mb-1">
                    {children}
                  </h3>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3 rounded-xl border border-surface-border">
                    <table className="w-full border-collapse text-left text-xs">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-surface-hover/80 text-content-main font-semibold border-b border-surface-border">
                    {children}
                  </thead>
                ),
                th: ({ children }) => (
                  <th className="p-2.5 px-3 border-r border-surface-border last:border-r-0 font-bold">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="p-2.5 px-3 border-t border-surface-border border-r last:border-r-0 text-content-muted">
                    {children}
                  </td>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="p-3 my-2 rounded-xl bg-surface-hover/40 border-l-4 border-primary text-content-muted italic">
                    {children}
                  </blockquote>
                ),
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="px-1.5 py-0.5 rounded-md font-mono text-[11px] bg-surface-hover border border-surface-border text-primary font-semibold">
                      {children}
                    </code>
                  ) : (
                    <div className="rounded-xl overflow-hidden my-2.5 border border-surface-border bg-slate-950">
                      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-slate-400">
                        <span>CODE SNIPPET</span>
                        <button
                          onClick={() => copyToClipboard(String(children))}
                          className="hover:text-white flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <pre className="p-3.5 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed">
                        <code>{children}</code>
                      </pre>
                    </div>
                  );
                },
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 space-y-1.5 my-2 marker:text-primary">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 space-y-1.5 my-2 marker:text-primary font-medium">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
