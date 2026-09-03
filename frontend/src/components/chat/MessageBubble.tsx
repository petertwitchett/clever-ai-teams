"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/lib/types";
import { Bot, User, Crown, Check, Copy, Sparkles, Scale, Search, Code2 } from "lucide-react";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  const isUser = message.sender_type === "user";
  const isOrchestrator = message.sender_type === "orchestrator";

  const getAvatar = () => {
    if (isUser) {
      return (
        <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
          <User className="w-4 h-4" />
        </div>
      );
    }
    if (isOrchestrator) {
      return (
        <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
          <Crown className="w-4 h-4" />
        </div>
      );
    }
    const nameLower = message.sender_name.toLowerCase();
    if (nameLower.includes("critic")) {
      return (
        <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
          <Scale className="w-4 h-4" />
        </div>
      );
    }
    if (nameLower.includes("developer") || nameLower.includes("engineer")) {
      return (
        <div className="w-8 h-8 rounded-xl bg-cyan-500 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
          <Code2 className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
        <Search className="w-4 h-4" />
      </div>
    );
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`flex items-start gap-3.5 group ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {getAvatar()}

      <div
        className={`max-w-2xl rounded-2xl p-4.5 text-xs transition-all shadow-xs ${
          isUser
            ? "bg-primary text-white rounded-tr-xs"
            : "bg-surface-card border border-surface-border text-content-main rounded-tl-xs shadow-mat-hover"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between pb-2 mb-2 border-b gap-4 ${
            isUser ? "border-white/20" : "border-surface-border"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`font-bold text-xs ${
                isUser ? "text-white" : "text-content-main"
              }`}
            >
              {message.sender_name}
            </span>
            {!isUser && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-content-muted">
                {message.sender_type}
              </span>
            )}
          </div>

          <button
            onClick={copyToClipboard}
            className={`p-1 rounded transition-opacity ${
              isUser
                ? "text-white/80 hover:text-white"
                : "text-content-muted hover:text-content-main"
            }`}
            title="Copy message"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>

        {/* Markdown Content */}
        <div className={`leading-relaxed space-y-2 prose-xs ${isUser ? "text-white" : ""}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto my-3">
                  <table className="w-full border-collapse border border-surface-border text-left">
                    {children}
                  </table>
                </div>
              ),
              th: ({ children }) => (
                <th className="p-2 border border-surface-border bg-surface-hover font-bold text-content-main">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="p-2 border border-surface-border">{children}</td>
              ),
              code: ({ children, className }) => {
                const isInline = !className;
                return isInline ? (
                  <code
                    className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${
                      isUser
                        ? "bg-white/20 text-white"
                        : "bg-surface-hover text-primary"
                    }`}
                  >
                    {children}
                  </code>
                ) : (
                  <pre className="p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto my-2 border border-slate-800">
                    <code>{children}</code>
                  </pre>
                );
              },
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1">{children}</ol>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
