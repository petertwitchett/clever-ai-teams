"""Agent runtime: executes a single person node invocation.

Pipeline per invocation:
1. PersonaAssembler builds the 5-priority context (constitution, identity,
   lessons, skills, working context).
2. The bound LLM brain is invoked.
3. If the model requests a skill ({"action": "use_skill", ...}) the skill is
   executed in the sandbox and the result is fed back (bounded loop).
4. The ConstitutionalInterceptor audits the final output; violations trigger a
   corrective re-prompt (recovery loop).
5. Everything is persisted to the immutable message ledger and the node's
   working memory.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models import Message, MessageRole, PersonNode, RunEventType
from app.services.event_bus import EventBus
from app.services.llm_gateway import LLMGateway, LLMResponse
from app.services.memory import MemoryService
from app.services.persona import AssembledContext, ConstitutionalInterceptor, PersonaAssembler
from app.services.skills import SkillService

logger = get_logger(__name__)

_MAX_SKILL_ITERATIONS = 4
_MAX_CONSTITUTION_RETRIES = 2


@dataclass
class AgentInvocationResult:
    """Outcome of one person-node invocation."""

    content: str
    node_id: uuid.UUID
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    model_used: str | None = None
    skill_calls: list[dict[str, Any]] = field(default_factory=list)
    constitution_retries: int = 0
    lessons_used: int = 0
    skills_offered: int = 0


def _try_parse_skill_call(content: str) -> dict[str, Any] | None:
    """Detect a {"action": "use_skill", ...} JSON payload in the model output."""
    text = content.strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
    if not (text.startswith("{") and '"use_skill"' in text):
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, dict) and payload.get("action") == "use_skill" and payload.get("skill_id"):
        return payload
    return None


class AgentRuntime:
    """Invoke person nodes with full persona, memory, skills and guardrails."""

    @staticmethod
    async def invoke(
        db: AsyncSession,
        node: PersonNode,
        *,
        directive: str,
        task_text: str = "",
        session_id: uuid.UUID | None = None,
        run_id: uuid.UUID | None = None,
        ledger_status: dict[str, Any] | None = None,
        sender_node_id: uuid.UUID | None = None,
        event_visibility: str = "agent_debate",
        extra_system: str | None = None,
        record_role: MessageRole = MessageRole.AGENT,
    ) -> AgentInvocationResult:
        """Run the node once against the directive; returns the final artifact."""
        context: AssembledContext = await PersonaAssembler.assemble(
            db,
            node,
            session_id=session_id,
            task_text=task_text,
            directive=directive,
            ledger_status=ledger_status,
            extra_system=extra_system,
        )

        messages: list[dict[str, str]] = [{"role": "system", "content": context.system_prompt}]
        messages.extend(context.messages)
        user_prompt = directive if not task_text else f"{directive}\n\n--- TASK INPUT ---\n{task_text}"
        messages.append({"role": "user", "content": user_prompt})

        totals = AgentInvocationResult(content="", node_id=node.id)
        totals.lessons_used = len(context.retrieved_lessons)
        totals.skills_offered = len(context.retrieved_skills)
        allowed_skill_ids = {str(skill.id) for skill in context.retrieved_skills}

        if run_id:
            await EventBus.publish(
                run_id,
                RunEventType.AGENT_THINKING,
                {
                    "node_key": node.node_key,
                    "node_name": node.display_name,
                    "role": node.professional_role,
                    "directive": directive[:400],
                    "skills_available": totals.skills_offered,
                    "lessons_injected": totals.lessons_used,
                },
            )

        response: LLMResponse | None = None
        for iteration in range(_MAX_SKILL_ITERATIONS + 1):
            response = await LLMGateway.complete(
                messages,
                provider=node.llm_provider,
                model=node.llm_model,
                temperature=node.temperature,
                top_p=node.top_p,
                max_tokens=node.max_tokens,
                default_model=settings.DEFAULT_SPECIALIST_MODEL,
            )
            totals.input_tokens += response.input_tokens
            totals.output_tokens += response.output_tokens
            totals.cost_usd += response.cost_usd
            totals.latency_ms += response.latency_ms
            totals.model_used = response.model

            skill_call = _try_parse_skill_call(response.content)
            if skill_call is None or iteration >= _MAX_SKILL_ITERATIONS:
                break

            skill_id_raw = str(skill_call["skill_id"])
            arguments = skill_call.get("arguments") or {}
            if skill_id_raw not in allowed_skill_ids:
                messages.append({"role": "assistant", "content": response.content})
                messages.append(
                    {"role": "user", "content": f"Skill {skill_id_raw} is not in your available skill list. "
                                                 "Answer directly or use one of the listed skills."}
                )
                continue

            if run_id:
                await EventBus.publish(
                    run_id,
                    RunEventType.TOOL_CALL,
                    {"node_key": node.node_key, "skill_id": skill_id_raw, "arguments": arguments},
                )
            try:
                sandbox_result = await SkillService.execute(
                    db, uuid.UUID(skill_id_raw), arguments, node_id=node.id, run_id=run_id
                )
                outcome = {
                    "success": sandbox_result.success,
                    "result": sandbox_result.result if sandbox_result.success else None,
                    "error": sandbox_result.error,
                    "stdout": (sandbox_result.stdout or "")[:2000],
                    "duration_ms": sandbox_result.duration_ms,
                }
            except Exception as exc:  # noqa: BLE001 - sandbox issues feed back to the agent
                outcome = {"success": False, "error": str(exc)[:800]}

            totals.skill_calls.append({"skill_id": skill_id_raw, "arguments": arguments, **outcome})
            if run_id:
                await EventBus.publish(
                    run_id, RunEventType.TOOL_RESULT,
                    {"node_key": node.node_key, "skill_id": skill_id_raw, **{k: outcome[k] for k in ("success", "error", "duration_ms") if k in outcome}},
                )

            messages.append({"role": "assistant", "content": response.content})
            messages.append(
                {
                    "role": "user",
                    "content": "SKILL EXECUTION RESULT:\n" + json.dumps(outcome, ensure_ascii=False, default=str)[:6000]
                    + "\n\nUse this result to complete your directive. Respond with your final answer "
                    "(or another skill call if strictly necessary).",
                }
            )

        final_content = response.content if response else ""

        # Constitutional recovery loop.
        for retry in range(_MAX_CONSTITUTION_RETRIES + 1):
            compliant, reason = await ConstitutionalInterceptor.check(node, final_content)
            if compliant:
                break
            totals.constitution_retries += 1
            logger.info(
                "constitutional_violation_recovery",
                extra={"node": node.node_key, "retry": retry + 1, "reason": (reason or "")[:200]},
            )
            if retry >= _MAX_CONSTITUTION_RETRIES:
                final_content = (
                    f"[{node.display_name}] I must decline to provide that output: it conflicts with my "
                    f"operating constraints ({reason or 'constitutional rule'})."
                )
                break
            messages.append({"role": "assistant", "content": final_content})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "CONSTITUTIONAL AUDIT FAILED: "
                        f"{reason}\nRewrite your answer so it fully complies with your constitutional "
                        "constraints while still completing the directive as far as permissible."
                    ),
                }
            )
            correction = await LLMGateway.complete(
                messages,
                provider=node.llm_provider,
                model=node.llm_model,
                temperature=min(node.temperature, 0.5),
                top_p=node.top_p,
                max_tokens=node.max_tokens,
                default_model=settings.DEFAULT_SPECIALIST_MODEL,
            )
            totals.input_tokens += correction.input_tokens
            totals.output_tokens += correction.output_tokens
            totals.cost_usd += correction.cost_usd
            totals.latency_ms += correction.latency_ms
            final_content = correction.content

        totals.content = final_content

        # Persist to ledger + working memory.
        if session_id is not None:
            db.add(
                Message(
                    session_id=session_id,
                    run_id=run_id,
                    role=record_role,
                    sender_node_id=node.id,
                    recipient_node_id=sender_node_id,
                    content=final_content,
                    structured_data={
                        "directive": directive[:2000],
                        "skill_calls": totals.skill_calls,
                        "constitution_retries": totals.constitution_retries,
                    },
                    event_type=event_visibility,
                    model_used=totals.model_used,
                    input_tokens=totals.input_tokens,
                    output_tokens=totals.output_tokens,
                    latency_ms=totals.latency_ms,
                    cost_usd=totals.cost_usd,
                )
            )
            await db.flush()
            await MemoryService.push_working_memory(
                session_id, node.id, "user", directive, window=node.working_memory_window
            )
            await MemoryService.push_working_memory(
                session_id, node.id, "assistant", final_content, window=node.working_memory_window
            )

        if run_id:
            await EventBus.publish(
                run_id,
                RunEventType.AGENT_DEBATE,
                {
                    "node_key": node.node_key,
                    "node_name": node.display_name,
                    "role": node.professional_role,
                    "content": final_content[:2500],
                    "skill_calls": len(totals.skill_calls),
                    "tokens": totals.input_tokens + totals.output_tokens,
                },
            )
        return totals
