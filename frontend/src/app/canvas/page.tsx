"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GraphCanvas } from "@/components/canvas/GraphCanvas";
import { api } from "@/lib/api";
import { GraphSummary } from "@/lib/types";
import { Workflow, Play } from "lucide-react";

function CanvasContent() {
  const searchParams = useSearchParams();
  const graphParam = searchParams.get("graph");

  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [selectedGraph, setSelectedGraph] = useState<GraphSummary | null>(null);

  useEffect(() => {
    async function loadGraphs() {
      try {
        const list = await api.getGraphs();
        setGraphs(list);
        if (graphParam) {
          const matched = list.find((g) => g.id === graphParam);
          if (matched) setSelectedGraph(matched);
          else setSelectedGraph(list[0]);
        } else if (list.length > 0) {
          setSelectedGraph(list[0]);
        }
      } catch (err) {
        console.error("Failed to load graphs:", err);
      }
    }
    loadGraphs();
  }, [graphParam]);

  return (
    <div className="space-y-4">
      {/* Canvas Top Bar */}
      <div className="mat-card px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Workflow className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base text-content-main leading-tight">
                {selectedGraph?.name || "Visual Graph Studio"}
              </h2>
              <span className="mat-badge badge-primary">
                {selectedGraph?.is_compiled ? "Compiled DSL" : "Draft"}
              </span>
            </div>
            <p className="text-xs text-content-muted">
              Hardware-accelerated @xyflow/react canvas • Magentic-One Architecture
            </p>
          </div>
        </div>

        {/* Graph Selector & Direct Action */}
        <div className="flex items-center gap-3">
          {graphs.length > 1 && (
            <select
              value={selectedGraph?.id || ""}
              onChange={(e) => {
                const target = graphs.find((g) => g.id === e.target.value);
                if (target) setSelectedGraph(target);
              }}
              className="mat-input text-xs py-1.5 px-3 max-w-xs font-medium"
            >
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}

          {selectedGraph && (
            <Link
              href={`/chat?graph=${selectedGraph.id}`}
              className="mat-btn mat-btn-primary text-xs font-semibold px-4 py-2 flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Chat With This Team</span>
            </Link>
          )}
        </div>
      </div>

      {/* Interactive Flowchart Canvas */}
      {selectedGraph?.dsl ? (
        <GraphCanvas
          key={selectedGraph.id}
          initialDSL={selectedGraph.dsl}
          graphId={selectedGraph.id}
          onSaved={(dsl) => {
            setSelectedGraph((prev) =>
              prev ? { ...prev, is_compiled: true, dsl } : null
            );
          }}
        />
      ) : (
        <div className="h-96 mat-card flex items-center justify-center">
          <div className="text-center space-y-2">
            <Workflow className="w-8 h-8 text-primary mx-auto animate-pulse" />
            <p className="text-xs text-content-muted">Loading Agent Graph Canvas...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CanvasPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 mat-card flex items-center justify-center">
          <Workflow className="w-8 h-8 text-primary animate-pulse" />
        </div>
      }
    >
      <CanvasContent />
    </Suspense>
  );
}
