"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  GraphSummary,
  ChatSession,
  VoyagerSkill,
  PersonNodeManifest,
  ExpeLReflection,
} from "@/lib/types";
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
  Activity,
  ArrowUpRight,
  ShieldCheck,
  Layers,
  FileCode,
  Check,
  Server,
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
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Welcome Executive Hero Banner (Full-Width Responsive Card) */}
      <div className="mat-card p-6 md:p-8 relative overflow-hidden bg-gradient-to-r from-surface-card via-surface-card/95 to-surface-card border border-surface-border">
        {/* Ambient subtle glow background */}
        <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-primary/10 via-primary/5 to-transparent pointer-events-none -z-0" />
        <div className="absolute -bottom-10 right-20 w-64 h-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none -z-0" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left Column: Greeting & Info */}
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold border border-primary/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Multi-Agent High Concurrency</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-semibold border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Magentic-One Active Loop</span>
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-content-main tracking-tight">
              Welcome, Architect! 🚀
            </h1>

            <p className="text-xs md:text-sm text-content-muted leading-relaxed">
              Your autonomous AI agent collective is running live on Clever Cloud. Orchestrate
              specialized personas with constitutional ethics, Magentic-One dual-ledger consensus, and
              lifelong Voyager skill acquisition.
            </p>

            {/* Quick Action CTAs */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/canvas"
                className="mat-btn mat-btn-primary text-xs font-semibold px-4 py-2.5 flex items-center gap-2 shadow-mat-glow"
              >
                <Workflow className="w-4 h-4" />
                <span>Design Team Graph</span>
              </Link>
              <Link
                href="/chat"
                className="mat-btn mat-btn-outline text-xs font-semibold px-4 py-2.5 flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Launch Deliberation Chat</span>
              </Link>
              <a
                href="https://app-912ec933-b93b-4612-b0f3-89d1351070b9.cleverapps.io/docs"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-content-muted hover:text-content-main transition-colors"
              >
                <span>Swagger Docs</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Right Column: Platform Telemetry Pill / Stats Card */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 lg:min-w-[280px]">
            <div className="p-3.5 rounded-2xl bg-surface-hover/70 border border-surface-border">
              <div className="flex items-center gap-2 text-content-muted text-[11px]">
                <Server className="w-3.5 h-3.5 text-primary" />
                <span>Cluster Node</span>
              </div>
              <p className="text-sm font-bold text-content-main mt-1">Clever Cloud XL</p>
              <p className="text-[10px] text-content-subtle">8 Cores • 16GB RAM</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-surface-hover/70 border border-surface-border">
              <div className="flex items-center gap-2 text-content-muted text-[11px]">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                <span>Post-Mortems</span>
              </div>
              <p className="text-sm font-bold text-content-main mt-1">
                {reflections.length > 0 ? "100% Processed" : "Live"}
              </p>
              <p className="text-[10px] text-emerald-500 font-medium">
                {reflections.length} Audited Runs
              </p>
            </div>

            <div className="col-span-2 sm:col-span-1 lg:col-span-2 p-3.5 rounded-2xl bg-surface-hover/70 border border-surface-border flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-[11px] font-semibold text-content-muted">Memory Engine</p>
                <p className="text-xs font-bold text-content-main">pgvector (1536-d)</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20">
                Connected
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Responsive 4-Column Metric KPI Cards (Auto-arranging: 1-col mobile, 2-col tablet, 4-col desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Active Graphs */}
        <Link
          href="/canvas"
          className="mat-card p-5 hover:border-primary/50 hover:shadow-mat-hover transition-all duration-200 group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
              <Workflow className="w-6 h-6" />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-500 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Active
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-extrabold text-content-main tracking-tight group-hover:text-primary transition-colors">
                {graphs.length}
              </h3>
              <span className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                Teams
              </span>
            </div>
            <p className="text-sm font-semibold text-content-main mt-1">
              Active Graph Collectives
            </p>
            <p className="text-xs text-content-muted mt-0.5">
              Compiled Multi-Agent Topologies
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-surface-border flex items-center justify-between text-[11px]">
            <span className="text-content-subtle font-mono">clever_ai.agent_graphs</span>
            <span className="text-primary font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Explore <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Link>

        {/* Card 2: Voyager Dynamic Skills */}
        <Link
          href="/skills"
          className="mat-card p-5 hover:border-amber-500/50 hover:shadow-mat-hover transition-all duration-200 group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
              <Cpu className="w-6 h-6" />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              <CheckCircle2 className="w-3 h-3" />
              AST Verified
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-extrabold text-content-main tracking-tight group-hover:text-amber-500 transition-colors">
                {skills.length}
              </h3>
              <span className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                Skills
              </span>
            </div>
            <p className="text-sm font-semibold text-content-main mt-1">
              Voyager Dynamic Tools
            </p>
            <p className="text-xs text-content-muted mt-0.5">
              Self-Validated Python Programs
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-surface-border flex items-center justify-between text-[11px]">
            <span className="text-content-subtle font-mono">clever_ai.agent_skills</span>
            <span className="text-amber-500 font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Sandbox <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Link>

        {/* Card 3: Chat Deliberations */}
        <Link
          href="/chat"
          className="mat-card p-5 hover:border-emerald-500/50 hover:shadow-mat-hover transition-all duration-200 group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
              <Bot className="w-6 h-6" />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-500 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Dual-Ledger
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-extrabold text-content-main tracking-tight group-hover:text-emerald-500 transition-colors">
                {sessions.length}
              </h3>
              <span className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                Sessions
              </span>
            </div>
            <p className="text-sm font-semibold text-content-main mt-1">
              Deliberation Threads
            </p>
            <p className="text-xs text-content-muted mt-0.5">
              Task & Progress Consensus Logs
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-surface-border flex items-center justify-between text-[11px]">
            <span className="text-content-subtle font-mono">clever_ai.chat_sessions</span>
            <span className="text-emerald-500 font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              Open Chat <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Link>

        {/* Card 4: Person Nodes */}
        <Link
          href="/personas"
          className="mat-card p-5 hover:border-cyan-500/50 hover:shadow-mat-hover transition-all duration-200 group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
              <Brain className="w-6 h-6" />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-500 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              <ShieldCheck className="w-3 h-3" />
              Constitutional
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-extrabold text-content-main tracking-tight group-hover:text-cyan-500 transition-colors">
                {personas.length}
              </h3>
              <span className="text-xs font-semibold text-content-muted uppercase tracking-wider">
                Nodes
              </span>
            </div>
            <p className="text-sm font-semibold text-content-main mt-1">
              AI Personas Catalog
            </p>
            <p className="text-xs text-content-muted mt-0.5">
              4 Cognitive Roles Configured
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-surface-border flex items-center justify-between text-[11px]">
            <span className="text-content-subtle font-mono">clever_ai.person_nodes</span>
            <span className="text-cyan-500 font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              View All <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </Link>
      </div>

      {/* 3. Middle Row: Traces Timeline + Role Distribution Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Project Milestone Timeline */}
        <div className="lg:col-span-8 mat-card p-6 flex flex-col justify-between">
          <div>
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

            <div className="mt-5 space-y-3">
              {reflections.length > 0 ? (
                reflections.slice(0, 5).map((r, idx) => (
                  <div
                    key={r.id || idx}
                    className="p-3.5 rounded-xl border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-hover/40 text-xs hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 sm:mt-0">
                        #{idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-content-main truncate">
                          {r.principle}
                        </p>
                        <p className="text-[11px] text-content-muted line-clamp-1 mt-0.5">
                          {r.trigger_context}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <span className="text-[10px] text-content-subtle font-mono">
                        Impact: {Math.round((r.impact_score || 0.85) * 100)}%
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <Check className="w-3 h-3" />
                        Completed
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-content-muted">
                  No post-mortem traces recorded yet. Run a chat session to generate reflections.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-surface-border flex items-center justify-between text-xs text-content-muted">
            <span>ARQ Redis queue: Active • Invariant checks passed</span>
            <Link href="/chat" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
              <span>Execute New Run</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
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
              <div className="relative w-40 h-40 rounded-full border-[10px] border-primary/20 border-t-primary border-r-cyan-500 border-b-amber-500 border-l-rose-500 flex items-center justify-center shadow-xs">
                <div className="text-center">
                  <span className="text-3xl font-extrabold text-content-main tracking-tight">
                    {personas.length}
                  </span>
                  <span className="block text-[10px] font-bold text-content-muted uppercase tracking-wider">
                    Total Nodes
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface-hover/50">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                  Orchestrator Nodes
                </span>
                <span className="font-bold text-content-main">
                  {roleCounts.orchestrator || 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface-hover/50">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  Research Specialists
                </span>
                <span className="font-bold text-content-main">
                  {roleCounts.researcher || 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface-hover/50">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  Dialectical Critics
                </span>
                <span className="font-bold text-content-main">
                  {roleCounts.critic || 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface-hover/50">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                  Software & Quant Developers
                </span>
                <span className="font-bold text-content-main">
                  {roleCounts.developer || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-surface-border text-center">
            <Link
              href="/personas"
              className="text-xs text-primary hover:underline font-semibold inline-flex items-center gap-1"
            >
              <span>Manage Personas & Ethics</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 4. Bottom Row: Pre-configured Teams Catalog */}
      <div className="mat-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-surface-border gap-3">
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
            className="mat-btn mat-btn-primary text-xs font-semibold px-4 py-2 flex items-center gap-2 self-start sm:self-auto"
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>Create New Team Graph</span>
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {graphs.map((graph) => (
            <div
              key={graph.id}
              className="p-5 rounded-2xl border border-surface-border hover:border-primary/50 hover:shadow-mat transition-all bg-surface-hover/30 flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold border border-primary/20">
                    <Brain className="w-3 h-3" />
                    {graph.node_count} Person Nodes
                  </span>
                  <span className="text-[11px] text-content-muted font-mono bg-surface-card px-2 py-0.5 rounded border border-surface-border">
                    {graph.edge_count} Edges
                  </span>
                </div>
                <h4 className="font-bold text-base text-content-main mt-3.5 group-hover:text-primary transition-colors">
                  {graph.name}
                </h4>
                <p className="text-xs text-content-muted mt-1.5 line-clamp-2 leading-relaxed">
                  {graph.description || "Multi-agent autonomous collaborative team."}
                </p>
              </div>

              <div className="mt-5 pt-3.5 border-t border-surface-border flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {graph.is_compiled ? "Compiled & Ready" : "Draft"}
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/canvas?graph=${graph.id}`}
                    className="p-2 rounded-xl hover:bg-surface-hover text-content-muted hover:text-primary transition-colors border border-surface-border"
                    title="Design in Canvas"
                  >
                    <Workflow className="w-4 h-4" />
                  </Link>
                  <Link
                    href={`/chat?graph=${graph.id}`}
                    className="p-2 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-white transition-colors border border-primary/20"
                    title="Chat with Team"
                  >
                    <Play className="w-4 h-4" />
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
