"""Dynamic graph factory: Canvas JSON DSL -> CompiledStateGraph.

Turns the administrator's canvas topology into an executable LangGraph state
machine. One node is generated per person on the canvas, wired through
conditional routers that implement the Magentic-One dual-ledger control flow.

Topology
--------
    START -> orchestrator_planner
             |-- route_plan --> dispatch_subtask | orchestrator_synthesizer
    dispatch_subtask
             |-- route_dispatch --> person__<key> (one per specialist)
    person__<key> -> dialectical_review
    dialectical_review
             |-- route_review --> advance_milestone | dispatch_subtask | stall_recovery
    advance_milestone
             |-- route_plan --> dispatch_subtask | orchestrator_synthesizer
    stall_recovery -> orchestrator_planner            (outer-loop replanning)
    orchestrator_synthesizer -> END

Compiled graphs are cached per (graph_id, version) because construction walks
the DSL and builds one closure per node.
"""

from __future__ import annotations

import uuid
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.core.config import settings
from app.core.logging import get_logger
from app.engine.nodes import (
    RunContext,
    make_advance_node,
    make_dispatch_node,
    make_person_node,
    make_planner_node,
    make_review_node,
    make_stall_node,
    make_synthesizer_node,
)
from app.engine.routers import make_route_dispatch, make_route_plan, make_route_review
from app.engine.state import MultiAgentState
from app.schemas.dsl import GraphDSL

logger = get_logger(__name__)

PERSON_PREFIX = "person__"

_graph_cache: dict[str, Any] = {}


def build_state_graph(ctx: RunContext) -> StateGraph:
    """Construct (but do not compile) the StateGraph for a DSL document."""
    builder: StateGraph = StateGraph(MultiAgentState)

    builder.add_node("orchestrator_planner", make_planner_node(ctx))
    builder.add_node("dispatch_subtask", make_dispatch_node(ctx))
    builder.add_node("dialectical_review", make_review_node(ctx))
    builder.add_node("advance_milestone", make_advance_node(ctx))
    builder.add_node("stall_recovery", make_stall_node(ctx))
    builder.add_node("orchestrator_synthesizer", make_synthesizer_node(ctx))

    specialist_keys = ctx.specialist_keys()
    for key in specialist_keys:
        builder.add_node(f"{PERSON_PREFIX}{key}", make_person_node(ctx, key))

    # START -> planner
    builder.add_edge(START, "orchestrator_planner")

    # planner -> dispatch | synthesize
    builder.add_conditional_edges(
        "orchestrator_planner",
        make_route_plan(ctx),
        {"dispatch": "dispatch_subtask", "synthesize": "orchestrator_synthesizer"},
    )

    # dispatch -> the assigned person node
    dispatch_map: dict[str, str] = {
        f"{PERSON_PREFIX}{key}": f"{PERSON_PREFIX}{key}" for key in specialist_keys
    }
    dispatch_map["synthesize"] = "orchestrator_synthesizer"
    builder.add_conditional_edges("dispatch_subtask", make_route_dispatch(ctx), dispatch_map)

    # every person node -> dialectical review
    for key in specialist_keys:
        builder.add_edge(f"{PERSON_PREFIX}{key}", "dialectical_review")

    # review -> advance | retry(dispatch) | stall
    builder.add_conditional_edges(
        "dialectical_review",
        make_route_review(ctx),
        {
            "advance": "advance_milestone",
            "retry": "dispatch_subtask",
            "stall": "stall_recovery",
        },
    )

    # advance -> next milestone | synthesis
    builder.add_conditional_edges(
        "advance_milestone",
        make_route_plan(ctx),
        {"dispatch": "dispatch_subtask", "synthesize": "orchestrator_synthesizer"},
    )

    # stall -> outer-loop replanning
    builder.add_edge("stall_recovery", "orchestrator_planner")

    # synthesis -> END
    builder.add_edge("orchestrator_synthesizer", END)

    return builder


def compile_graph_for_run(
    dsl: GraphDSL,
    *,
    graph_id: uuid.UUID,
    session_id: uuid.UUID,
    run_id: uuid.UUID,
    checkpointer: Any | None = None,
) -> tuple[Any, RunContext]:
    """Compile an executable graph bound to this run's context."""
    ctx = RunContext(dsl=dsl, graph_id=graph_id, session_id=session_id, run_id=run_id)
    builder = build_state_graph(ctx)
    compiled = builder.compile(checkpointer=checkpointer)
    logger.info(
        "langgraph_compiled",
        extra={
            "graph_id": str(graph_id),
            "run_id": str(run_id),
            "specialists": len(ctx.specialist_keys()),
            "checkpointer": bool(checkpointer),
        },
    )
    return compiled, ctx


def graph_topology(dsl: GraphDSL) -> dict[str, Any]:
    """Static description of the compiled topology (for API introspection)."""
    ctx = RunContext(
        dsl=dsl, graph_id=uuid.UUID(int=0), session_id=uuid.UUID(int=0), run_id=uuid.UUID(int=0)
    )
    specialists = ctx.specialist_keys()
    return {
        "engine": "langgraph",
        "nodes": [
            "orchestrator_planner",
            "dispatch_subtask",
            *[f"{PERSON_PREFIX}{k}" for k in specialists],
            "dialectical_review",
            "advance_milestone",
            "stall_recovery",
            "orchestrator_synthesizer",
        ],
        "conditional_edges": {
            "orchestrator_planner": ["dispatch_subtask", "orchestrator_synthesizer"],
            "dispatch_subtask": [f"{PERSON_PREFIX}{k}" for k in specialists],
            "dialectical_review": ["advance_milestone", "dispatch_subtask", "stall_recovery"],
            "advance_milestone": ["dispatch_subtask", "orchestrator_synthesizer"],
        },
        "checkpointing": settings.LANGGRAPH_CHECKPOINTS_ENABLED,
        "recursion_limit": settings.LANGGRAPH_RECURSION_LIMIT,
    }
