"use client";

import React from "react";
import { TaskLedger } from "@/lib/types";
import {
  ListChecks,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Lightbulb,
  FileText,
} from "lucide-react";

interface TaskLedgerViewProps {
  ledger: TaskLedger | null;
}

export function TaskLedgerView({ ledger }: TaskLedgerViewProps) {
  if (!ledger) {
    return (
      <div className="p-6 text-center text-xs text-content-muted">
        No active Task Ledger. Submit a command to instantiate outer planning loop.
      </div>
    );
  }

  const { milestones, facts, hypotheses, stall_count, is_replanning } = ledger;

  return (
    <div className="p-4 space-y-5 text-xs">
      {/* Stall Detection & Replanning Status */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-surface-hover/70 border border-surface-border">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              stall_count > 0 ? "bg-amber-500 animate-ping" : "bg-emerald-500"
            }`}
          />
          <span className="font-semibold text-content-main">
            Stall Monitor: {stall_count} / 4 turns
          </span>
        </div>
        {is_replanning ? (
          <span className="mat-badge badge-warning flex items-center gap-1 font-bold">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Executive Replanning Active
          </span>
        ) : (
          <span className="mat-badge badge-success flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Normal Progression
          </span>
        )}
      </div>

      {/* Structural Milestones */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="font-bold text-content-main uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-primary" />
            Structural Milestones ({milestones.length})
          </span>
        </div>

        <div className="space-y-2">
          {milestones.map((m, idx) => {
            const isDone = m.status === "verified";
            const isInProgress = m.status === "in_progress" || m.status === "review";

            return (
              <div
                key={m.id || idx}
                className={`p-3 rounded-xl border transition-all ${
                  isDone
                    ? "bg-emerald-500/5 border-emerald-500/30"
                    : isInProgress
                    ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20"
                    : "bg-surface-hover/40 border-surface-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : isInProgress ? (
                        <Clock className="w-4 h-4 text-primary animate-pulse shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-surface-border inline-block" />
                      )}
                    </span>
                    <div>
                      <p className="font-semibold text-content-main leading-tight">
                        {m.description}
                      </p>
                      <span className="text-[10px] text-content-muted mt-0.5 block">
                        Assigned: <strong>{m.assigned_node}</strong>
                      </span>
                    </div>
                  </div>
                  <span
                    className={`mat-badge text-[10px] font-bold uppercase shrink-0 ${
                      isDone
                        ? "badge-success"
                        : isInProgress
                        ? "badge-primary"
                        : "badge-secondary"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>

                {m.verification_criteria && (
                  <div className="mt-2 text-[10px] text-content-muted bg-surface-card p-2 rounded-lg border border-surface-border/60">
                    <strong className="text-content-main">Verification Criteria:</strong>{" "}
                    {m.verification_criteria}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Verified Factual Ground-Truth */}
      {facts && facts.length > 0 && (
        <div>
          <span className="font-bold text-content-main uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-2">
            <FileText className="w-3.5 h-3.5 text-cyan-500" />
            Verified Factual Baseline ({facts.length})
          </span>
          <div className="space-y-1.5">
            {facts.map((f, i) => (
              <div
                key={i}
                className="p-2 rounded-lg bg-surface-hover/60 border border-surface-border text-[11px] text-content-main leading-relaxed"
              >
                • {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Working Hypotheses */}
      {hypotheses && hypotheses.length > 0 && (
        <div>
          <span className="font-bold text-content-main uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-2">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            Working Hypotheses ({hypotheses.length})
          </span>
          <div className="space-y-1.5">
            {hypotheses.map((h, i) => (
              <div
                key={i}
                className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-content-main leading-relaxed"
              >
                • {h}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
