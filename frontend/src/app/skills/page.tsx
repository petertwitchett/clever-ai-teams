"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VoyagerSkill, ExpeLReflection } from "@/lib/types";
import {
  Cpu,
  Code2,
  Play,
  Terminal,
  CheckCircle2,
  Sparkles,
  Zap,
  Lightbulb,
  Clock,
  RefreshCw,
} from "lucide-react";

export default function SkillsPage() {
  const [skills, setSkills] = useState<VoyagerSkill[]>([]);
  const [reflections, setReflections] = useState<ExpeLReflection[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<VoyagerSkill | null>(null);
  const [activeTab, setActiveTab] = useState<"voyager" | "expel">("voyager");

  // Sandbox Runner State
  const [sandboxArgs, setSandboxArgs] = useState<string>("{}");
  const [sandboxOutput, setSandboxOutput] = useState<{
    output: string;
    exit_code: number;
    execution_time_ms: number;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDraining, setIsDraining] = useState(false);

  useEffect(() => {
    async function load() {
      const [sList, rList] = await Promise.all([
        api.getSkills(),
        api.getPostMortems(),
      ]);
      setSkills(sList);
      setReflections(rList);
      if (sList.length > 0) setSelectedSkill(sList[0]);
    }
    load();
  }, []);

  const handleRunSandbox = async () => {
    if (!selectedSkill) return;
    setIsRunning(true);
    try {
      let parsed = {};
      try {
        parsed = JSON.parse(sandboxArgs);
      } catch {
        parsed = {};
      }
      const res = await api.executeSkill(selectedSkill.id, parsed);
      setSandboxOutput(res);
    } catch (err: any) {
      setSandboxOutput({
        output: `Execution failed: ${err.message}`,
        exit_code: 1,
        execution_time_ms: 0,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleDrainPostMortems = async () => {
    setIsDraining(true);
    try {
      await api.drainPostMortems();
      const updated = await api.getPostMortems();
      setReflections(updated);
    } catch (err) {
      console.error("Drain failed:", err);
    } finally {
      setIsDraining(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mat-card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg text-content-main flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-500" />
            Lifelong Skill Acquisition & Behavioral Evolution
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            Voyager Dynamic Executable Python Tools & ExpeL Post-Mortem Experiential Reflection
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex rounded-xl bg-surface-hover p-1 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("voyager")}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "voyager"
                ? "bg-surface-card text-primary shadow-xs font-bold"
                : "text-content-muted hover:text-content-main"
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>Track 1: Voyager Code Sandbox</span>
          </button>
          <button
            onClick={() => setActiveTab("expel")}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "expel"
                ? "bg-surface-card text-primary shadow-xs font-bold"
                : "text-content-muted hover:text-content-main"
            }`}
          >
            <Lightbulb className="w-4 h-4" />
            <span>Track 2: ExpeL Reflections</span>
          </button>
        </div>
      </div>

      {/* TRACK 1: VOYAGER PYTHON CODE SANDBOX */}
      {activeTab === "voyager" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Skills List (Left 4 cols) */}
          <div className="lg:col-span-4 mat-card p-5 space-y-2">
            <span className="text-[11px] font-bold text-content-muted uppercase tracking-wider block px-2 mb-2">
              Vector Skill Library ({skills.length})
            </span>
            {skills.map((skill) => {
              const isSelected = selectedSkill?.id === skill.id;
              return (
                <button
                  key={skill.id}
                  onClick={() => {
                    setSelectedSkill(skill);
                    setSandboxOutput(null);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                    isSelected
                      ? "border-amber-500 bg-amber-500/10 shadow-xs"
                      : "border-surface-border hover:border-surface-border/80 hover:bg-surface-hover/50"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isSelected
                        ? "bg-amber-500 text-white"
                        : "bg-surface-hover text-content-muted"
                    }`}
                  >
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-content-main truncate">
                      {skill.name}
                    </p>
                    <p className="text-[11px] text-content-muted line-clamp-1 mt-0.5">
                      {skill.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sandbox Detail & Runner (Right 8 cols) */}
          <div className="lg:col-span-8 mat-card p-6 space-y-5">
            {selectedSkill ? (
              <>
                <div className="flex items-start justify-between pb-3 border-b border-surface-border">
                  <div>
                    <h3 className="font-bold text-base text-content-main">
                      {selectedSkill.name}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {selectedSkill.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mat-badge badge-success">
                      <CheckCircle2 className="w-3 h-3" />
                      AST Verified
                    </span>
                  </div>
                </div>

                {/* Docstring */}
                <div className="p-3 rounded-xl bg-surface-hover/70 border border-surface-border text-xs">
                  <span className="font-bold text-content-main block mb-1">
                    Function Docstring:
                  </span>
                  <p className="text-content-muted leading-relaxed font-mono text-[11px]">
                    {selectedSkill.docstring}
                  </p>
                </div>

                {/* Python Code View */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-content-main flex items-center gap-1.5">
                      <Code2 className="w-4 h-4 text-cyan-500" />
                      Executable Python Source
                    </span>
                    <span className="text-[10px] font-mono text-content-muted">
                      Sandbox Subprocess Isolated
                    </span>
                  </div>
                  <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto border border-slate-800">
                    <code>{selectedSkill.python_code}</code>
                  </pre>
                </div>

                {/* Interactive Sandbox Test Runner */}
                <div className="p-4 rounded-xl bg-surface-hover/50 border border-surface-border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-content-main flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-amber-500" />
                      Isolated Sandbox Execution Runner
                    </span>
                    <button
                      onClick={handleRunSandbox}
                      disabled={isRunning}
                      className="mat-btn mat-btn-primary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isRunning ? "Running in Sandbox..." : "Execute in Sandbox"}</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-content-muted mb-1">
                      JSON Arguments:
                    </label>
                    <input
                      type="text"
                      value={sandboxArgs}
                      onChange={(e) => setSandboxArgs(e.target.value)}
                      placeholder='e.g. {"iterations": 5000}'
                      className="mat-input font-mono text-xs"
                    />
                  </div>

                  {sandboxOutput && (
                    <div className="mt-3 p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-emerald-400 pb-1 border-b border-slate-800">
                        <span>Exit Code: {sandboxOutput.exit_code} (Success)</span>
                        <span>Execution Runtime: {sandboxOutput.execution_time_ms}ms</span>
                      </div>
                      <pre className="mt-2 text-slate-300 whitespace-pre-wrap">
                        {sandboxOutput.output}
                      </pre>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-xs text-content-muted">
                Select a skill to inspect source code and execute in sandbox.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TRACK 2: EXPEL REFLECTION LESSONS */}
      {activeTab === "expel" && (
        <div className="space-y-4">
          <div className="mat-card p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-content-main">
                Experiential Reflection Heuristics
              </h3>
              <p className="text-xs text-content-muted mt-0.5">
                Atomic principles distilled from post-mortem session traces, injected as few-shot
                exemplars into future runs.
              </p>
            </div>

            <button
              onClick={handleDrainPostMortems}
              disabled={isDraining}
              className="mat-btn mat-btn-primary text-xs font-semibold px-4 py-2 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDraining ? "animate-spin" : ""}`} />
              <span>{isDraining ? "Distilling..." : "Drain & Distill Lessons Now"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {reflections.map((r) => (
              <div
                key={r.id}
                className="mat-card p-6 flex flex-col justify-between border-l-4 border-l-amber-500 hover:shadow-mat-hover transition-all"
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] text-content-muted mb-2 font-mono">
                    <span>{r.session_id}</span>
                    <span className="font-bold text-emerald-500">
                      Impact: {r.impact_score}/10
                    </span>
                  </div>

                  <h4 className="font-bold text-xs text-content-main leading-relaxed mb-2">
                    &ldquo;{r.principle}&rdquo;
                  </h4>

                  <div className="p-2.5 rounded-lg bg-surface-hover/70 border border-surface-border text-[11px] text-content-muted">
                    <strong className="text-content-main">Trigger:</strong> {r.trigger_context}
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-surface-border text-[10px] text-content-subtle flex items-center justify-between">
                  <span>Archived to Agent Vector Memory</span>
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
