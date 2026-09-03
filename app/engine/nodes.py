"""LangGraph node callables for the multi-agent runtime.

Every node is an async function ``(state, config) -> state update``. Nodes reuse
the existing domain services (persona assembly, memory, skills, sandbox, LLM
gateway) so the LangGraph migration changes *orchestration*, not behaviour.

Custom runtime events are dispatched with ``adispatch_custom_event`` so the
``astream_events(v2)`` consumer can split them into:
- ``ledger_sync``        -> milestone/ledger UI updates
- ``deliberation_event`` -> thought panel (agent debate, tool calls, critiques)
- ``content_delta``      -> main chat bubble tokens
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.types import interrupt

from app.core.config import settings
from app.core.logging import get_logger
from app.engine.state import (
    Milestone,
    MultiAgentState,
    ProgressLedger,
    all_milestones_resolved,
    milestone_by_id,
    new_progress_ledger,
    next_pending_milestone,
)
from app.models import MessageRole, PersonNode
from app.schemas.dsl import GraphDSL
from app.services.llm_gateway import LLMGateway

logger = get_logger(__name__)

PLANNING_PROMPT = """You are the orchestrator of an expert team. Decompose the user's goal into an executable plan.

TEAM ROSTER (node_key: role - duty):
{roster}

USER GOAL:
{goal}

Respond with a JSON object exactly in this shape:
{{
  "facts": ["verified facts extracted from the request"],
  "hypotheses": ["working assumptions that need verification"],
  "milestones": [
    {{
      "id": "m1",
      "title": "short title",
      "description": "what must be produced",
      "assigned_node": "<node_key of the best-suited NON-orchestrator team member>",
      "verification_criteria": "how a reviewer decides this milestone is complete"
    }}
  ]
}}

Rules:
- Create between 1 and {max_milestones} milestones, ordered by dependency.
- Assign each milestone to the single most appropriate specialist node_key from the roster.
- Never assign a milestone to the orchestrator itself.
- Keep milestones concrete and verifiable."""

REPLAN_PROMPT = """You are the orchestrator of an expert team. Progress has stalled.

ORIGINAL GOAL:
{goal}

CURRENT TASK LEDGER:
{ledger}

STALL CONTEXT:
{stall_context}

Produce a REVISED plan for the remaining work. Re-examine your hypotheses: some may be wrong.
Respond with the same JSON shape as the original plan (facts, hypotheses, milestones).
Only include milestones that are still pending or failed - completed work must not be redone.
Assign only non-orchestrator node keys from: {node_keys}"""

REVIEW_PROMPT = """A teammate produced an artifact for the milestone below. Review it dialectically.

MILESTONE: {title}
DESCRIPTION: {description}
VERIFICATION CRITERIA: {criteria}

ARTIFACT (produced by {producer}):
{artifact}

Cross-examine the artifact for factual gaps, logical fallacies, unmet criteria and ungrounded claims.
Respond with a JSON object:
{{"verdict": "approved" | "revision_requested", "critique": "specific, actionable critique (empty if approved)", "confidence": 0.0-1.0}}"""

SYNTHESIS_PROMPT = """You are the orchestrator. The team has completed its work on the user's goal.

USER GOAL:
{goal}

VERIFIED MILESTONE ARTIFACTS:
{artifacts}

ESTABLISHED FACTS:
{facts}

