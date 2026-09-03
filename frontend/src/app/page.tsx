"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { GraphSummary, ChatSession, VoyagerSkill, PersonNodeManifest, ExpeLReflection } from "@/lib/types";
import {
  Sparkles,
  TrendingUp,
  Cpu,
  Bot,
  Workflow,
  Zap,
  Play,
  Scale,
  Search,
  Code2,
  Brain,
  CheckCircle2,
} from "lucide-react";

export default function DashboardPage() {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [skills, setSkills] = useState<VoyagerSkill[]>([]);
  const [personas, setPersonas] = useState<PersonNodeManifest[]>([]);
  const [reflections, setReflections] = useState<ExpeLReflection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [gList, sList, skList, pList, rList] = await Promise.all([
          api.getGraphs(),
          api.getSessions(),
          api.getSkills(),
          api.getPersonas(),
          api.getPostMortems(),
        ]);
        setGraphs(gList);
        setSessions(sList);
        setSkills(skList);
        setPersonas(pList);
        setReflections(rList);
      } catch (err) {
        console.error("Dashboard data load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute actual role distribution from real personas
  const roleCounts = personas.reduce<Record<string, number>>((acc, p) => {
    const role = p.identity?.role?.toLowerCase() || "";
    if (role.includes("critic") || role.includes("auditor")) acc.critic = (acc.critic || 0) + 1;
    else if (role.includes("developer") || role.includes("engineer")) acc.developer = (acc.developer || 0) + 1;
    else if (role.includes("research") || role.includes("analyst")) acc.researcher = (acc.researcher || 0) + 1;
    else acc.orchestrator = (acc.orchestrator || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Top Row: Welcome Card + Stat Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Welcome Hero Banner (Matching Materialize Card) */}
        <div className="lg:col-span-5 mat-card p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Multi-Agent High Concurrency</span>
            </div>
            <h2 className="text-2xl font-bold text-content-main">
              Welcome, Architect! 🚀
            </h2>
            <p className="text-sm text-content-muted mt-1 leading-relaxed max-w-xs">
              Your autonomous AI agent collective is running live on Clever Cloud with Magentic-One
              dual-ledger orchestration and PostgreSQL pgvector memory.
            </p>

            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-primary">
                {reflections.length > 0 ? "100%" : "Live"}
              </span>
              <span className="text-xs font-medium text-content-muted">
                {reflections.length} Experiential Post-Mortem Trace(s) Processed
              </span>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Link
                href="/canvas"
                className="mat-btn mat-btn-primary text-xs font-semibold px-4 py-2.5"
              >
                <Workflow className="w-4 h-4" />
                <span>Open Canvas Studio</span>
              </Link>
              <Link
                href="/chat"
                className="mat-btn mat-btn-outline text-xs font-medium px-4 py-2.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Launch Chat</span>
              </Link>
            </div>
          </div>

          {/* 3D-Styled Decorative Badge Artwork */}
          <div className="absolute right-4 bottom-4 w-32 h-32 opacity-90 hidden sm:block pointer-events-none">
            <div className="w-full h-full rounded-2xl bg-gradient-to-tr from-primary/30 to-amber-500/20 backdrop-blur-xs border border-primary/20 flex items-center justify-center shadow-mat-glow animate-float-slow">
              <div className="relative">
                <Bot className="w-16 h-16 text-primary" />
                <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-black shadow-xs">
                  ✓
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Real Metric Stat Cards */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Card 1: Active Graphs */}
          <div className="mat-card p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Workflow className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-500 gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Live
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-content-main">
                {graphs.length}
              </h3>
              <p className="text-xs text-content-muted font-medium mt-0.5">
                Active Teams
              </p>
            </div>
            <div className="mt-2 text-[10px] text-content-subtle">
              Compiled In PostgreSQL
            </div>
          </div>

          {/* Card 2: Voyager Dynamic Skills */}
          <div className="mat-card p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
                <Cpu className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-500 gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> AST Verified
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-content-main">
                {skills.length}
              </h3>
              <p className="text-xs text-content-muted font-medium mt-0.5">
                Voyager Skills
              </p>
            </div>
            <div className="mt-2 text-[10px] text-content-subtle">
              Sandbox Python Tools
            </div>
          </div>

          {/* Card 3: Chat Deliberations */}
          <div className="mat-card p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                <Bot className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-500 gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-content-main">
                {sessions.length}
              </h3>
              <p className="text-xs text-content-muted font-medium mt-0.5">
                Chat Sessions
              </p>
            </div>
            <div className="mt-2 text-[10px] text-content-subtle">
              Dual-Ledger Conversations
            </div>
          </div>

          {/* Card 4: Person Nodes */}
          <div className="mat-card p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
                <Brain className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center text-[11px] font-bold text-primary gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Rigorous
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-content-main">
                {personas.length}
              </h3>
              <p className="text-xs text-content-muted font-medium mt-0.5">
                AI Personas
              </p>
            </div>
            <div className="mt-2 text-[10px] text-content-subtle">
              Constitutional Ethics Bound
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Dialectical Consensus Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Project Milestone Timeline */}
        <div className="lg:col-span-8 mat-card p-6">
          <div className="flex items-center justify-between pb-4 border-b border-surface-border">
            <div>
              <h3 className="font-bold text-base text-content-main">
                Magentic-One Post-Mortem Traces
              </h3>
              <p className="text-xs text-content-muted mt-0.5">
                Recent experiential reflection jobs processed by the ARQ learning worker
              </p>
            </div>
            <span className="mat-badge badge-primary">
              {reflections.length} Runs Audited
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {reflections.length > 0 ? (
              reflections.slice(0, 5).map((r, idx) => (
                <div
                  key={r.id || idx}
                  className="p-3 rounded-xl border border-surface-border flex items-center justify-between gap-4 bg-surface-hover/30 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      #{idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-content-main">
                        {r.principle}
                      </p>
                      <p className="text-[11px] text-content-muted">
                        {r.trigger_context}
                      </p>
                    </div>
                  </div>
                  <span className="mat-badge badge-success font-semibold shrink-0">
                    Completed
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-content-muted">
                No post-mortem traces recorded yet. Run a chat session to generate reflections.
              </div>
            )}
          </div>
        </div>

        {/* Agent Persona Distribution */}
        <div className="lg:col-span-4 mat-card p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-base text-content-main">
              Agent Persona Distribution
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              Active roles across database-persisted person nodes
            </p>

            <div className="mt-6 flex items-center justify-center">
              <div className="relative w-36 h-36 rounded-full border-8 border-primary/20 border-t-primary border-r-cyan-500 border-b-amber-500 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-3xl font-black text-content-main">
                    {personas.length}
                  </span>
                  <span className="block text-[10px] font-semibold text-content-muted uppercase">
                    Nodes
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  Orchestrator Nodes
                </span>
                <span className="font-bold text-content-main">
                  {roleCounts.orchestrator || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  Research Specialists
                </span>
                <span className="font-bold text-content-main">
                  {roleCounts.researcher || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Dialectical Critics
                </span>
                <span className="font-bold text-content-main">
                  {roleCounts.critic || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2 h-2 rounded-full bg-cyan-500" />
                  Software & Quant Developers
                </span>
                <span className="font-bold text-content-main">
                  {roleCounts.developer || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Pre-configured Teams Catalog */}
      <div className="mat-card p-6">
        <div className="flex items-center justify-between pb-4 border-b border-surface-border">
          <div>
            <h3 className="font-bold text-base text-content-main">
              Production Agent Teams Registry
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              Live multi-agent graph architectures fetched directly from PostgreSQL
            </p>
          </div>
          <Link
            href="/canvas"
            className="mat-btn mat-btn-primary text-xs font-semibold px-3 py-1.5"
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>Create New Team Graph</span>
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {graphs.map((graph) => (
            <div
              key={graph.id}
              className="p-4.5 rounded-xl border border-surface-border hover:border-primary/50 transition-all bg-surface-hover/30 flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="mat-badge badge-primary">
                    {graph.node_count} Person Nodes
                  </span>
                  <span className="text-[10px] text-content-muted font-mono">
                    {graph.edge_count} Edges
                  </span>
                </div>
                <h4 className="font-bold text-base text-content-main mt-3 group-hover:text-primary transition-colors">
                  {graph.name}
                </h4>
                <p className="text-xs text-content-muted mt-1.5 line-clamp-2">
                  {graph.description || "Multi-agent autonomous collaborative team."}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-surface-border flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {graph.is_compiled ? "Compiled & Ready" : "Draft"}
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/canvas?graph=${graph.id}`}
                    className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-primary transition-colors"
                    title="Design in Canvas"
                  >
                    <Workflow className="w-4 h-4" />
                  </Link>
                  <Link
                    href={`/chat?graph=${graph.id}`}
                    className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white transition-colors"
                    title="Chat with Team"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
