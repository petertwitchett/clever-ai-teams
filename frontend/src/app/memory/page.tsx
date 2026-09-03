"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ArchivalMemory } from "@/lib/types";
import { Database, Search, Sparkles, Filter, Plus, Clock, Brain } from "lucide-react";

export default function MemoryPage() {
  const [memories, setMemories] = useState<ArchivalMemory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    async function load() {
      const list = await api.getMemories();
      setMemories(list);
    }
    load();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      const list = await api.getMemories();
      setMemories(list);
      return;
    }
    setIsSearching(true);
    try {
      const results = await api.searchMemory(searchQuery);
      setMemories(results);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mat-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg text-content-main flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Tiered Semantic Archival Memory (pgvector)
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            Vector-indexed 1536-dimensional storage holding long-term facts, domain knowledge, and
            distilled heuristics.
          </p>
        </div>
      </div>

      {/* Semantic Search Input */}
      <div className="mat-card p-4">
        <form onSubmit={handleSearch} className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agent archival memories via pgvector cosine similarity..."
              className="mat-input pl-10 text-xs py-2.5"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="mat-btn mat-btn-primary px-5 py-2.5 text-xs font-semibold"
          >
            {isSearching ? "Searching Vectors..." : "Similarity Search"}
          </button>
        </form>
      </div>

      {/* Memories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {memories.map((mem) => (
          <div
            key={mem.id}
            className="mat-card p-5 flex flex-col justify-between hover:border-primary/50 transition-all"
          >
            <div>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-surface-border">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                    <Brain className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-xs text-content-main">
                    {mem.node_name || mem.node_id}
                  </span>
                </div>
                {mem.similarity !== undefined && (
                  <span className="mat-badge badge-success text-[10px]">
                    Cosine Sim: {(mem.similarity * 100).toFixed(1)}%
                  </span>
                )}
              </div>

              <p className="text-xs text-content-main leading-relaxed mb-4">
                &ldquo;{mem.content}&rdquo;
              </p>
            </div>

            <div className="pt-3 border-t border-surface-border flex items-center justify-between text-[11px] text-content-muted">
              <span className="font-medium text-emerald-500">
                Importance: {(mem.importance * 100).toFixed(0)}%
              </span>
              <span className="font-mono text-[10px]">
                Accessed {mem.access_count} times
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
