"use client";

import React, { useState, useEffect } from "react";
import { PersonNodeManifest, BrainBinding } from "@/lib/types";
import {
  X,
  Brain,
  ShieldCheck,
  Cpu,
  Zap,
  Database,
  Save,
  Plus,
  Trash2,
  HelpCircle,
} from "lucide-react";

interface PersonaDrawerProps {
  node: PersonNodeManifest | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: PersonNodeManifest) => void;
}

export function PersonaDrawer({
  node,
  isOpen,
  onClose,
  onSave,
}: PersonaDrawerProps) {
  const [formData, setFormData] = useState<PersonNodeManifest | null>(null);
  const [activeTab, setActiveTab] = useState<
    "identity" | "psyche" | "ethics" | "brain" | "skills" | "memory"
  >("identity");

  // New tag states
  const [newQuirk, setNewQuirk] = useState("");
  const [newConstraint, setNewConstraint] = useState("");
  const [newGuardrail, setNewGuardrail] = useState("");

  useEffect(() => {
    if (node) {
      setFormData(JSON.parse(JSON.stringify(node)));
    }
  }, [node]);

  if (!isOpen || !formData) return null;

  const handleSave = () => {
    if (formData) {
      onSave(formData);
      onClose();
    }
  };

  const addQuirk = () => {
    if (!newQuirk.trim()) return;
    setFormData({
      ...formData,
      persona: {
        ...formData.persona,
        quirks: [...(formData.persona.quirks || []), newQuirk.trim()],
      },
    });
    setNewQuirk("");
  };

  const removeQuirk = (index: number) => {
    const updated = [...(formData.persona.quirks || [])];
    updated.splice(index, 1);
    setFormData({
      ...formData,
      persona: { ...formData.persona, quirks: updated },
    });
  };

  const addConstraint = () => {
    if (!newConstraint.trim()) return;
    setFormData({
      ...formData,
      ethics: {
        ...formData.ethics,
        negative_constraints: [
          ...(formData.ethics.negative_constraints || []),
          newConstraint.trim(),
        ],
      },
    });
    setNewConstraint("");
  };

  const removeConstraint = (index: number) => {
    const updated = [...(formData.ethics.negative_constraints || [])];
    updated.splice(index, 1);
    setFormData({
      ...formData,
      ethics: { ...formData.ethics, negative_constraints: updated },
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-out Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg z-50 bg-surface-card border-l border-surface-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-surface-border flex items-center justify-between bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-content-main leading-tight">
                Persona Modeling Studio
              </h3>
              <p className="text-xs text-content-muted">
                {formData.identity.name} ({formData.identity.role})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content-main"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-surface-border px-4 bg-surface-hover/20 overflow-x-auto text-xs font-semibold">
          {[
            { id: "identity", label: "Identity" },
            { id: "psyche", label: "Psychology" },
            { id: "ethics", label: "Constitutional Ethics" },
            { id: "brain", label: "LLM Brain" },
            { id: "skills", label: "Voyager Skills" },
            { id: "memory", label: "Memory" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-3 border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-content-muted hover:text-content-main"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5 text-xs">
          {/* TAB 1: IDENTITY */}
          {activeTab === "identity" && (
            <div className="space-y-4">
              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Full Name / Entity Call-sign
                </label>
                <input
                  type="text"
                  value={formData.identity.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      identity: { ...formData.identity, name: e.target.value },
                    })
                  }
                  className="mat-input"
                />
              </div>

              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Professional Role
                </label>
                <input
                  type="text"
                  value={formData.identity.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      identity: { ...formData.identity, role: e.target.value },
                    })
                  }
                  className="mat-input"
                />
              </div>

              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Primary Duty & Mandate
                </label>
                <textarea
                  rows={4}
                  value={formData.identity.duty}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      identity: { ...formData.identity, duty: e.target.value },
                    })
                  }
                  className="mat-input resize-none"
                />
              </div>
            </div>
          )}

          {/* TAB 2: PSYCHE */}
          {activeTab === "psyche" && (
            <div className="space-y-4">
              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Communication Tone
                </label>
                <input
                  type="text"
                  value={formData.persona.tone}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      persona: { ...formData.persona, tone: e.target.value },
                    })
                  }
                  className="mat-input"
                />
              </div>

              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Temperament & Spirit
                </label>
                <input
                  type="text"
                  value={formData.persona.temperament}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      persona: {
                        ...formData.persona,
                        temperament: e.target.value,
                      },
                    })
                  }
                  className="mat-input"
                />
              </div>

              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Cognitive Problem-Solving Style
                </label>
                <input
                  type="text"
                  value={formData.persona.cognitive_style}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      persona: {
                        ...formData.persona,
                        cognitive_style: e.target.value,
                      },
                    })
                  }
                  className="mat-input"
                />
              </div>

              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Behavioral Quirks & Nuances
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newQuirk}
                    onChange={(e) => setNewQuirk(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addQuirk()}
                    placeholder="e.g. Always quotes exact page citations..."
                    className="mat-input flex-1"
                  />
                  <button
                    onClick={addQuirk}
                    className="mat-btn mat-btn-primary px-3"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5 mt-2">
                  {(formData.persona.quirks || []).map((q, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-surface-hover flex items-center justify-between"
                    >
                      <span className="text-content-main font-medium">{q}</span>
                      <button
                        onClick={() => removeQuirk(idx)}
                        className="text-rose-500 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONSTITUTIONAL ETHICS */}
          {activeTab === "ethics" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-content-muted leading-relaxed">
                  <strong className="text-emerald-500">Priority 0 Invariant Layer:</strong> Absolute
                  negative constraints are immutably prepended to all cognitive planning and tool
                  execution cycles.
                </p>
              </div>

              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Negative Constraints (Absolute Prohibitions)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newConstraint}
                    onChange={(e) => setNewConstraint(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addConstraint()}
                    placeholder="e.g. Never extrapolate without confidence intervals..."
                    className="mat-input flex-1"
                  />
                  <button
                    onClick={addConstraint}
                    className="mat-btn mat-btn-primary px-3"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5 mt-2">
                  {(formData.ethics.negative_constraints || []).map((c, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-surface-hover flex items-center justify-between border-l-3 border-rose-500"
                    >
                      <span className="text-content-main font-medium">{c}</span>
                      <button
                        onClick={() => removeConstraint(idx)}
                        className="text-rose-500 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BRAIN BINDING */}
          {activeTab === "brain" && (
            <div className="space-y-4">
              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  LLM Provider Gateway
                </label>
                <select
                  value={formData.brain.provider}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      brain: {
                        ...formData.brain,
                        provider: e.target.value as any,
                      },
                    })
                  }
                  className="mat-input"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI Frontier</option>
                  <option value="deepseek">DeepSeek AI</option>
                  <option value="ollama">Ollama Self-Hosted</option>
                  <option value="litellm">LiteLLM Unified Proxy</option>
                </select>
              </div>

              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Model Identifier
                </label>
                <input
                  type="text"
                  value={formData.brain.model}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      brain: { ...formData.brain, model: e.target.value },
                    })
                  }
                  className="mat-input font-mono text-xs"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-content-muted font-semibold">
                    Temperature ({formData.brain.temperature})
                  </label>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={formData.brain.temperature}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      brain: {
                        ...formData.brain,
                        temperature: parseFloat(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-content-muted font-semibold">
                    Top-P Nucleus ({formData.brain.top_p})
                  </label>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={formData.brain.top_p}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      brain: {
                        ...formData.brain,
                        top_p: parseFloat(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-primary"
                />
              </div>
            </div>
          )}

          {/* TAB 5: VOYAGER SKILLS */}
          {activeTab === "skills" && (
            <div className="space-y-4">
              <p className="text-[11px] text-content-muted leading-relaxed">
                Assign vectorized executable Python skills retrieved dynamically during task
                execution.
              </p>

              <div className="space-y-2">
                {[
                  {
                    id: "skill-sec-filing-parser",
                    name: "SEC 10-K Balance Sheet Parser",
                  },
                  {
                    id: "skill-numpy-monte-carlo",
                    name: "Monte Carlo Stochastic Risk Evaluator",
                  },
                  {
                    id: "skill-fallacy-checker",
                    name: "Epistemic Fallacy & Syllogism Validator",
                  },
                ].map((skill) => {
                  const isChecked = (formData.skills || []).includes(skill.id);
                  return (
                    <label
                      key={skill.id}
                      className="p-3 rounded-xl border border-surface-border bg-surface-hover/40 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const current = formData.skills || [];
                          const updated = e.target.checked
                            ? [...current, skill.id]
                            : current.filter((s) => s !== skill.id);
                          setFormData({ ...formData, skills: updated });
                        }}
                        className="w-4 h-4 accent-primary rounded"
                      />
                      <div>
                        <span className="font-semibold text-content-main block">
                          {skill.name}
                        </span>
                        <span className="text-[10px] text-content-muted font-mono">
                          {skill.id}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 6: MEMORY */}
          {activeTab === "memory" && (
            <div className="space-y-4">
              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Working Context Message Window
                </label>
                <input
                  type="number"
                  value={formData.memory?.working_memory_window || 10}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      memory: {
                        ...formData.memory,
                        working_memory_window: parseInt(e.target.value) || 10,
                      },
                    })
                  }
                  className="mat-input"
                />
              </div>

              <div>
                <label className="block text-content-muted font-semibold mb-1">
                  Archival Top-K Retrieval Depth
                </label>
                <input
                  type="number"
                  value={formData.memory?.archival_top_k || 5}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      memory: {
                        ...formData.memory,
                        archival_top_k: parseInt(e.target.value) || 5,
                      },
                    })
                  }
                  className="mat-input"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-surface-border bg-surface-hover/30 flex items-center justify-end gap-3">
          <button onClick={onClose} className="mat-btn mat-btn-outline text-xs">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="mat-btn mat-btn-primary text-xs font-semibold flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Update Node Persona</span>
          </button>
        </div>
      </div>
    </>
  );
}
