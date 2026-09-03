"use client";

import React from "react";
import { ProgressLedger } from "@/lib/types";
import { Activity, Send, Cpu, CheckCircle2, ArrowRight } from "lucide-react";

interface ProgressLedgerViewProps {
  ledger: ProgressLedger | null;
}

export function ProgressLedgerView({ ledger }: ProgressLedgerViewProps) {
  if (!ledger) {
    return (
      <div className="p-6 text-center text-xs text-content-muted">
        No active Progress Ledger. Waiting for next inner execution turn.
      </div>
    );
  }

  const { current_milestone_id, active_directive, assigned_node, iteration, status } =
    ledger;

  return (
    <div className="p-4 space-y-4 text-xs">
      {/* Current Execution State */}
      <div className="p-3.5 rounded-xl bg-surface-hover/70 border border-surface-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-content-main uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-primary" />
            Inner Loop Execution
          </span>
          <span className="mat-badge badge-primary font-mono text-[10px]">
            Iteration #{iteration}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2 rounded-lg bg-surface-card border border-surface-border">
            <span className="text-content-muted block text-[10px]">Target Milestone</span>
            <span className="font-bold text-content-main">
              {current_milestone_id || "Active Milestone"}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-surface-card border border-surface-border">
            <span className="text-content-muted block text-[10px]">Execution Status</span>
            <span className="font-bold text-emerald-500 uppercase">{status}</span>
          </div>
        </div>
      </div>

      {/* Dispatched Directive */}
      <div>
        <span className="font-bold text-content-main uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-2">
          <Send className="w-3.5 h-3.5 text-amber-500" />
          Targeted Specialist Directive
        </span>
        <div className="p-3.5 rounded-xl bg-surface-hover border border-surface-border space-y-2">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Cpu className="w-4 h-4" />
            <span>Assigned: {assigned_node || "Unassigned"}</span>
          </div>
          <p className="text-content-main leading-relaxed">
            {active_directive || "Processing subtask within constitutional guardrails..."}
          </p>
        </div>
      </div>
    </div>
  );
}
