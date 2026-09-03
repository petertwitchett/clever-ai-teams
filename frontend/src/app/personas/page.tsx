"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PersonNodeManifest } from "@/lib/types";
import { PersonaDrawer } from "@/components/canvas/PersonaDrawer";
import {
  Brain,
  ShieldCheck,
  Cpu,
  Zap,
  Database,
  Plus,
  Edit2,
  Scale,
  Search,
  Code2,
  Crown,
} from "lucide-react";

export default function PersonasPage() {
  const [personas, setPersonas] = useState<PersonNodeManifest[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<PersonNodeManifest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const list = await api.getPersonas();
        setPersonas(list);
      } catch (err) {
        console.error("Failed to load personas:", err);
      }
    }
    load();
  }, []);

  const getRoleIcon = (role: string) => {
    const r = role.toLowerCase();
    if (r.includes("critic")) return <Scale className="w-5 h-5 text-rose-500" />;
    if (r.includes("developer") || r.includes("engineer"))
      return <Code2 className="w-5 h-5 text-cyan-500" />;
    if (r.includes("research") || r.includes("analyst"))
      return <Search className="w-5 h-5 text-indigo-500" />;
    return <Brain className="w-5 h-5 text-primary" />;
  };

  const handleEdit = (p: PersonNodeManifest) => {
    setSelectedPersona(p);
    setDrawerOpen(true);
  };

  const handleSave = (updated: PersonNodeManifest) => {
    setPersonas((prev) =>
      prev.map((item) => (item.identity.id === updated.identity.id ? updated : item))
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mat-card p-5 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg text-content-main flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Personas & Constitutional Ethics Catalog
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            Multi-dimensional Letta persona architecture: Identity, Psychology, Constitutional
            Invariants, and Brain bindings.
          </p>
        </div>

        <button
          onClick={() => {
            const newId = `spec-${Date.now().toString().slice(-4)}`;
            const newPersona: PersonNodeManifest = {
              identity: {
                id: newId,
                name: "New Autonomous Agent",
                role: "Domain Specialist",
                duty: "Autonomous subtask execution within safety boundaries",
              },
              persona: {
                tone: "Rigorous and objective",
                temperament: "Methodical",
                cognitive_style: "Hypothesis testing",
                quirks: [],
              },
              ethics: {
                negative_constraints: ["Zero unauthorized assumptions"],
                operational_guardrails: ["Verify citations"],
                safety_invariants: ["Adhere to factual truth"],
              },
              brain: {
                provider: "anthropic",
                model: "claude-3-5-sonnet-20241022",
                temperature: 0.2,
                top_p: 0.9,
                max_context_tokens: 16000,
              },
              skills: [],
              memory: {
                working_memory_window: 10,
                archival_top_k: 5,
                importance_threshold: 0.75,
              },
            };
            setPersonas([...personas, newPersona]);
            handleEdit(newPersona);
          }}
          className="mat-btn mat-btn-primary text-xs font-semibold px-4 py-2 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Person Node</span>
        </button>
      </div>

      {/* Personas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {personas.map((p) => (
          <div
            key={p.identity.id}
            className="mat-card p-5 flex flex-col justify-between hover:border-primary/50 transition-all group"
          >
            <div>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-surface-hover border border-surface-border flex items-center justify-center shadow-xs">
                    {getRoleIcon(p.identity.role)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-content-main group-hover:text-primary transition-colors">
                      {p.identity.name}
                    </h3>
                    <span className="text-[11px] font-semibold text-content-muted block">
                      {p.identity.role}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleEdit(p)}
                  className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-primary transition-colors"
                  title="Edit Persona"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {/* Duty */}
              <p className="text-xs text-content-muted mt-3 line-clamp-2 leading-relaxed">
                {p.identity.duty}
              </p>

              {/* Brain & Model */}
              <div className="mt-4 p-2.5 rounded-xl bg-surface-hover/70 border border-surface-border flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-content-main font-semibold">
                  <Cpu className="w-3.5 h-3.5 text-primary" />
                  <span>{p.brain.model}</span>
                </div>
                <span className="text-[10px] uppercase font-mono text-content-muted">
                  {p.brain.provider}
                </span>
              </div>

              {/* Constitutional Guardrails */}
              <div className="mt-3 space-y-1.5">
                <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider block">
                  Constitutional Invariants (P0)
                </span>
                <div className="space-y-1">
                  {(p.ethics.negative_constraints || []).slice(0, 2).map((c, i) => (
                    <div
                      key={i}
                      className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-content-main flex items-center gap-1.5 truncate"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Meta */}
            <div className="mt-5 pt-3 border-t border-surface-border flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1 text-amber-500 font-semibold">
                <Zap className="w-3 h-3" />
                {p.skills?.length || 0} Voyager Tools
              </span>
              <span className="inline-flex items-center gap-1 text-content-muted font-mono">
                <Database className="w-3 h-3" />
                k={p.memory?.archival_top_k || 5}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Slide-out Drawer */}
      <PersonaDrawer
        node={selectedPersona}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
