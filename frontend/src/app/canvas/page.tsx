"use client";

import React, { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GraphCanvas } from "@/components/canvas/GraphCanvas";
import { api } from "@/lib/api";
import { GraphSummary } from "@/lib/types";
import {
  Workflow,
  Play,
  Plus,
  Search,
  Copy,
  Trash2,
  Pencil,
  Globe,
  Lock,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type SortKey = "updated_at" | "created_at" | "name" | "sessions";

function statusBadge(graph: GraphSummary): { label: string; cls: string } {
  switch (graph.status) {
    case "published":
      return { label: "Published", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" };
    case "compiled":
      return { label: "Compiled", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
    case "archived":
      return { label: "Archived", cls: "bg-slate-500/15 text-slate-500" };
    default:
      return { label: "Draft", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  }
}

function CanvasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const graphParam = searchParams.get("graph");

  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(graphParam);
  const [detail, setDetail] = useState<GraphSummary | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("updated_at");
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GraphSummary | null>(null);

  /** Load the canvas library — one request, counts included. */
  const loadLibrary = useCallback(
    async (opts?: { keepSelection?: boolean }) => {
      setLoadingLibrary(true);
      try {
        const page = await api.listGraphs({ search: search || undefined, sort, limit: 100 });
        setGraphs(page.items);
        setTotal(page.total);
        setError(null);

        if (!opts?.keepSelection) {
          setSelectedId((current) => {
            if (current && page.items.some((g) => g.id === current)) return current;
            return page.items[0]?.id ?? null;
          });
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load the canvas library.");
      } finally {
        setLoadingLibrary(false);
      }
    },
    [search, sort],
  );

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Load the selected canvas's DSL only when the selection changes.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    api
      .getGraph(selectedId)
      .then((g) => {
        if (!cancelled) setDetail(g);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load canvas.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectCanvas = (id: string) => {
    setSelectedId(id);
    router.replace(`/canvas?graph=${id}`, { scroll: false });
  };

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message || `${label} failed.`);
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = () =>
    runAction("create", async () => {
      const created = await api.createBlankGraph(
        `Untitled Team ${graphs.length + 1}`,
        "New agent team",
      );
      await loadLibrary({ keepSelection: true });
      selectCanvas(created.id);
    });

  const handleDuplicate = (graph: GraphSummary) =>
    runAction("duplicate", async () => {
      const clone = await api.duplicateGraph(graph.id, `${graph.name} (copy)`);
      await loadLibrary({ keepSelection: true });
      selectCanvas(clone.id);
    });

  const handleRename = (graph: GraphSummary) => {
    const name = window.prompt("Canvas name", graph.name)?.trim();
    if (!name || name === graph.name) return;
    return runAction("rename", async () => {
      await api.updateGraphMeta(graph.id, { name });
      await loadLibrary({ keepSelection: true });
      setDetail((prev) => (prev && prev.id === graph.id ? { ...prev, name } : prev));
    });
  };

  const handleTogglePublish = (graph: GraphSummary) =>
    runAction("publish", async () => {
      if (graph.status === "published") await api.unpublishGraph(graph.id);
      else await api.publishGraph(graph.id);
      await loadLibrary({ keepSelection: true });
    });

  const handleDelete = (graph: GraphSummary, force: boolean) =>
    runAction("delete", async () => {
      try {
        await api.deleteGraph(graph.id, { force });
      } catch (err: any) {
        // 409 => the canvas still owns chat history; ask before destroying it.
        if (err?.status === 409 && !force) {
          setConfirmDelete(graph);
          return;
        }
        throw err;
      }
      setConfirmDelete(null);
      const remaining = graphs.filter((g) => g.id !== graph.id);
      setGraphs(remaining);
      if (selectedId === graph.id) {
        const next = remaining[0]?.id ?? null;
        setSelectedId(next);
        if (next) router.replace(`/canvas?graph=${next}`, { scroll: false });
      }
      await loadLibrary({ keepSelection: true });
    });

  const selected = useMemo(
    () => graphs.find((g) => g.id === selectedId) ?? null,
    [graphs, selectedId],
  );
  const badge = selected ? statusBadge(selected) : null;
  const chatReady = selected?.status === "compiled" || selected?.status === "published";

  return (
    <div className="space-y-4">
      {/* ---------- Top bar ---------- */}
      <div className="mat-card px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Workflow className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base text-content-main leading-tight">
                {selected?.name || "Visual Graph Studio"}
              </h2>
              {badge && <span className={`mat-badge ${badge.cls}`}>{badge.label}</span>}
              {selected && selected.version ? (
                <span className="text-[11px] text-content-muted">v{selected.version}</span>
              ) : null}
            </div>
            <p className="text-xs text-content-muted">
              {selected
                ? `${selected.node_count} nodes · ${selected.edge_count} channels · ${selected.session_count ?? 0} conversations`
                : "Design a team, compile it, then chat with it"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selected && (
            <>
              <button
                onClick={() => handleRename(selected)}
                disabled={busy !== null}
                title="Rename canvas"
                className="mat-btn mat-btn-outline text-xs px-3 py-2 flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Rename</span>
              </button>
              <button
                onClick={() => handleDuplicate(selected)}
                disabled={busy !== null}
                title="Duplicate this canvas"
                className="mat-btn mat-btn-outline text-xs px-3 py-2 flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{busy === "duplicate" ? "Cloning..." : "Duplicate"}</span>
              </button>
              <button
                onClick={() => handleTogglePublish(selected)}
                disabled={busy !== null || !chatReady}
                title={
                  chatReady
                    ? selected.status === "published"
                      ? "Unpublish to keep editing"
                      : "Publish this team"
                    : "Compile the canvas first"
                }
                className="mat-btn mat-btn-outline text-xs px-3 py-2 flex items-center gap-1.5"
              >
                {selected.status === "published" ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                <span>{selected.status === "published" ? "Unpublish" : "Publish"}</span>
              </button>
              <button
                onClick={() => handleDelete(selected, false)}
                disabled={busy !== null}
                title="Delete canvas"
                className="mat-btn mat-btn-outline text-xs px-3 py-2 flex items-center gap-1.5 text-rose-500 hover:bg-rose-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <Link
                href={`/chat?graph=${selected.id}`}
                aria-disabled={!chatReady}
                onClick={(e) => {
                  if (!chatReady) e.preventDefault();
                }}
                title={chatReady ? "Chat with this team" : "Compile the canvas before chatting"}
                className={`mat-btn text-xs font-semibold px-4 py-2 flex items-center gap-1.5 ${
                  chatReady
                    ? "mat-btn-primary"
                    : "mat-btn-outline opacity-50 cursor-not-allowed pointer-events-none"
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Chat With This Team</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mat-card px-4 py-3 flex items-start gap-2 border border-rose-500/30 bg-rose-500/5">
          <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-600 dark:text-rose-400 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-content-muted hover:text-content-main">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* ---------- Canvas library ---------- */}
        <aside className="mat-card p-3 space-y-3 h-fit lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
          <button
            onClick={handleCreate}
            disabled={busy !== null}
            className="mat-btn mat-btn-primary w-full text-xs font-semibold py-2 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{busy === "create" ? "Creating..." : "New Canvas"}</span>
          </button>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search canvases"
              className="mat-input text-xs w-full pl-8 pr-3 py-2"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="mat-input text-[11px] w-full py-1.5 px-2"
          >
            <option value="updated_at">Recently updated</option>
            <option value="created_at">Recently created</option>
            <option value="name">Name (A–Z)</option>
            <option value="sessions">Most used</option>
          </select>

          <div className="flex items-center justify-between text-[11px] text-content-muted px-1">
            <span>
              {graphs.length} of {total} canvas{total === 1 ? "" : "es"}
            </span>
            {loadingLibrary && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>

          <div className="space-y-1.5">
            {graphs.map((graph) => {
              const b = statusBadge(graph);
              const active = graph.id === selectedId;
              return (
                <button
                  key={graph.id}
                  onClick={() => selectCanvas(graph.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                    active
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent hover:bg-surface-hover"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-content-main line-clamp-2">
                      {graph.name}
                    </span>
                    <span className={`mat-badge shrink-0 ${b.cls}`}>{b.label}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-content-muted">
                    {graph.node_count} nodes · {graph.edge_count} channels
                    {graph.session_count ? ` · ${graph.session_count} chats` : ""}
                  </div>
                </button>
              );
            })}

            {!loadingLibrary && graphs.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <Workflow className="w-7 h-7 text-content-muted mx-auto" />
                <p className="text-[11px] text-content-muted">
                  {search ? "No canvases match that search." : "No canvases yet."}
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* ---------- Editor ---------- */}
        <section>
          {loadingDetail && !detail ? (
            <div className="h-[600px] mat-card flex items-center justify-center">
              <div className="text-center space-y-2">
                <Workflow className="w-8 h-8 text-primary mx-auto animate-pulse" />
                <p className="text-xs text-content-muted">Loading canvas…</p>
              </div>
            </div>
          ) : detail?.dsl ? (
            <GraphCanvas
              key={detail.id}
              initialDSL={detail.dsl}
              graphId={detail.id}
              onCreated={(id) => {
                loadLibrary({ keepSelection: true });
                selectCanvas(id);
              }}
              onSaved={() => loadLibrary({ keepSelection: true })}
            />
          ) : (
            <div className="h-[600px] mat-card flex items-center justify-center">
              <div className="text-center space-y-3">
                <Workflow className="w-8 h-8 text-content-muted mx-auto" />
                <p className="text-xs text-content-muted">
                  {graphs.length === 0
                    ? "Create your first canvas to start designing a team."
                    : "Select a canvas from the library."}
                </p>
                {graphs.length === 0 && (
                  <button
                    onClick={handleCreate}
                    className="mat-btn mat-btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Canvas</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ---------- Force-delete confirmation ---------- */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="mat-card max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-content-main">Delete conversation history?</h3>
                <p className="text-xs text-content-muted mt-1">
                  <strong>{confirmDelete.name}</strong> still has{" "}
                  {confirmDelete.session_count ?? "existing"} conversation(s). Deleting the canvas
                  also deletes those sessions, their runs and their messages. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="mat-btn mat-btn-outline text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete, true)}
                disabled={busy !== null}
                className="mat-btn bg-rose-600 hover:bg-rose-700 text-white text-xs px-4 py-2 font-semibold"
              >
                {busy === "delete" ? "Deleting..." : "Delete canvas + history"}
              </button>
            </div>
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
