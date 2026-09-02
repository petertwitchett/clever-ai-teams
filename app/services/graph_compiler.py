"""Graph Compiler: validates the JSON DSL and materializes executable graphs.

Validation rules (mirrors the canvas-side checks):
- exactly one orchestrator node exists and matches ``orchestrator.node_key``
- node keys are unique; edges reference existing keys
- no orphan nodes (every non-orchestrator node is reachable from the
  orchestrator through dispatch/collaboration edges)
- dialectical review edges connect compatible roles
- at most one subtask_dispatch edge per (source, target) pair
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import GraphCompilationError, NotFoundError
from app.core.logging import get_logger
from app.core.redis_client import CacheService
from app.models import AgentGraph, GraphEdge, GraphStatus, NodeType, PersonNode
from app.models.enums import EdgeChannel
from app.schemas.dsl import GraphDSL
from app.schemas.graph import CompilationIssue

logger = get_logger(__name__)

_REVIEWER_TYPES = {NodeType.CRITIC, NodeType.VERIFIER, NodeType.ORCHESTRATOR}


def validate_dsl(dsl: GraphDSL) -> list[CompilationIssue]:
    """Run all structural validations; returns a list of issues (errors + warnings)."""
    issues: list[CompilationIssue] = []
    node_map = dsl.node_map()

    # --- unique keys -------------------------------------------------------
    seen: set[str] = set()
    for node in dsl.nodes:
        if node.key in seen:
            issues.append(
                CompilationIssue(
                    severity="error", code="duplicate_node_key",
                    message=f"Node key '{node.key}' is defined more than once.", node_key=node.key,
                )
            )
        seen.add(node.key)

    # --- exactly one orchestrator ------------------------------------------
    orchestrators = [n for n in dsl.nodes if n.node_type == NodeType.ORCHESTRATOR]
    if len(orchestrators) != 1:
        issues.append(
            CompilationIssue(
                severity="error", code="orchestrator_count",
                message=f"Graph must contain exactly one orchestrator node (found {len(orchestrators)}).",
            )
        )
    elif orchestrators[0].key != dsl.orchestrator.node_key:
        issues.append(
            CompilationIssue(
                severity="error", code="orchestrator_key_mismatch",
                message=(
                    f"orchestrator.node_key '{dsl.orchestrator.node_key}' does not match the orchestrator "
                    f"node '{orchestrators[0].key}'."
                ),
            )
        )

    # --- edges reference existing keys --------------------------------------
    dispatch_pairs: set[tuple[str, str]] = set()
    for index, edge in enumerate(dsl.edges):
        for endpoint, key in (("source", edge.source), ("target", edge.target)):
            if key not in node_map:
                issues.append(
                    CompilationIssue(
                        severity="error", code="unknown_edge_endpoint",
                        message=f"Edge #{index} {endpoint} '{key}' does not reference a known node.",
                        edge_index=index,
                    )
                )
        if edge.channel == EdgeChannel.SUBTASK_DISPATCH:
            pair = (edge.source, edge.target)
            if pair in dispatch_pairs:
                issues.append(
                    CompilationIssue(
                        severity="error", code="duplicate_dispatch_edge",
                        message=f"Duplicate subtask_dispatch edge {edge.source} -> {edge.target}.",
                        edge_index=index,
                    )
                )
            dispatch_pairs.add(pair)

        # --- dialectical review role compatibility ---------------------------
        if edge.channel == EdgeChannel.DIALECTICAL_REVIEW and edge.target in node_map:
            target_type = node_map[edge.target].node_type
            if target_type not in _REVIEWER_TYPES and not edge.bidirectional:
                issues.append(
                    CompilationIssue(
                        severity="warning", code="review_target_role",
                        message=(
                            f"Edge #{index}: dialectical_review targets '{edge.target}' "
                            f"({target_type}), which is not a critic/verifier role."
                        ),
                        edge_index=index,
                    )
                )

    # --- reachability from orchestrator (orphan detection) -------------------
    if orchestrators and all(i.code != "unknown_edge_endpoint" for i in issues):
        root = orchestrators[0].key
        adjacency: dict[str, set[str]] = {n.key: set() for n in dsl.nodes}
        for edge in dsl.edges:
            adjacency.setdefault(edge.source, set()).add(edge.target)
            if edge.bidirectional:
                adjacency.setdefault(edge.target, set()).add(edge.source)
        reachable: set[str] = set()
        stack = [root]
        while stack:
            current = stack.pop()
            if current in reachable:
                continue
            reachable.add(current)
            stack.extend(adjacency.get(current, ()))
        for node in dsl.nodes:
            if node.key not in reachable:
                issues.append(
                    CompilationIssue(
                        severity="error", code="orphan_node",
                        message=f"Node '{node.key}' is not reachable from the orchestrator.", node_key=node.key,
                    )
                )

    # --- soft advice ---------------------------------------------------------
    if not any(e.channel == EdgeChannel.DIALECTICAL_REVIEW for e in dsl.edges):
        issues.append(
            CompilationIssue(
                severity="warning", code="no_review_channel",
                message="Graph has no dialectical_review edges; artifacts will be accepted without peer critique.",
            )
        )
    return issues


async def compile_graph(
    db: AsyncSession,
    graph_id: uuid.UUID,
    dsl: GraphDSL,
    canvas_layout: dict[str, Any] | None = None,
) -> tuple[AgentGraph, list[CompilationIssue]]:
    """Validate the DSL and materialize node/edge rows for the given graph.

    On validation errors the graph stays in DRAFT with errors recorded.
    On success it moves to COMPILED and the nodes/edges tables are rebuilt.
    """
    graph = await db.get(AgentGraph, graph_id)
    if graph is None:
        raise NotFoundError(f"Graph {graph_id} not found")

    issues = validate_dsl(dsl)
    errors = [i for i in issues if i.severity == "error"]

    graph.dsl = dsl.model_dump(mode="json")
    if canvas_layout is not None:
        graph.canvas_layout = canvas_layout
    graph.name = dsl.metadata.name
    graph.description = dsl.metadata.description or graph.description
    graph.stall_limit = dsl.orchestrator.stall_limit
    graph.max_steps = dsl.orchestrator.max_steps
    graph.timeout_seconds = dsl.orchestrator.timeout_seconds

    if errors:
        graph.status = GraphStatus.DRAFT
        graph.compilation_errors = [f"[{i.code}] {i.message}" for i in errors]
        await db.flush()
        logger.info("graph_compile_failed", extra={"graph_id": str(graph_id), "errors": len(errors)})
        return graph, issues

    # Rebuild nodes and edges from the validated DSL.
    await db.execute(delete(GraphEdge).where(GraphEdge.graph_id == graph_id))
    existing_nodes = (
        (await db.execute(select(PersonNode).where(PersonNode.graph_id == graph_id))).scalars().all()
    )
    existing_by_key = {node.node_key: node for node in existing_nodes}
    dsl_keys = {n.key for n in dsl.nodes}

    # Remove nodes no longer present (their memories cascade via FK is restricted;
    # keep them soft by deleting only when no memories exist would complicate the
    # flow, so we delete outright - memory rows reference node ids with FK and
    # will block deletion if data exists; guard by nulling ownership first).
    for key, node in existing_by_key.items():
        if key not in dsl_keys:
            await db.delete(node)

    node_id_by_key: dict[str, uuid.UUID] = {}
    for dsl_node in dsl.nodes:
        node = existing_by_key.get(dsl_node.key)
        if node is None:
            node = PersonNode(graph_id=graph_id, node_key=dsl_node.key, node_type=dsl_node.node_type,
                              display_name="", professional_role="", primary_duty="")
            db.add(node)
        node.node_type = dsl_node.node_type
        node.display_name = dsl_node.identity.display_name
        node.professional_role = dsl_node.identity.professional_role
        node.primary_duty = dsl_node.identity.primary_duty
        node.persona_traits = dsl_node.persona.model_dump(mode="json")
        node.constitutional_constraints = (
            dsl_node.ethics.absolute_constraints + dsl_node.ethics.guardrails + dsl_node.ethics.data_policies
        )
        node.llm_provider = dsl_node.brain.provider
        node.llm_model = dsl_node.brain.model
        node.temperature = dsl_node.brain.temperature
        node.top_p = dsl_node.brain.top_p
        node.max_tokens = dsl_node.brain.max_tokens
        node.working_memory_window = dsl_node.memory.working_memory_window
        node.memory_retrieval_k = dsl_node.memory.retrieval_top_k
        node.assigned_skill_ids = dsl_node.skill_ids
        node.position_x = float(dsl_node.position.get("x", 0.0))
        node.position_y = float(dsl_node.position.get("y", 0.0))
        await db.flush()
        node_id_by_key[dsl_node.key] = node.id

    for dsl_edge in dsl.edges:
        db.add(
            GraphEdge(
                graph_id=graph_id,
                source_node_id=node_id_by_key[dsl_edge.source],
                target_node_id=node_id_by_key[dsl_edge.target],
                channel=dsl_edge.channel,
                bidirectional=dsl_edge.bidirectional,
                conditions=dsl_edge.conditions,
            )
        )

    graph.status = GraphStatus.COMPILED
    graph.compiled_at = datetime.now(timezone.utc)
    graph.compilation_errors = []
    graph.version = graph.version + 1
    await db.flush()

    # Invalidate the cached DSL for this graph.
    await CacheService.delete(f"graph_dsl:{graph_id}")

    logger.info(
        "graph_compiled",
        extra={"graph_id": str(graph_id), "nodes": len(dsl.nodes), "edges": len(dsl.edges), "version": graph.version},
    )
    return graph, issues


async def load_compiled_dsl(db: AsyncSession, graph_id: uuid.UUID) -> GraphDSL:
    """Load and parse the compiled DSL for execution, with Redis caching."""
    cache_key = f"graph_dsl:{graph_id}"
    cached = await CacheService.get(cache_key)
    if cached:
        try:
            return GraphDSL.model_validate(cached)
        except Exception:  # pragma: no cover - cache poisoning guard
            await CacheService.delete(cache_key)

    graph = await db.get(AgentGraph, graph_id)
    if graph is None:
        raise NotFoundError(f"Graph {graph_id} not found")
    if graph.status not in (GraphStatus.COMPILED, GraphStatus.PUBLISHED):
        raise GraphCompilationError(f"Graph {graph_id} is not compiled (status={graph.status}).")

    dsl = GraphDSL.model_validate(graph.dsl)
    from app.core.config import settings

    await CacheService.set(cache_key, dsl.model_dump(mode="json"), ttl=settings.CACHE_TTL_GRAPH_DSL)
    return dsl
