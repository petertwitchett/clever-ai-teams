"use client";

import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { PersonNodeManifest } from "@/lib/types";
import { Brain, Cpu, ShieldCheck, Zap, Database, Scale, Search, Code2 } from "lucide-react";

export function PersonNode({ data, selected }: NodeProps) {
  const node = data as unknown as PersonNodeManifest;
  const { identity, persona, ethics, brain, skills, memory } = node;

  const getRoleIcon = () => {
    const roleLower = (identity?.role || "").toLowerCase();
    if (roleLower.includes("critic")) return <Scale className="w-4 h-4 text-rose-500" />;
    if (roleLower.includes("developer") || roleLower.includes("engineer"))
      return <Code2 className="w-4 h-4 text-cyan-500" />;
    if (roleLower.includes("research") || roleLower.includes("analyst"))
      return <Search className="w-4 h-4 text-indigo-500" />;
    return <Brain className="w-4 h-4 text-primary" />;
  };

  const getRoleColor = () => {
    const roleLower = (identity?.role || "").toLowerCase();
    if (roleLower.includes("critic")) return "border-rose-500/80 hover:border-rose-500";
    if (roleLower.includes("developer") || roleLower.includes("engineer"))
      return "border-cyan-500/80 hover:border-cyan-500";
    if (roleLower.includes("research") || roleLower.includes("analyst"))
      return "border-indigo-500/80 hover:border-indigo-500";
    return "border-primary/80 hover:border-primary";
  };

  return (
    <div
      className={`w-72 rounded-2xl bg-surface-card border-2 transition-all duration-200 shadow-mat-hover ${getRoleColor()} ${
        selected ? "border-primary ring-4 ring-primary/20 shadow-mat-glow" : ""
      }`}
    >
      {/* Supervisory Top Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="subtask-in"
        className="w-3.5 h-3.5 bg-primary border-2 border-white rounded-full shadow-xs"
      />
      {/* Supervisory Bottom Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="artifact-out"
        className="w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow-xs"
      />
      {/* Lateral Left Handle (Dialectical / Peer) */}
      <Handle
        type="target"
        position={Position.Left}
        id="peer-left"
        className="w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full shadow-xs"
      />
      {/* Lateral Right Handle (Dialectical / Peer) */}
      <Handle
        type="source"
        position={Position.Right}
        id="peer-right"
        className="w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full shadow-xs"
      />

      {/* Node Header */}
      <div className="p-3.5 rounded-t-2xl border-b border-surface-border bg-surface-hover/50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center shadow-xs">
            {getRoleIcon()}
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-xs text-content-main truncate">
              {identity?.name || "Specialist Agent"}
            </h4>
            <span className="text-[10px] font-semibold text-content-muted truncate block">
              {identity?.role || "Specialist Node"}
            </span>
          </div>
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface-hover text-content-muted">
          {identity?.id?.slice(0, 10)}
        </span>
      </div>

      {/* Node Body */}
      <div className="p-3.5 space-y-2.5 text-xs">
        <p className="text-[11px] text-content-muted line-clamp-2 leading-relaxed">
          {identity?.duty || "Processes subtasks within constitutional guardrails"}
        </p>

        {/* Bound LLM Brain */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-surface-hover/80 border border-surface-border text-[11px]">
          <span className="flex items-center gap-1.5 text-content-main font-semibold truncate max-w-[140px]">
            <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">{brain?.model || "claude-3-5-sonnet"}</span>
          </span>
          <span className="font-mono text-[9px] text-content-muted uppercase shrink-0">
            {brain?.provider || "Anthropic"}
          </span>
        </div>

        {/* Badges: Ethics Guardrails, Voyager Skills & Archival Memory */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3" />
            {ethics?.negative_constraints?.length || 2} Guardrails
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Zap className="w-3 h-3" />
            {skills?.length || 0} Voyager Tools
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            <Database className="w-3 h-3" />
            k={memory?.archival_top_k || 5}
          </span>
        </div>
      </div>
    </div>
  );
}
