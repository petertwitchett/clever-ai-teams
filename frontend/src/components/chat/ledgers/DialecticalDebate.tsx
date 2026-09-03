"use client";

import React from "react";
import { DialecticalCritique } from "@/lib/types";
import { Scale, CheckCircle2, XCircle, MessageSquare } from "lucide-react";

interface DialecticalDebateProps {
  critiques: DialecticalCritique[];
}

export function DialecticalDebate({ critiques }: DialecticalDebateProps) {
  if (!critiques || critiques.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-content-muted">
        No active dialectical critiques yet. Peers cross-examine intermediate artifacts across
        directed review edges.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-surface-border">
        <span className="font-bold text-content-main uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5 text-rose-500" />
          Peer Cross-Examination Log ({critiques.length})
        </span>
        <span className="mat-badge badge-danger">Constitutional Audit</span>
      </div>

      <div className="space-y-3">
        {critiques.map((crit, idx) => (
          <div
            key={crit.id || idx}
            className="p-3.5 rounded-xl border border-surface-border bg-surface-card shadow-xs space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
                  <Scale className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-content-main">
                  {crit.critic_node}
                </span>
                <span className="text-[10px] text-content-muted">➔</span>
                <span className="font-medium text-content-muted">
                  {crit.target_node}
                </span>
              </div>

              <span
                className={`mat-badge text-[10px] font-bold ${
                  crit.accepted ? "badge-success" : "badge-danger"
                }`}
              >
                {crit.accepted ? "Critique Cleared" : "Revision Required"}
              </span>
            </div>

            <p className="text-content-main leading-relaxed pl-8">
              {crit.critique_text}
            </p>

            <div className="pt-2 border-t border-surface-border/60 flex items-center justify-between text-[10px] text-content-muted pl-8">
              <span>Milestone: {crit.milestone_id}</span>
              <span className="font-mono font-bold text-primary">
                Verification Score: {(crit.score * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
