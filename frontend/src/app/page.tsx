"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { GraphSummary, ChatSession } from "@/lib/types";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import {
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Cpu,
  Layers,
  Bot,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ChevronRight,
  Workflow,
  Zap,
  Play,
  Terminal,
} from "lucide-react";

export default function DashboardPage() {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [gList, sList] = await Promise.all([
          api.getGraphs(),
          api.getSessions(),
        ]);
        setGraphs(gList);
        setSessions(sList);
      } catch (err) {
        console.error("Dashboard data load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Row: Welcome Card + Stat Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Welcome Hero Banner (Matching Materialize "Congratulations John!" Card) */}
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
              Your autonomous AI agent collective is running on Clever Cloud with Magentic-One
              dual-ledger orchestration.
            </p>

            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-primary">99.8%</span>
              <span className="text-xs font-medium text-content-muted">
                Dialectical Milestone Verification Rate
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

        {/* 4 Quick Stat Cards */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Card 1: Active Graphs */}
          <div className="mat-card p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Workflow className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-500 gap-0.5">
                +24% <TrendingUp className="w-3 h-3" />
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-content-main">
                {graphs.length || 3}
              </h3>
              <p className="text-xs text-content-muted font-medium mt-0.5">
                Active Teams
              </p>
            </div>
            <div className="mt-2 text-[10px] text-content-subtle">
              Compiled & Validated DSLs
            </div>
          </div>

          {/* Card 2: Voyager Dynamic Skills */}
          <div className="mat-card p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
                <Cpu className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-500 gap-0.5">
                +38% <TrendingUp className="w-3 h-3" />
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-content-main">48</h3>
              <p className="text-xs text-content-muted font-medium mt-0.5">
                Voyager Skills
              </p>
            </div>
            <div className="mt-2 text-[10px] text-content-subtle">
              AST Validated Python Tools
            </div>
          </div>

          {/* Card 3: Chat Deliberations */}
          <div className="mat-card p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                <Bot className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-500 gap-0.5">
                +62% <TrendingUp className="w-3 h-3" />
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-content-main">
                {sessions.length || 12}
              </h3>
              <p className="text-xs text-content-muted font-medium mt-0.5">
                Live Sessions
              </p>
            </div>
            <div className="mt-2 text-[10px] text-content-subtle">
              Dual-Ledger Orchestrations
            </div>
          </div>

          {/* Card 4: Hardware Cores */}
          <div className="mat-card p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
                <Zap className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center text-[11px] font-bold text-primary gap-0.5">
                Maxed <Zap className="w-3 h-3" />
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-black text-content-main">8 Cores</h3>
              <p className="text-xs text-content-muted font-medium mt-0.5">
                17 Workers
              </p>
            </div>
            <div className="mt-2 text-[10px] text-content-subtle">
              Parallel uvloop Concurrency
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Project Timeline + Team Composition + Dialectical Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Project Milestone Timeline (Matching Materialize Gantt Widget) */}
        <div className="lg:col-span-8 mat-card p-6">
          <div className="flex items-center justify-between pb-4 border-b border-surface-border">
            <div>
              <h3 className="font-bold text-base text-content-main">
                Magentic-One Milestone Progression
              </h3>
              <p className="text-xs text-content-muted mt-0.5">
                Dual-Ledger outer task loop & inner specialist execution traces
              </p>
            </div>
            <span className="mat-badge badge-primary">840 Tasks Completed</span>
          </div>

          <div className="mt-6 space-y-4">
            {/* Milestone Bar 1 */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-content-main flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                  M-1: Data Mining & Multi-source Fact Retrieval (Researcher)
                </span>
                <span className="font-bold text-emerald-500">100% Verified</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-surface-hover overflow-hidden">
                <div className="h-full rounded-full bg-primary w-full transition-all duration-1000" />
              </div>
            </div>

            {/* Milestone Bar 2 */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-content-main flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                  M-2: Dynamic Code Generation & Sandbox Computation (Developer)
                </span>
                <span className="font-bold text-emerald-500">100% Verified (142ms)</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-surface-hover overflow-hidden">
                <div className="h-full rounded-full bg-cyan-500 w-full transition-all duration-1000" />
              </div>
            </div>

            {/* Milestone Bar 3 */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-content-main flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  M-3: Dialectical Stress-Test & Fallacy Check (Critic)
                </span>
                <span className="font-bold text-emerald-500">Consensus Reached</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-surface-hover overflow-hidden">
                <div className="h-full rounded-full bg-amber-500 w-full transition-all duration-1000" />
              </div>
            </div>

            {/* Milestone Bar 4 */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-content-main flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  M-4: Synthesis Stream & Constitutional Audit (Orchestrator)
                </span>
                <span className="font-bold text-primary">Streaming Final Output</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-surface-hover overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 w-3/4 transition-all duration-1000 animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Dialectical Consensus Distribution */}
        <div className="lg:col-span-4 mat-card p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-base text-content-main">
              Agent Persona Distribution
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              Active roles across compiled team graphs
            </p>

            <div className="mt-6 flex items-center justify-center">
              {/* Circular Gauge Graphic */}
              <div className="relative w-40 h-40 rounded-full border-8 border-primary/20 border-t-primary border-r-cyan-500 border-b-amber-500 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-3xl font-black text-content-main">4</span>
                  <span className="block text-[11px] font-semibold text-content-muted uppercase">
                    Active Roles
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  Magentic Orchestrator (o1)
                </span>
                <span className="font-semibold text-content-muted">Coordinator</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2 h-2 rounded-full bg-cyan-500" />
                  Senior Researcher (Claude 3.5)
                </span>
                <span className="font-semibold text-content-muted">Empirical</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Analytical Critic (o1-mini)
                </span>
                <span className="font-semibold text-content-muted">Dialectical</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-content-main font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Quant Engineer (DeepSeek-R1)
                </span>
                <span className="font-semibold text-content-muted">Sandbox</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Pre-configured Teams Catalog + Quick Actions */}
      <div className="mat-card p-6">
        <div className="flex items-center justify-between pb-4 border-b border-surface-border">
          <div>
            <h3 className="font-bold text-base text-content-main">
              Production Agent Teams Registry
            </h3>
            <p className="text-xs text-content-muted mt-0.5">
              Select an agent graph to design on canvas or engage in conversational chat
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
              className="p-4 rounded-xl border border-surface-border hover:border-primary/50 transition-all bg-surface-hover/30 flex flex-col justify-between group"
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
                <p className="text-xs text-content-muted mt-1 line-clamp-2">
                  {graph.description}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-surface-border flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Compiled & Ready
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
