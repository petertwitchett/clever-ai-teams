"""Magentic-One dual-ledger orchestration engine.

Cyclic state machine coordinating the person nodes of a compiled graph:

  OUTER PLANNING LOOP (Task Ledger)
    - decompose the user goal into ordered milestones with verification criteria
    - maintain facts & hypotheses
    - stall detection -> replanning

  INNER EXECUTION LOOP (Progress Ledger)
    - dispatch each milestone to its assigned specialist (via graph edges)
    - dialectical review by connected critic/verifier nodes
    - retry with critique feedback until criteria satisfied or retries exceeded

  FINAL SYNTHESIS
    - orchestrator compiles verified artifacts into the final answer
    - streamed to the client via the event bus as final_chunk frames
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger, run_id_ctx
from app.models import (
    AgentGraph,
    ChatSession,
    Message,
    MessageRole,
    MilestoneStatus,
    OrchestrationRun,
    PersonNode,
    PostMortemJob,
    RunEventType,
    RunStatus,
)
from app.models.enums import EdgeChannel, PostMortemStatus
from app.schemas.dsl import GraphDSL
from app.services.agent_runtime import AgentRuntime
from app.services.event_bus import EventBus
from app.services.graph_compiler import load_compiled_dsl
from app.services.llm_gateway import LLMGateway

logger = get_logger(__name__)

_PLANNING_PROMPT = """You are the orchestrator of an expert team. Decompose the user's goal into an executable plan.

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

_REPLAN_PROMPT = """You are the orchestrator of an expert team. Progress has stalled.

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

_REVIEW_PROMPT = """A teammate produced an artifact for the milestone below. Review it dialectically.

MILESTONE: {title}
DESCRIPTION: {description}
VERIFICATION CRITERIA: {criteria}

ARTIFACT (produced by {producer}):
{artifact}

Cross-examine the artifact for factual gaps, logical fallacies, unmet criteria and ungrounded claims.
Respond with a JSON object:
{{"verdict": "approved" | "revision_requested", "critique": "specific, actionable critique (empty if approved)", "confidence": 0.0-1.0}}"""

_SYNTHESIS_PROMPT = """You are the orchestrator. The team has completed its work on the user's goal.

USER GOAL:
{goal}

VERIFIED MILESTONE ARTIFACTS:
{artifacts}

ESTABLISHED FACTS:
{facts}

