"use client";

import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Crown, Cpu, ShieldCheck, RefreshCw, Sparkles } from "lucide-react";

export function OrchestratorNode({ data, selected }: NodeProps) {
  const { orchestrator } = data as any;

  return (
    <div
      className={`w-72 rounded-2xl bg-surface-card border-2 transition-all duration-200 shadow-mat-hover ${
        selected
          ? "border-primary ring-4 ring-primary/20 shadow-mat-glow"
          : "border-amber-500/80 hover:border-amber-500"
      }`}
    >
      {/* Supervisory Top Dispatch Output */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="dispatch-out"
        className="w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full shadow-xs"
      />
      {/* Dialectical Return Input */}
      <Handle
        type="target"
        position={Position.Top}
        id="return-in"
        className="w-3.5 h-3.5 bg-primary border-2 border-white rounded-full shadow-xs"
      />

      {/* Node Header */}
      <div className="p-3.5 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-primary/15 rounded-t-2xl border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shadow-xs">
            <Crown className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-content-main leading-tight">
              {orchestrator?.name || "Magentic Orchestrator"}
            </h4>
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Central Coordinator
            </span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-500/20 text-amber-600 dark:text-amber-300">
          Dual-Ledger
        </span>
      </div>

      {/* Node Body */}
      <div className="p-3.5 space-y-2.5 text-xs">
        <p className="text-[11px] text-content-muted line-clamp-2 leading-relaxed">
          {orchestrator?.duty || "Outer planning loop decomposition and milestone verification"}
        </p>

        {/* Brain & Model Binding */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-surface-hover/80 border border-surface-border text-[11px]">
          <span className="flex items-center gap-1.5 text-content-main font-semibold">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            {orchestrator?.brain?.model || "o1-preview"}
          </span>
          <span className="font-mono text-[10px] text-content-muted uppercase">
            {orchestrator?.brain?.provider || "OpenAI"}
          </span>
        </div>

        {/* Outer Loop Ledgers & Stall Detector */}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="p-2 rounded-lg bg-surface-hover/60 border border-surface-border/60">
            <span className="text-content-muted block font-medium">Stall Limit</span>
            <span className="font-bold text-content-main flex items-center gap-1">
              <RefreshCw className="w-3 h-3 text-amber-500" />
              {orchestrator?.stall_threshold || 4} turns
            </span>
          </div>
          <div className="p-2 rounded-lg bg-surface-hover/60 border border-surface-border/60">
            <span className="text-content-muted block font-medium">Loop Control</span>
            <span className="font-bold text-emerald-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-500" />
              Task + Progress
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
