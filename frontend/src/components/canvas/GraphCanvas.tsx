"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { OrchestratorNode } from "./nodes/OrchestratorNode";
import { PersonNode } from "./nodes/PersonNode";
import { CustomEdge } from "./edges/CustomEdge";
import { PersonaDrawer } from "./PersonaDrawer";
import { GraphToolbar } from "./GraphToolbar";
import { GraphDSL, PersonNodeManifest, OrchestratorSpec } from "@/lib/types";
import { api } from "@/lib/api";
import { Code2, X, Copy, Check } from "lucide-react";

const nodeTypes = {
  orchestratorNode: OrchestratorNode,
  personNode: PersonNode,
};

const edgeTypes = {
  customEdge: CustomEdge,
};

interface GraphCanvasProps {
  initialDSL?: GraphDSL;
  graphId?: string;
  /** Fired after a successful save, with the mode that produced it. */
  onSaved?: (dsl: GraphDSL, mode: "draft" | "compiled") => void;
  /** Fired when an unsaved canvas is persisted for the first time. */
  onCreated?: (graphId: string) => void;
}

export function GraphCanvas({ initialDSL, graphId, onSaved, onCreated }: GraphCanvasProps) {
  const [selectedPersona, setSelectedPersona] = useState<PersonNodeManifest | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [dslModalOpen, setDslModalOpen] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedDSL, setCopiedDSL] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    valid: boolean;
    message?: string;
  } | null>(null);

  // Build initial React Flow nodes from DSL
  const initialNodes: Node[] = useMemo(() => {
    if (!initialDSL) return [];
    const nodes: Node[] = [];

    // Orchestrator
    if (initialDSL.orchestrator) {
      nodes.push({
        id: initialDSL.orchestrator.node_id,
        type: "orchestratorNode",
        position: initialDSL.orchestrator.canvas_position || { x: 420, y: 60 },
        data: { orchestrator: initialDSL.orchestrator },
      });
    }

    // Specialist Person Nodes
    (initialDSL.nodes || []).forEach((n, idx) => {
      nodes.push({
        id: n.identity.id,
        type: "personNode",
        position: n.canvas_position || {
          x: 100 + (idx % 3) * 340,
          y: 280 + Math.floor(idx / 3) * 260,
        },
        data: n,
      });
    });

    return nodes;
  }, [initialDSL]);

  // Build initial React Flow edges from DSL
  const initialEdges: Edge[] = useMemo(() => {
    if (!initialDSL?.edges) return [];
    return initialDSL.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "customEdge",
      data: { channel: e.channel, notes: e.notes },
    }));
  }, [initialDSL]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Connect edges
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `edge-${Date.now()}`,
        type: "customEdge",
        data: { channel: "subtask_dispatch" },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  // Node Selection
  const onNodeClick = useCallback((_: any, node: Node) => {
    if (node.type === "personNode") {
      setSelectedPersona(node.data as unknown as PersonNodeManifest);
      setIsDrawerOpen(true);
    }
  }, []);

  // Update Persona Callback from Drawer
  const handleSavePersona = (updated: PersonNodeManifest) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === updated.identity.id) {
          return { ...n, data: updated };
        }
        return n;
      })
    );
  };

  // Compile Current Canvas into JSON DSL
  const exportCurrentDSL = useCallback((): GraphDSL => {
    const orchNode = nodes.find((n) => n.type === "orchestratorNode");
    const personNodes = nodes.filter((n) => n.type === "personNode");

    const orchestrator: OrchestratorSpec = orchNode
      ? {
          ...(orchNode.data as any).orchestrator,
          canvas_position: orchNode.position,
        }
      : {
          node_id: "orch-01",
          name: "Magentic Orchestrator",
          duty: "Outer planning loop & verification",
          stall_threshold: 4,
          brain: {
            provider: "openai",
            model: "o1-preview",
            temperature: 0.2,
            top_p: 0.95,
            max_context_tokens: 32000,
          },
        };

    const dslNodes: PersonNodeManifest[] = personNodes.map((n) => ({
      ...(n.data as unknown as PersonNodeManifest),
      canvas_position: n.position,
    }));

    const dslEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      channel: (e.data?.channel as any) || "subtask_dispatch",
      notes: e.data?.notes as string,
    }));

    return {
      version: "1.0.0",
      name: initialDSL?.name || "Autonomous Agent Collective",
      description: initialDSL?.description || "Compiled visual graph DSL",
      orchestrator,
      nodes: dslNodes,
      edges: dslEdges,
    };
  }, [nodes, edges, initialDSL]);

  // Validation
  const handleValidate = async () => {
    const dsl = exportCurrentDSL();
    // Local rules
    const orchs = nodes.filter((n) => n.type === "orchestratorNode");
    if (orchs.length === 0) {
      setValidationStatus({ valid: false, message: "Missing Orchestrator Node" });
      return;
    }
    if (orchs.length > 1) {
      setValidationStatus({
        valid: false,
        message: "Multiple Orchestrators not allowed",
      });
      return;
    }

    const res = await api.validateGraph(dsl);
    if (res.valid) {
      setValidationStatus({
        valid: true,
        message: `DSL Valid: ${dsl.nodes.length} Specialists, ${dsl.edges.length} Channels`,
      });
    } else {
      setValidationStatus({
        valid: false,
        message: res.errors?.join(", ") || "Validation error",
      });
    }
  };

  // Draft save: persist the canvas as-is, without requiring a valid graph.
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const dsl = exportCurrentDSL();
      let targetId = graphId;
      if (!targetId) {
        const created = await api.createGraph(dsl);
        targetId = created.id;
        onCreated?.(created.id);
      } else {
        await api.saveGraphDraft(targetId, dsl);
      }
      setValidationStatus({ valid: true, message: "Draft saved." });
      onSaved?.(dsl, "draft");
    } catch (err: any) {
      setValidationStatus({ valid: false, message: err.message || "Save failed" });
    } finally {
      setIsSaving(false);
    }
  };

  // Compile & Save: send the *current* canvas DSL so edits are never lost.
  const handleCompileAndSave = async () => {
    setIsCompiling(true);
    try {
      const dsl = exportCurrentDSL();
      let targetId = graphId;
      if (!targetId) {
        const created = await api.createGraph(dsl);
        targetId = created.id;
        onCreated?.(created.id);
      }
      // Always pass the edited DSL: compiling without a body would rebuild the
      // previously stored canvas and silently drop the current edits.
      const result = await api.compileGraph(targetId, dsl);
      const errors = (result.issues || []).filter((i) => i.severity === "error");
      if (errors.length) {
        setValidationStatus({
          valid: false,
          message: errors.map((e) => e.message).join(" · "),
        });
        return;
      }
      const warnings = (result.issues || []).filter((i) => i.severity === "warning");
      setValidationStatus({
        valid: true,
        message: warnings.length
          ? `Compiled with ${warnings.length} warning(s): ${warnings[0].message}`
          : `Compiled v${result.version} — ${result.node_count} nodes, ${result.edge_count} channels. Ready to chat.`,
      });
      onSaved?.(dsl, "compiled");
    } catch (err: any) {
      setValidationStatus({
        valid: false,
        message: err.message || "Compilation failed",
      });
    } finally {
      setIsCompiling(false);
    }
  };

  // Add Nodes
  const handleAddOrchestrator = () => {
    if (nodes.some((n) => n.type === "orchestratorNode")) {
      alert("An Orchestrator Node already exists on the canvas.");
      return;
    }
    const newNode: Node = {
      id: `orch-${Date.now()}`,
      type: "orchestratorNode",
      position: { x: 420, y: 60 },
      data: {
        orchestrator: {
          node_id: `orch-${Date.now()}`,
          name: "Magentic Orchestrator",
          duty: "Outer planning loop & consensus verification",
          stall_threshold: 4,
          brain: {
            provider: "openai",
            model: "o1-preview",
            temperature: 0.2,
            top_p: 0.95,
            max_context_tokens: 32000,
          },
        },
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleAddPersonNode = (roleName: string = "Specialist Agent") => {
    const id = `spec-${Date.now().toString().slice(-4)}`;
    const newNode: Node = {
      id,
      type: "personNode",
      position: { x: 200 + Math.random() * 300, y: 300 + Math.random() * 150 },
      data: {
        identity: {
          id,
          name: `Agent ${id.toUpperCase()}`,
          role: roleName,
          duty: "Autonomous subtask execution within constitutional guardrails",
        },
        persona: {
          tone: "Objective, methodical, analytical",
          temperament: "Collaborative problem solver",
          cognitive_style: "First-principles reasoning",
          quirks: ["Cites verified sources"],
        },
        ethics: {
          negative_constraints: ["Zero ungrounded hallucinations"],
          operational_guardrails: ["Verify citations before returning"],
          safety_invariants: ["Adhere to factual ground truth"],
        },
        brain: {
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          temperature: 0.2,
          top_p: 0.9,
          max_context_tokens: 16000,
        },
        skills: ["skill-sec-filing-parser"],
        memory: {
          working_memory_window: 10,
          archival_top_k: 5,
          importance_threshold: 0.75,
        },
      } as PersonNodeManifest,
    };
    setNodes((nds) => [...nds, newNode]);
  };

  return (
    <div className="relative w-full h-[calc(100vh-140px)] rounded-2xl border border-surface-border overflow-hidden bg-surface-bg shadow-mat">
      {/* Visual Canvas Toolbar */}
      <GraphToolbar
        onAddOrchestrator={handleAddOrchestrator}
        onAddPersonNode={handleAddPersonNode}
        onValidate={handleValidate}
        onSaveDraft={handleSaveDraft}
        onCompileAndSave={handleCompileAndSave}
        onOpenTemplates={() => {}}
        onOpenDSLModal={() => setDslModalOpen(true)}
        isSaving={isSaving}
        isCompiling={isCompiling}
        validationStatus={validationStatus}
      />

      {/* React Flow Workspace */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        className="bg-dot-grid"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.5}
          color="rgba(140, 140, 160, 0.25)"
        />
        <Controls className="bg-surface-card border border-surface-border rounded-xl shadow-xs" />
        <MiniMap
          className="rounded-xl border border-surface-border overflow-hidden shadow-xs"
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
      </ReactFlow>

      {/* Persona Modeling Slide-out Drawer */}
      <PersonaDrawer
        node={selectedPersona}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSave={handleSavePersona}
      />

      {/* JSON DSL Modal */}
      {dslModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-surface-card border border-surface-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b border-surface-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-sm text-content-main">
                  Intermediate JSON DSL Specification
                </h3>
              </div>
              <button
                onClick={() => setDslModalOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto bg-slate-950 text-slate-100 font-mono text-xs">
              <pre>{JSON.stringify(exportCurrentDSL(), null, 2)}</pre>
            </div>

            <div className="p-3 border-t border-surface-border bg-surface-hover/50 flex justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    JSON.stringify(exportCurrentDSL(), null, 2)
                  );
                  setCopiedDSL(true);
                  setTimeout(() => setCopiedDSL(false), 2000);
                }}
                className="mat-btn mat-btn-outline text-xs flex items-center gap-1.5"
              >
                {copiedDSL ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedDSL ? "Copied" : "Copy DSL JSON"}</span>
              </button>
              <button
                onClick={() => setDslModalOpen(false)}
                className="mat-btn mat-btn-primary text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