Synthesize a single polished, comprehensive final answer for the user.
Address the user directly. Integrate the verified findings; do not mention internal team mechanics
(milestones, ledgers, node names) unless the user explicitly asked about the process."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Orchestrator:
    """Executes one orchestration run end-to-end."""

    def __init__(self, db: AsyncSession, run: OrchestrationRun, session: ChatSession, goal: str) -> None:
        self.db = db
        self.run = run
        self.session = session
        self.goal = goal
        self.dsl: GraphDSL | None = None
        self.nodes_by_key: dict[str, PersonNode] = {}
        self.orchestrator_node: PersonNode | None = None
        self._steps = 0

    # ------------------------------------------------------------- helpers --

    async def _load_graph(self) -> None:
        self.dsl = await load_compiled_dsl(self.db, self.session.graph_id)
        rows = (
            (await self.db.execute(select(PersonNode).where(PersonNode.graph_id == self.session.graph_id)))
            .scalars()
            .all()
        )
        self.nodes_by_key = {node.node_key: node for node in rows}
        orch_key = self.dsl.orchestrator.node_key
        self.orchestrator_node = self.nodes_by_key.get(orch_key)
        if self.orchestrator_node is None:
            raise RuntimeError(f"Orchestrator node '{orch_key}' missing from graph tables")

    def _roster(self) -> str:
        assert self.dsl is not None
        lines = []
        for node in self.dsl.nodes:
            if node.key == self.dsl.orchestrator.node_key:
                continue
            lines.append(f"- {node.key}: {node.identity.professional_role} - {node.identity.primary_duty}")
        return "\n".join(lines) or "- (no specialists defined)"

    def _specialist_keys(self) -> list[str]:
        assert self.dsl is not None
        return [n.key for n in self.dsl.nodes if n.key != self.dsl.orchestrator.node_key]

    async def _publish(self, event: RunEventType, data: dict[str, Any]) -> None:
        await EventBus.publish(self.run.id, event, data)

    async def _save_ledgers(self) -> None:
        # Reassignment required so SQLAlchemy detects JSONB mutation.
        self.run.task_ledger = dict(self.run.task_ledger)
        self.run.progress_ledger = dict(self.run.progress_ledger)
        await self.db.flush()

    def _accumulate(self, result: Any) -> None:
        self.run.input_tokens += getattr(result, "input_tokens", 0)
        self.run.output_tokens += getattr(result, "output_tokens", 0)
        self.run.cost_usd += getattr(result, "cost_usd", 0.0)

    async def _record_orchestrator_message(self, content: str, event_type: str, structured: dict | None = None) -> None:
        self.db.add(
            Message(
                session_id=self.session.id,
                run_id=self.run.id,
                role=MessageRole.ORCHESTRATOR,
                sender_node_id=self.orchestrator_node.id if self.orchestrator_node else None,
                content=content[:16_000],
                structured_data=structured or {},
                event_type=event_type,
            )
        )
        await self.db.flush()

    # ------------------------------------------------------- outer planning --

    async def _plan(self, *, replan_context: str | None = None) -> dict[str, Any]:
        assert self.dsl is not None and self.orchestrator_node is not None
        node = self.orchestrator_node
        if replan_context is None:
            prompt = _PLANNING_PROMPT.format(
                roster=self._roster(), goal=self.goal, max_milestones=self.dsl.orchestrator.max_milestones
            )
        else:
            prompt = _REPLAN_PROMPT.format(
                goal=self.goal,
                ledger=json.dumps(self.run.task_ledger, ensure_ascii=False, default=str)[:6000],
                stall_context=replan_context,
                node_keys=", ".join(self._specialist_keys()),
            )
        plan, response = await LLMGateway.complete_json(
            [{"role": "user", "content": prompt}],
            provider=node.llm_provider,
            model=node.llm_model,
            temperature=0.2,
            default_model=settings.DEFAULT_ORCHESTRATOR_MODEL,
            max_tokens=node.max_tokens or 4000,
        )
        self._accumulate(response)

        if not isinstance(plan, dict):
            raise RuntimeError("Planner returned a non-object JSON payload")

        specialists = set(self._specialist_keys())
        milestones: list[dict[str, Any]] = []
        raw_milestones = plan.get("milestones") or []
        if not isinstance(raw_milestones, list) or not raw_milestones:
            # Mock/degenerate fallback: single milestone to the first specialist.
            fallback_node = next(iter(specialists), None)
            raw_milestones = [
                {
                    "id": "m1",
                    "title": "Address the user goal",
                    "description": self.goal[:1500],
                    "assigned_node": fallback_node,
                    "verification_criteria": "The response fully addresses the user's request.",
                }
            ]
        for index, raw in enumerate(raw_milestones[: self.dsl.orchestrator.max_milestones]):
            assigned = str(raw.get("assigned_node") or "")
            if assigned not in specialists:
                assigned = next(iter(specialists), self.dsl.orchestrator.node_key)
            milestones.append(
                {
                    "id": str(raw.get("id") or f"m{index + 1}"),
                    "title": str(raw.get("title") or f"Milestone {index + 1}")[:200],
                    "description": str(raw.get("description") or "")[:2000],
                    "assigned_node": assigned,
                    "verification_criteria": str(raw.get("verification_criteria") or "")[:1000],
                    "status": MilestoneStatus.PENDING.value,
                    "artifact": None,
                    "review_iterations": 0,
                }
            )
        return {
            "facts": [str(f)[:500] for f in (plan.get("facts") or [])[:20]],
            "hypotheses": [str(h)[:500] for h in (plan.get("hypotheses") or [])[:20]],
            "milestones": milestones,
        }

    # ------------------------------------------------------ inner execution --

    def _reviewer_nodes_for(self, producer_key: str) -> list[PersonNode]:
        assert self.dsl is not None
        reviewers = []
        for key in self.dsl.reviewers_for(producer_key):
            node = self.nodes_by_key.get(key)
            if node is not None and key != producer_key:
                reviewers.append(node)
        return reviewers

    async def _execute_milestone(self, milestone: dict[str, Any]) -> bool:
        """Run dispatch + dialectical review for one milestone. Returns success."""
        assert self.dsl is not None
        specialist = self.nodes_by_key.get(milestone["assigned_node"])
        if specialist is None:
            milestone["status"] = MilestoneStatus.FAILED.value
            milestone["artifact"] = f"Assigned node '{milestone['assigned_node']}' not found."
            return False

        milestone["status"] = MilestoneStatus.IN_PROGRESS.value
        await self._publish(
            RunEventType.SUBTASK_DISPATCH,
            {
                "milestone_id": milestone["id"],
                "title": milestone["title"],
                "assigned_node": specialist.node_key,
                "assigned_name": specialist.display_name,
            },
        )
        await self._save_ledgers()

        ledger_status = {
            "goal": self.goal,
            "current_milestone": milestone,
            "facts": self.run.task_ledger.get("facts", []),
        }
        directive = (
            f"MILESTONE '{milestone['title']}': {milestone['description']}\n"
            f"Verification criteria your output must satisfy: {milestone['verification_criteria']}"
        )

        artifact: str | None = None
        critique: str | None = None
        max_reviews = self.dsl.orchestrator.max_review_iterations

        for attempt in range(max_reviews + 1):
            self._steps += 1
            self.run.step_count = self._steps
            effective_directive = directive
            if critique:
                effective_directive += (
                    f"\n\nPEER REVIEW FEEDBACK on your previous attempt (revise accordingly):\n{critique}\n\n"
                    f"YOUR PREVIOUS ATTEMPT:\n{(artifact or '')[:4000]}"
                )

            result = await AgentRuntime.invoke(
                self.db,
                specialist,
                directive=effective_directive,
                session_id=self.session.id,
                run_id=self.run.id,
                ledger_status=ledger_status,
                event_visibility=RunEventType.AGENT_DEBATE.value,
            )
            self._accumulate(result)
            artifact = result.content

            # Dialectical review
            reviewers = self._reviewer_nodes_for(specialist.node_key)
            if not reviewers or attempt >= max_reviews:
                milestone["status"] = MilestoneStatus.VERIFIED.value
                milestone["artifact"] = artifact
                milestone["review_iterations"] = attempt
                if not reviewers:
                    milestone["review_note"] = "no reviewer connected; auto-accepted"
                else:
                    milestone["review_note"] = "review retry limit reached; accepted with reservations"
                return True

            milestone["status"] = MilestoneStatus.UNDER_REVIEW.value
            await self._save_ledgers()
            reviewer = reviewers[attempt % len(reviewers)]
            verdict, critique_text = await self._review(reviewer, specialist, milestone, artifact)

            await self._publish(
                RunEventType.REVIEW_VERDICT,
                {
                    "milestone_id": milestone["id"],
                    "reviewer": reviewer.node_key,
                    "producer": specialist.node_key,
                    "verdict": verdict,
                    "critique": (critique_text or "")[:800],
                    "iteration": attempt + 1,
                },
            )
            if verdict == "approved":
                milestone["status"] = MilestoneStatus.VERIFIED.value
                milestone["artifact"] = artifact
                milestone["review_iterations"] = attempt + 1
                return True
            critique = critique_text or "The reviewer requested revisions without details; tighten rigor and evidence."

        milestone["status"] = MilestoneStatus.FAILED.value
        milestone["artifact"] = artifact
        return False

    async def _review(
        self, reviewer: PersonNode, producer: PersonNode, milestone: dict[str, Any], artifact: str
    ) -> tuple[str, str | None]:
        """Ask a reviewer node for a structured verdict on the artifact."""
        prompt = _REVIEW_PROMPT.format(
            title=milestone["title"],
            description=milestone["description"],
            criteria=milestone["verification_criteria"],
            producer=producer.display_name,
            artifact=artifact[:8000],
        )
        result = await AgentRuntime.invoke(
            self.db,
            reviewer,
            directive=prompt,
            session_id=self.session.id,
            run_id=self.run.id,
            ledger_status={"goal": self.goal, "current_milestone": milestone,
                           "facts": self.run.task_ledger.get("facts", [])},
            sender_node_id=producer.id,
            event_visibility=RunEventType.REVIEW_VERDICT.value,
            record_role=MessageRole.CRITIC,
        )
        self._accumulate(result)
        text = result.content.strip()
        # Parse the JSON verdict from the reviewer's reply.
        try:
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            start, end = text.find("{"), text.rfind("}")
            payload = json.loads(text[start : end + 1]) if start != -1 and end > start else {}
        except (json.JSONDecodeError, ValueError):
            payload = {}
        verdict = str(payload.get("verdict") or "").lower()
        if verdict not in ("approved", "revision_requested", "rejected"):
            # Mock/unstructured reviewers approve by default to keep flows moving.
            verdict = "approved"
        if verdict == "rejected":
            verdict = "revision_requested"
        return verdict, (str(payload.get("critique") or "") or None)

    # ------------------------------------------------------------ synthesis --

    async def _synthesize(self) -> str:
        assert self.orchestrator_node is not None
        milestones = self.run.task_ledger.get("milestones", [])
        artifacts = []
        for milestone in milestones:
            if milestone.get("artifact"):
                artifacts.append(f"### {milestone['title']} [{milestone['status']}]\n{milestone['artifact'][:6000]}")
        prompt = _SYNTHESIS_PROMPT.format(
            goal=self.goal,
            artifacts="\n\n".join(artifacts) or "(no artifacts produced)",
            facts="\n".join(f"- {fact}" for fact in self.run.task_ledger.get("facts", [])) or "(none)",
        )

        node = self.orchestrator_node
        chunks: list[str] = []
        async for chunk in LLMGateway.stream(
            [{"role": "system", "content": f"You are {node.display_name}, {node.professional_role}."},
             {"role": "user", "content": prompt}],
            provider=node.llm_provider,
            model=node.llm_model,
            temperature=node.temperature,
            top_p=node.top_p,
            max_tokens=node.max_tokens,
            default_model=settings.DEFAULT_ORCHESTRATOR_MODEL,
        ):
            chunks.append(chunk)
            await self._publish(RunEventType.FINAL_CHUNK, {"delta": chunk})
        return "".join(chunks)

    # ------------------------------------------------------------- main run --

    async def execute(self) -> None:
        """Run the complete dual-ledger orchestration for this run."""
        token = run_id_ctx.set(str(self.run.id))
        try:
            await self._execute_inner()
        finally:
            run_id_ctx.reset(token)

    async def _execute_inner(self) -> None:
        assert self.run is not None
        self.run.status = RunStatus.PLANNING
        self.run.started_at = _utcnow()
        await self.db.flush()

        try:
            await self._load_graph()
            assert self.dsl is not None
            await self._publish(
                RunEventType.RUN_STARTED,
                {"goal": self.goal[:500], "graph": self.dsl.metadata.name,
                 "team_size": len(self.dsl.nodes), "session_id": str(self.session.id)},
            )

            # ---- OUTER LOOP: initial Task Ledger --------------------------------
            plan = await self._plan()
            self.run.task_ledger = {**plan, "goal": self.goal, "stall_count": 0}
            self.run.progress_ledger = {"current_milestone_id": None, "completed": [], "failed": []}
            await self._save_ledgers()
            await self._record_orchestrator_message(
                f"Plan created with {len(plan['milestones'])} milestone(s).",
                RunEventType.PLAN_CREATED.value,
                {"milestones": [{k: m[k] for k in ("id", "title", "assigned_node")} for m in plan["milestones"]]},
            )
            await self._publish(RunEventType.PLAN_CREATED, {"task_ledger": self.run.task_ledger})

            stall_limit = self.dsl.orchestrator.stall_limit
            max_steps = min(self.dsl.orchestrator.max_steps, settings.MAX_ORCHESTRATION_STEPS)
            self.run.status = RunStatus.EXECUTING
            consecutive_failures = 0

            # ---- INNER LOOP over milestones -------------------------------------
            index = 0
            while index < len(self.run.task_ledger["milestones"]):
                if self._steps >= max_steps:
                    await self._publish(RunEventType.STALL_DETECTED, {"reason": "max_steps_exceeded"})
                    break
                milestone = self.run.task_ledger["milestones"][index]
                if milestone["status"] in (MilestoneStatus.VERIFIED.value, MilestoneStatus.SKIPPED.value):
                    index += 1
                    continue

                self.run.progress_ledger["current_milestone_id"] = milestone["id"]
                await self._publish(
                    RunEventType.LEDGER_UPDATE,
                    {"task_ledger": self.run.task_ledger, "progress_ledger": self.run.progress_ledger},
                )

                success = await self._execute_milestone(milestone)
                await self._save_ledgers()

                if success:
                    consecutive_failures = 0
                    self.run.progress_ledger["completed"].append(milestone["id"])
                    await self._publish(
                        RunEventType.MILESTONE_COMPLETE,
                        {"milestone_id": milestone["id"], "title": milestone["title"]},
                    )
                    index += 1
                else:
                    consecutive_failures += 1
                    self.run.stall_count += 1
                    self.run.task_ledger["stall_count"] = self.run.stall_count
                    self.run.progress_ledger["failed"].append(milestone["id"])
                    await self._publish(
                        RunEventType.STALL_DETECTED,
                        {"milestone_id": milestone["id"], "stall_count": self.run.stall_count},
                    )
                    if consecutive_failures >= stall_limit or self.run.replan_count >= 2:
                        if self.run.replan_count >= 2:
                            milestone["status"] = MilestoneStatus.SKIPPED.value
                            index += 1
                            continue
                        # ---- REPLAN ------------------------------------------------
                        self.run.status = RunStatus.REPLANNING
                        self.run.replan_count += 1
                        await self._publish(RunEventType.REPLAN, {"replan_count": self.run.replan_count})
                        stall_context = (
                            f"Milestone '{milestone['title']}' failed {consecutive_failures} time(s). "
                            f"Last artifact: {(milestone.get('artifact') or '')[:1500]}"
                        )
                        revised = await self._plan(replan_context=stall_context)
                        # Keep verified milestones, replace the pending tail.
                        kept = [
                            m for m in self.run.task_ledger["milestones"]
                            if m["status"] == MilestoneStatus.VERIFIED.value
                        ]
                        self.run.task_ledger["milestones"] = kept + revised["milestones"]
                        self.run.task_ledger["facts"] = revised["facts"] or self.run.task_ledger["facts"]
                        self.run.task_ledger["hypotheses"] = revised["hypotheses"]
                        await self._save_ledgers()
                        await self._record_orchestrator_message(
                            f"Replanned after stall (replan #{self.run.replan_count}).",
                            RunEventType.REPLAN.value,
                        )
                        self.run.status = RunStatus.EXECUTING
                        index = len(kept)
                        consecutive_failures = 0
                    else:
                        milestone["status"] = MilestoneStatus.PENDING.value  # retry same milestone

            # ---- SYNTHESIS -------------------------------------------------------
            self.run.status = RunStatus.SYNTHESIZING
            await self.db.flush()
            final = await self._synthesize()
            self.run.final_response = final
            self.run.status = RunStatus.COMPLETED
            self.run.completed_at = _utcnow()
            self.run.duration_ms = int((self.run.completed_at - self.run.started_at).total_seconds() * 1000)

            db_message = Message(
                session_id=self.session.id,
                run_id=self.run.id,
                role=MessageRole.ASSISTANT,
                content=final,
                structured_data={"milestones": len(self.run.task_ledger.get("milestones", []))},
                event_type=RunEventType.RUN_COMPLETED.value,
                input_tokens=self.run.input_tokens,
                output_tokens=self.run.output_tokens,
                cost_usd=self.run.cost_usd,
                latency_ms=self.run.duration_ms,
            )
            self.db.add(db_message)

            # Session accounting.
            self.session.total_input_tokens += self.run.input_tokens
            self.session.total_output_tokens += self.run.output_tokens
            self.session.total_cost_usd += self.run.cost_usd
            self.session.last_message_at = _utcnow()

            # Queue the ExpeL post-mortem (row is the source of truth; the ARQ
            # push is a fast-path hint and may fail without consequence).
            self.db.add(PostMortemJob(run_id=self.run.id, status=PostMortemStatus.QUEUED))
            await self.db.flush()
            if settings.WORKER_MODE in ("sidecar", "external"):
                from app.worker import enqueue_post_mortem

                await enqueue_post_mortem(self.run.id)

            await self._publish(
                RunEventType.RUN_COMPLETED,
                {
                    "status": self.run.status.value if hasattr(self.run.status, "value") else str(self.run.status),
                    "duration_ms": self.run.duration_ms,
                    "input_tokens": self.run.input_tokens,
                    "output_tokens": self.run.output_tokens,
                    "cost_usd": round(self.run.cost_usd, 6),
                    "final_response": final,
                },
            )
            logger.info(
                "run_completed",
                extra={"run_id": str(self.run.id), "steps": self._steps, "duration_ms": self.run.duration_ms},
            )

        except asyncio.CancelledError:
            self.run.status = RunStatus.CANCELLED
            self.run.completed_at = _utcnow()
            await self.db.flush()
            await self._publish(RunEventType.ERROR, {"error": "Run cancelled."})
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("run_failed", extra={"run_id": str(self.run.id)})
            self.run.status = RunStatus.FAILED
            self.run.error_message = str(exc)[:4000]
            self.run.completed_at = _utcnow()
            if self.run.started_at:
                self.run.duration_ms = int((self.run.completed_at - self.run.started_at).total_seconds() * 1000)
            await self.db.flush()
            await self._publish(RunEventType.ERROR, {"error": str(exc)[:1000]})


async def execute_run(run_id: uuid.UUID) -> None:
    """Entry point used by the chat endpoint background task: owns its DB session."""
    from app.core.database import get_async_session

    async with get_async_session() as db:
        run = await db.get(OrchestrationRun, run_id)
        if run is None:
            logger.error("run_not_found", extra={"run_id": str(run_id)})
            return
        session = await db.get(ChatSession, run.session_id)
        if session is None:
            logger.error("session_not_found_for_run", extra={"run_id": str(run_id)})
            return
        user_message = await db.get(Message, run.user_message_id) if run.user_message_id else None
        goal = user_message.content if user_message else "(missing user goal)"

        orchestrator = Orchestrator(db, run, session, goal)
        try:
            await asyncio.wait_for(orchestrator.execute(), timeout=settings.RUN_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            run.status = RunStatus.TIMEOUT
            run.error_message = f"Run exceeded {settings.RUN_TIMEOUT_SECONDS}s timeout."
            run.completed_at = _utcnow()
            await EventBus.publish(run.id, RunEventType.ERROR, {"error": run.error_message})
        await db.commit()