Synthesize a single polished, comprehensive final answer for the user.
Address the user directly. Integrate the verified findings; do not mention internal team mechanics
(milestones, ledgers, node names) unless the user explicitly asked about the process."""


@dataclass
class RunContext:
    """Immutable per-run context injected into node closures by the factory."""

    dsl: GraphDSL
    graph_id: uuid.UUID
    session_id: uuid.UUID
    run_id: uuid.UUID

    @property
    def orchestrator_key(self) -> str:
        return self.dsl.orchestrator.node_key

    def specialist_keys(self) -> list[str]:
        return [n.key for n in self.dsl.nodes if n.key != self.orchestrator_key]

    def roster(self) -> str:
        lines = [
            f"- {n.key}: {n.identity.professional_role} - {n.identity.primary_duty}"
            for n in self.dsl.nodes
            if n.key != self.orchestrator_key
        ]
        return "\n".join(lines) or "- (no specialists defined)"


# ------------------------------------------------------------------ helpers --


async def _emit(event: str, data: dict[str, Any]) -> None:
    """Dispatch a custom runtime event (surfaces via astream_events v2)."""
    try:
        await adispatch_custom_event(event, data)
    except Exception:  # pragma: no cover - never break execution on telemetry
        logger.debug("custom_event_dispatch_failed", extra={"event": event})


async def _load_node(db, graph_id: uuid.UUID, node_key: str) -> PersonNode | None:
    from sqlalchemy import select

    row = await db.execute(
        select(PersonNode).where(PersonNode.graph_id == graph_id, PersonNode.node_key == node_key)
    )
    return row.scalar_one_or_none()


def _parse_json_block(text: str) -> dict[str, Any]:
    """Best-effort JSON extraction from a model reply."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 2:
            cleaned = parts[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start != -1 and end > start:
        try:
            payload = json.loads(cleaned[start : end + 1])
            return payload if isinstance(payload, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _normalise_plan(payload: dict[str, Any], ctx: RunContext, goal: str) -> dict[str, Any]:
    """Coerce a model plan into valid milestones (never trust raw model output)."""
    specialists = set(ctx.specialist_keys())
    raw = payload.get("milestones") or []
    if not isinstance(raw, list) or not raw:
        fallback = next(iter(specialists), None)
        raw = [
            {
                "id": "m1",
                "title": "Address the user goal",
                "description": goal[:1500],
                "assigned_node": fallback,
                "verification_criteria": "The response fully addresses the user's request.",
            }
        ]
    milestones: list[Milestone] = []
    for index, item in enumerate(raw[: ctx.dsl.orchestrator.max_milestones]):
        assigned = str(item.get("assigned_node") or "")
        if assigned not in specialists:
            assigned = next(iter(specialists), ctx.orchestrator_key)
        milestones.append(
            Milestone(
                id=str(item.get("id") or f"m{index + 1}"),
                title=str(item.get("title") or f"Milestone {index + 1}")[:200],
                description=str(item.get("description") or "")[:2000],
                assigned_node=assigned,
                verification_criteria=str(item.get("verification_criteria") or "")[:1000],
                status="pending",
                artifact=None,
                review_iterations=0,
            )
        )
    return {
        "facts": [str(f)[:500] for f in (payload.get("facts") or [])[:20]],
        "hypotheses": [str(h)[:500] for h in (payload.get("hypotheses") or [])[:20]],
        "milestones": milestones,
    }


async def _persist_message(
    session_id: uuid.UUID,
    run_id: uuid.UUID,
    *,
    role: MessageRole,
    content: str,
    event_type: str,
    sender_node_id: uuid.UUID | None = None,
    recipient_node_id: uuid.UUID | None = None,
    structured: dict[str, Any] | None = None,
    milestone_id: str | None = None,
    model_used: str | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    latency_ms: int | None = None,
    cost_usd: float = 0.0,
) -> None:
    """Append to the immutable relational ledger (own short-lived session)."""
    from app.core.database import get_async_session
    from app.models import Message

    async with get_async_session() as db:
        db.add(
            Message(
                session_id=session_id,
                run_id=run_id,
                role=role,
                sender_node_id=sender_node_id,
                recipient_node_id=recipient_node_id,
                content=content[:16000],
                structured_data=structured or {},
                event_type=event_type,
                milestone_id=milestone_id,
                model_used=model_used,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                cost_usd=cost_usd,
            )
        )
        await db.commit()


# -------------------------------------------------------------- node makers --


def make_planner_node(ctx: RunContext):
    """Outer planning loop: build or revise the Task Ledger."""

    async def orchestrator_planner(state: MultiAgentState) -> dict[str, Any]:
        from app.core.database import get_async_session

        goal = state.get("goal") or ""
        ledger = dict(state.get("task_ledger") or {})
        is_replan = bool(ledger.get("milestones"))

        async with get_async_session() as db:
            node = await _load_node(db, ctx.graph_id, ctx.orchestrator_key)
        if node is None:
            raise RuntimeError(f"Orchestrator node '{ctx.orchestrator_key}' missing")

        if is_replan:
            failed = [m for m in ledger.get("milestones", []) if m.get("status") in ("failed", "rejected")]
            stall_context = (
                f"Failed milestones: {[m.get('title') for m in failed]}. "
                f"Last artifact: {(failed[0].get('artifact') if failed else '') or ''}"[:1500]
            )
            prompt = REPLAN_PROMPT.format(
                goal=goal,
                ledger=json.dumps(ledger, ensure_ascii=False, default=str)[:6000],
                stall_context=stall_context,
                node_keys=", ".join(ctx.specialist_keys()),
            )
            await _emit("deliberation_event", {"kind": "replan", "replan_count": ledger.get("replan_count", 0) + 1})
        else:
            prompt = PLANNING_PROMPT.format(
                roster=ctx.roster(), goal=goal, max_milestones=ctx.dsl.orchestrator.max_milestones
            )

        response = await LLMGateway.complete(
            [{"role": "user", "content": prompt}],
            provider=node.llm_provider,
            model=node.llm_model,
            temperature=0.2,
            default_model=settings.DEFAULT_ORCHESTRATOR_MODEL,
            max_tokens=node.max_tokens or 4000,
            response_format={"type": "json_object"},
        )
        plan = _normalise_plan(_parse_json_block(response.content), ctx, goal)

        if is_replan:
            kept = [m for m in ledger.get("milestones", []) if m.get("status") == "verified"]
            milestones = kept + plan["milestones"]
            replan_count = int(ledger.get("replan_count", 0)) + 1
        else:
            milestones = plan["milestones"]
            replan_count = 0

        new_ledger = {
            "goal": goal,
            "facts": plan["facts"] or ledger.get("facts", []),
            "hypotheses": plan["hypotheses"],
            "milestones": milestones,
            "stall_count": int(ledger.get("stall_count", 0)),
            "replan_count": replan_count,
        }

        await _emit(
            "ledger_sync",
            {
                "task_ledger": new_ledger,
                "phase": "replanned" if is_replan else "planned",
                "milestones": [
                    {k: m.get(k) for k in ("id", "title", "assigned_node", "status")} for m in milestones
                ],
            },
        )
        await _persist_message(
            ctx.session_id,
            ctx.run_id,
            role=MessageRole.ORCHESTRATOR,
            content=f"{'Replanned' if is_replan else 'Plan created'} with {len(milestones)} milestone(s).",
            event_type="replan" if is_replan else "plan_created",
            sender_node_id=node.id,
            structured={"milestones": [{k: m.get(k) for k in ("id", "title", "assigned_node")} for m in milestones]},
            model_used=response.model,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            latency_ms=response.latency_ms,
            cost_usd=response.cost_usd,
        )

        return {
            "task_ledger": new_ledger,
            "progress_ledger": new_progress_ledger(),
            "deliberation_trace": [
                {"type": "plan", "milestones": len(milestones), "replan": is_replan}
            ],
            "usage": [
                {
                    "input_tokens": response.input_tokens,
                    "output_tokens": response.output_tokens,
                    "cost_usd": response.cost_usd,
                }
            ],
        }

    return orchestrator_planner


def make_dispatch_node(ctx: RunContext):
    """Inner loop: select the next milestone and build its directive."""

    async def dispatch_subtask(state: MultiAgentState) -> dict[str, Any]:
        ledger = state.get("task_ledger") or {}
        progress = dict(state.get("progress_ledger") or new_progress_ledger())
        milestone = next_pending_milestone(ledger)  # type: ignore[arg-type]
        if milestone is None:
            return {"progress_ledger": {**progress, "current_milestone_id": None}}

        same_milestone = progress.get("current_milestone_id") == milestone["id"]
        attempt = int(progress.get("attempt", 0)) + 1 if same_milestone else 1

        directive = (
            f"MILESTONE '{milestone['title']}': {milestone.get('description', '')}\n"
            f"Verification criteria your output must satisfy: {milestone.get('verification_criteria', '')}"
        )
        if same_milestone and progress.get("review_critique"):
            directive += (
                f"\n\nPEER REVIEW FEEDBACK on your previous attempt (revise accordingly):\n"
                f"{progress['review_critique']}\n\nYOUR PREVIOUS ATTEMPT:\n{(progress.get('artifact') or '')[:4000]}"
            )

        milestones = [
            {**m, "status": "in_progress"} if m["id"] == milestone["id"] else m
            for m in ledger.get("milestones", [])
        ]
        new_ledger = {**ledger, "milestones": milestones}

        await _emit(
            "ledger_sync",
            {
                "task_ledger": new_ledger,
                "phase": "dispatch",
                "milestone_id": milestone["id"],
                "assigned_node": milestone["assigned_node"],
            },
        )
        await _emit(
            "deliberation_event",
            {
                "kind": "subtask_dispatch",
                "milestone_id": milestone["id"],
                "title": milestone["title"],
                "assigned_node": milestone["assigned_node"],
                "attempt": attempt,
            },
        )

        return {
            "task_ledger": new_ledger,
            "progress_ledger": {
                **progress,
                "current_milestone_id": milestone["id"],
                "assigned_node": milestone["assigned_node"],
                "directive": directive,
                "review_status": "awaiting_execution",
                "attempt": attempt,
            },
            "step_count": int(state.get("step_count", 0)) + 1,
        }

    return dispatch_subtask


def make_person_node(ctx: RunContext, node_key: str):
    """Dynamic specialist node: persona assembly + brain + Voyager tools + HITL."""

    async def person_node(state: MultiAgentState) -> dict[str, Any]:
        from app.core.database import get_async_session
        from app.services.agent_runtime import AgentRuntime

        progress = dict(state.get("progress_ledger") or {})
        ledger = state.get("task_ledger") or {}
        milestone = milestone_by_id(ledger, progress.get("current_milestone_id"))  # type: ignore[arg-type]
        directive = progress.get("directive") or (milestone or {}).get("description", "")

        async with get_async_session() as db:
            node = await _load_node(db, ctx.graph_id, node_key)
            if node is None:
                raise RuntimeError(f"Person node '{node_key}' not found")

            await _emit(
                "deliberation_event",
                {
                    "kind": "agent_thinking",
                    "node_key": node.node_key,
                    "node_name": node.display_name,
                    "role": node.professional_role,
                    "directive": (directive or "")[:400],
                },
            )

            # Human-in-the-loop gate. LangGraph's ``interrupt()`` suspends the
            # graph mid-node and checkpoints state to PostgreSQL; the run resumes
            # via Command(resume=...) once the operator decides. The runtime calls
            # this only for unverified skills when HITL policy is enabled.
            async def approval_gate(request: dict[str, Any]) -> bool:
                decision = interrupt(request)
                if isinstance(decision, dict):
                    return bool(decision.get("approved", False))
                return bool(decision)

            result = await AgentRuntime.invoke(
                db,
                node,
                directive=directive or "",
                session_id=ctx.session_id,
                run_id=ctx.run_id,
                ledger_status={
                    "goal": state.get("goal"),
                    "current_milestone": milestone,
                    "facts": ledger.get("facts", []),
                },
                event_visibility="agent_debate",
                approval_gate=approval_gate,
            )
            await db.commit()

        await _emit(
            "deliberation_event",
            {
                "kind": "agent_debate",
                "node_key": node_key,
                "content": result.content[:2500],
                "skill_calls": len(result.skill_calls),
                "tokens": result.input_tokens + result.output_tokens,
            },
        )

        return {
            "progress_ledger": {**progress, "artifact": result.content, "review_status": "in_review"},
            "messages": [AIMessage(content=result.content, name=node_key)],
            "deliberation_trace": [
                {"type": "artifact", "node_key": node_key, "skill_calls": len(result.skill_calls)}
            ],
            "usage": [
                {
                    "input_tokens": result.input_tokens,
                    "output_tokens": result.output_tokens,
                    "cost_usd": result.cost_usd,
                }
            ],
        }

    return person_node


def make_review_node(ctx: RunContext):
    """Dialectical review: peer critic cross-examines the artifact."""

    async def dialectical_review(state: MultiAgentState) -> dict[str, Any]:
        from app.core.database import get_async_session
        from app.services.agent_runtime import AgentRuntime

        progress = dict(state.get("progress_ledger") or {})
        ledger = state.get("task_ledger") or {}
        milestone = milestone_by_id(ledger, progress.get("current_milestone_id"))  # type: ignore[arg-type]
        producer_key = progress.get("assigned_node")
        artifact = progress.get("artifact") or ""

        reviewers = [k for k in ctx.dsl.reviewers_for(producer_key or "") if k != producer_key]
        if not reviewers or milestone is None:
            return {
                "progress_ledger": {
                    **progress,
                    "review_status": "accepted",
                    "reviewer_node": None,
                    "review_critique": None,
                }
            }

        reviewer_key = reviewers[(int(progress.get("attempt", 1)) - 1) % len(reviewers)]

        async with get_async_session() as db:
            reviewer = await _load_node(db, ctx.graph_id, reviewer_key)
            producer = await _load_node(db, ctx.graph_id, producer_key or "")
            if reviewer is None:
                return {"progress_ledger": {**progress, "review_status": "accepted"}}

            prompt = REVIEW_PROMPT.format(
                title=milestone.get("title", ""),
                description=milestone.get("description", ""),
                criteria=milestone.get("verification_criteria", ""),
                producer=producer.display_name if producer else (producer_key or "teammate"),
                artifact=artifact[:8000],
            )
            result = await AgentRuntime.invoke(
                db,
                reviewer,
                directive=prompt,
                session_id=ctx.session_id,
                run_id=ctx.run_id,
                ledger_status={
                    "goal": state.get("goal"),
                    "current_milestone": milestone,
                    "facts": ledger.get("facts", []),
                },
                sender_node_id=producer.id if producer else None,
                event_visibility="review_verdict",
                record_role=MessageRole.CRITIC,
            )
            await db.commit()

        payload = _parse_json_block(result.content)
        verdict = str(payload.get("verdict") or "").lower()
        if verdict not in ("approved", "revision_requested", "rejected"):
            verdict = "approved"  # unstructured/mock reviewers must not block progress
        if verdict == "rejected":
            verdict = "revision_requested"
        critique = str(payload.get("critique") or "") or None

        await _emit(
            "deliberation_event",
            {
                "kind": "review_verdict",
                "reviewer": reviewer_key,
                "producer": producer_key,
                "verdict": verdict,
                "critique": (critique or "")[:800],
                "milestone_id": progress.get("current_milestone_id"),
                "iteration": progress.get("attempt", 1),
            },
        )

        return {
            "progress_ledger": {
                **progress,
                "review_status": "accepted" if verdict == "approved" else "rejected",
                "review_critique": critique,
                "reviewer_node": reviewer_key,
            },
            "deliberation_trace": [
                {"type": "review", "reviewer": reviewer_key, "verdict": verdict}
            ],
            "usage": [
                {
                    "input_tokens": result.input_tokens,
                    "output_tokens": result.output_tokens,
                    "cost_usd": result.cost_usd,
                }
            ],
        }

    return dialectical_review


def make_advance_node(ctx: RunContext):
    """Mark the current milestone verified (or failed) and update both ledgers."""

    async def advance_milestone(state: MultiAgentState) -> dict[str, Any]:
        progress = dict(state.get("progress_ledger") or {})
        ledger = dict(state.get("task_ledger") or {})
        milestone_id = progress.get("current_milestone_id")
        accepted = progress.get("review_status") == "accepted"
        max_reviews = ctx.dsl.orchestrator.max_review_iterations
        attempt = int(progress.get("attempt", 1))

        milestones = []
        for m in ledger.get("milestones", []):
            if m.get("id") != milestone_id:
                milestones.append(m)
                continue
            if accepted:
                milestones.append(
                    {
                        **m,
                        "status": "verified",
                        "artifact": progress.get("artifact"),
                        "review_iterations": attempt,
                    }
                )
            else:
                exhausted = attempt > max_reviews
                milestones.append(
                    {
                        **m,
                        "status": "verified" if exhausted else "rejected",
                        "artifact": progress.get("artifact"),
                        "review_iterations": attempt,
                        "review_note": "accepted with reservations (retry limit reached)" if exhausted else "",
                    }
                )
        ledger["milestones"] = milestones

        completed = list(progress.get("completed", []))
        failed = list(progress.get("failed", []))
        if accepted and milestone_id and milestone_id not in completed:
            completed.append(milestone_id)
        elif not accepted and milestone_id and attempt > max_reviews and milestone_id not in completed:
            completed.append(milestone_id)

        await _emit(
            "ledger_sync",
            {"task_ledger": ledger, "phase": "milestone_complete", "milestone_id": milestone_id},
        )
        await _emit(
            "deliberation_event",
            {"kind": "milestone_complete", "milestone_id": milestone_id, "accepted": accepted},
        )

        return {
            "task_ledger": ledger,
            "progress_ledger": {
                **progress,
                "completed": completed,
                "failed": failed,
                "review_critique": None,
                "artifact": None,
                "review_status": "awaiting_execution",
                "attempt": 0,
            },
        }

    return advance_milestone


def make_stall_node(ctx: RunContext):
    """Record a stall before routing back to the planner for replanning."""

    async def stall_recovery(state: MultiAgentState) -> dict[str, Any]:
        ledger = dict(state.get("task_ledger") or {})
        progress = dict(state.get("progress_ledger") or {})
        milestone_id = progress.get("current_milestone_id")
        stall_count = int(ledger.get("stall_count", 0)) + 1
        ledger["stall_count"] = stall_count
        ledger["milestones"] = [
            {**m, "status": "failed"} if m.get("id") == milestone_id else m
            for m in ledger.get("milestones", [])
        ]
        failed = list(progress.get("failed", []))
        if milestone_id and milestone_id not in failed:
            failed.append(milestone_id)

        await _emit(
            "deliberation_event",
            {"kind": "stall_detected", "milestone_id": milestone_id, "stall_count": stall_count},
        )
        await _emit("ledger_sync", {"task_ledger": ledger, "phase": "stalled"})

        return {
            "task_ledger": ledger,
            "progress_ledger": {**progress, "failed": failed, "attempt": 0, "review_critique": None},
            "deliberation_trace": [{"type": "stall", "milestone_id": milestone_id, "count": stall_count}],
        }

    return stall_recovery


def make_synthesizer_node(ctx: RunContext):
    """Stream the final synthesis to the consumer chat bubble."""

    async def orchestrator_synthesizer(state: MultiAgentState) -> dict[str, Any]:
        from app.core.database import get_async_session

        ledger = state.get("task_ledger") or {}
        artifacts = [
            f"### {m.get('title')} [{m.get('status')}]\n{(m.get('artifact') or '')[:6000]}"
            for m in ledger.get("milestones", [])
            if m.get("artifact")
        ]
        prompt = SYNTHESIS_PROMPT.format(
            goal=state.get("goal", ""),
            artifacts="\n\n".join(artifacts) or "(no artifacts produced)",
            facts="\n".join(f"- {f}" for f in ledger.get("facts", [])) or "(none)",
        )

        async with get_async_session() as db:
            node = await _load_node(db, ctx.graph_id, ctx.orchestrator_key)
        if node is None:
            raise RuntimeError("Orchestrator node missing at synthesis")

        chunks: list[str] = []
        async for delta in LLMGateway.stream(
            [
                {"role": "system", "content": f"You are {node.display_name}, {node.professional_role}."},
                {"role": "user", "content": prompt},
            ],
            provider=node.llm_provider,
            model=node.llm_model,
            temperature=node.temperature,
            top_p=node.top_p,
            max_tokens=node.max_tokens,
            default_model=settings.DEFAULT_ORCHESTRATOR_MODEL,
        ):
            chunks.append(delta)
            await _emit("content_delta", {"delta": delta})

        final = "".join(chunks)
        await _persist_message(
            ctx.session_id,
            ctx.run_id,
            role=MessageRole.ASSISTANT,
            content=final,
            event_type="run_completed",
            structured={"milestones": len(ledger.get("milestones", []))},
        )
        return {
            "final_response": final,
            "messages": [AIMessage(content=final, name=ctx.orchestrator_key)],
        }

    return orchestrator_synthesizer
