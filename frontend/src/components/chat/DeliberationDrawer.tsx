"use client";

import React, { useState } from "react";
import { TaskLedger, ProgressLedger, DialecticalCritique } from "@/lib/types";
import { TaskLedgerView } from "./ledgers/TaskLedgerView";
import { ProgressLedgerView } from "./ledgers/ProgressLedgerView";
import { DialecticalDebate } from "./ledgers/DialecticalDebate";
import {
  ListChecks,
  Activity,
  Scale,
  ChevronRight,
  ChevronLeft,
  Sparkles,
} from "lucide-react";

interface DeliberationDrawerProps {
  taskLedger: TaskLedger | null;
  progressLedger: ProgressLedger | null;
  critiques: DialecticalCritique[];
  isOpen: boolean;
  onToggle: () => void;
}

export function DeliberationDrawer({
  taskLedger,
  progressLedger,
  critiques,
  isOpen,
  onToggle,
}: DeliberationDrawerProps) {
  const [activeTab, setActiveTab] = useState<"task" | "progress" | "debate">("task");

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/3 z-20 bg-surface-card border-l border-y border-surface-border text-primary p-2.5 rounded-l-xl shadow-mat-hover flex items-center gap-2 text-xs font-bold hover:bg-surface-hover transition-all"
        title="Open Deliberation Thought Panel"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="[writing-mode:vertical-rl] tracking-wider uppercase py-1">
          Thought Ledgers
        </span>
      </button>
    );
  }

  return (
    <div className="w-full lg:w-96 bg-surface-card border-l border-surface-border flex flex-col h-full shadow-mat-hover shrink-0 transition-all duration-300">
      {/* Drawer Header */}
      <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-hover/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary animate-pulse" />
          <h3 className="font-bold text-sm text-content-main leading-tight">
            Magentic-One Observability
          </h3>
        </div>
        <button
          onClick={onToggle}
          className="p-1 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content-main"
          title="Collapse Panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-surface-border text-xs font-semibold text-center bg-surface-hover/20">
        <button
          onClick={() => setActiveTab("task")}
          className={`py-2.5 px-2 border-b-2 flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === "task"
              ? "border-primary text-primary font-bold bg-surface-card"
              : "border-transparent text-content-muted hover:text-content-main"
          }`}
        >
          <ListChecks className="w-3.5 h-3.5" />
          <span>Task Ledger</span>
        </button>
        <button
          onClick={() => setActiveTab("progress")}
          className={`py-2.5 px-2 border-b-2 flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === "progress"
              ? "border-primary text-primary font-bold bg-surface-card"
              : "border-transparent text-content-muted hover:text-content-main"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Progress</span>
        </button>
        <button
          onClick={() => setActiveTab("debate")}
          className={`py-2.5 px-2 border-b-2 flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === "debate"
              ? "border-primary text-primary font-bold bg-surface-card"
              : "border-transparent text-content-muted hover:text-content-main"
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Debate</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "task" && <TaskLedgerView ledger={taskLedger} />}
        {activeTab === "progress" && <ProgressLedgerView ledger={progressLedger} />}
        {activeTab === "debate" && <DialecticalDebate critiques={critiques} />}
      </div>
    </div>
  );
}
