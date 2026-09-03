"""HITL approval-gate tests for unverified (candidate) skill execution.

Verifies the fix for the previously-unreachable interrupt gate:
  * a candidate skill triggers the approval gate before the sandbox runs
  * denial short-circuits execution and feeds the refusal back to the agent
  * approval lets the sandbox run normally
  * verified/builtin skills bypass the gate entirely
  * the gate is inert when HITL_REQUIRE_APPROVAL_FOR_NEW_SKILLS is off

Run: .venv/bin/python tests/test_hitl_gate.py
"""

from __future__ import annotations

import asyncio
import json
import sys
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from app.core.config import settings  # noqa: E402
from app.core.database import get_async_session  # noqa: E402
from app.models import (  # noqa: E402
    AgentGraph,
    AgentSkill,
    ChatSession,
    GraphStatus,
    PersonNode,
    SkillStatus,
    User,
)
from app.services import agent_runtime as rt  # noqa: E402
from app.services import persona as persona_mod  # noqa: E402
from app.services.llm_gateway import LLMResponse  # noqa: E402

RESULTS: list[tuple[bool, str, str]] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    RESULTS.append((ok, label, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {label} {detail}")


SKILL_CODE = "def run(x: int) -> int:\n    \"\"\"Double x.\"\"\"\n    return int(x) * 2\n"


async def _fixtures(db) -> tuple[PersonNode, AgentSkill, uuid.UUID]:
    """Create an isolated user/graph/node/session + one candidate skill."""
    suffix = uuid.uuid4().hex[:8]
    user = User(
        email=f"hitl-{suffix}@example.com",
        hashed_password="x" * 20,
        full_name="HITL Test",
        role="admin",
    )
    db.add(user)
    await db.flush()

    graph = AgentGraph(
        owner_id=user.id,
        name=f"hitl-graph-{suffix}",
        description="HITL gate test",
        status=GraphStatus.COMPILED,
        dsl={},
        canvas_layout={},
    )
    db.add(graph)
    await db.flush()

    node = PersonNode(
        graph_id=graph.id,
        node_key="worker",
        node_type="specialist",
        display_name="Worker",
        professional_role="Engineer",
        primary_duty="Compute things",
        temperature=0.2,
    )
    db.add(node)
    await db.flush()

    skill = AgentSkill(
        node_id=node.id,
        name=f"double_{suffix}",
        description="Doubles an integer input.",
        code=SKILL_CODE,
        entrypoint="run",
        parameters_schema={"type": "object", "properties": {"x": {"type": "integer"}}},
        status=SkillStatus.CANDIDATE,
    )
    db.add(skill)
    await db.flush()

    chat = ChatSession(user_id=user.id, graph_id=graph.id, title="hitl")
    db.add(chat)
    await db.flush()
    return node, skill, chat.id


def _stub_llm(skill_id: str) -> None:
    """First call emits a use_skill request, subsequent calls answer plainly."""
    state = {"n": 0}

    async def fake_complete(messages, **kwargs):  # noqa: ANN001
        state["n"] += 1
        if state["n"] == 1:
            payload = json.dumps({"action": "use_skill", "skill_id": skill_id, "arguments": {"x": 21}})
            return LLMResponse(content=payload, model="stub", input_tokens=1, output_tokens=1)
        return LLMResponse(content="Final answer: done.", model="stub", input_tokens=1, output_tokens=1)

    rt.LLMGateway.complete = staticmethod(fake_complete)  # type: ignore[assignment]


def _stub_skill_retrieval(skill: AgentSkill) -> None:
    """Force the persona assembler to offer this skill.

    The keyless embedding fallback is a deterministic hash, so cosine similarity
    between an unrelated directive and the skill docstring sits below the 0.05
    retrieval floor. That is correct production behaviour but it would stop the
    skill from ever reaching ``allowed_skill_ids``, so the gate under test would
    never be exercised. Stubbing retrieval isolates the gate itself.
    """

    async def fake_search(db, query, **kwargs):  # noqa: ANN001, ARG001
        return [(skill, 0.99)]

    persona_mod.SkillService.search = staticmethod(fake_search)  # type: ignore[assignment]


async def main() -> int:
    original_complete = rt.LLMGateway.complete
    original_search = persona_mod.SkillService.search
    original_flag = settings.HITL_REQUIRE_APPROVAL_FOR_NEW_SKILLS
    try:
        # ---------- 1. candidate skill + HITL on -> gate fires, denial path ----------
        settings.HITL_REQUIRE_APPROVAL_FOR_NEW_SKILLS = True
        async with get_async_session() as db:
            node, skill, session_id = await _fixtures(db)
            skill_id = str(skill.id)
            _stub_llm(skill_id)
            _stub_skill_retrieval(skill)

            seen: list[dict[str, Any]] = []

            async def deny(request: dict[str, Any]) -> bool:
                seen.append(request)
                return False

            result = await rt.AgentRuntime.invoke(
                db,
                node,
                directive="Double 21 using your skill.",
                session_id=session_id,
                approval_gate=deny,
            )
            await db.rollback()

        check(len(seen) == 1, "gate invoked for candidate skill", f"calls={len(seen)}")
        if seen:
            req = seen[0]
            check(req.get("type") == "sandbox_approval", "gate payload type", str(req.get("type")))
            check(req.get("skill_id") == skill_id, "gate payload carries skill id")
            check(bool(req.get("code")), "gate payload includes code for review")
            check(len(req.get("code_sha256", "")) == 64, "gate payload includes code sha256")
        denied = [c for c in result.skill_calls if c.get("denied")]
        check(len(denied) == 1, "denial recorded in skill_calls", f"denied={len(denied)}")
        check(
            all(c.get("success") is False for c in denied),
            "denied call marked unsuccessful",
        )

        # ---------- 2. candidate skill + approval -> sandbox runs ----------
        async with get_async_session() as db:
            node, skill, session_id = await _fixtures(db)
            _stub_llm(str(skill.id))
            _stub_skill_retrieval(skill)

            approved_reqs: list[dict[str, Any]] = []

            async def allow(request: dict[str, Any]) -> bool:
                approved_reqs.append(request)
                return True

            result = await rt.AgentRuntime.invoke(
                db,
                node,
                directive="Double 21 using your skill.",
                session_id=session_id,
                approval_gate=allow,
            )
            await db.rollback()

        check(len(approved_reqs) == 1, "gate invoked before approved execution")
        executed = [c for c in result.skill_calls if not c.get("denied")]
        check(len(executed) == 1, "approved skill executed", f"calls={len(executed)}")
        if executed:
            check(executed[0].get("success") is True, "sandbox succeeded", str(executed[0].get("error")))
            check(executed[0].get("result") == 42, "sandbox returned 42", str(executed[0].get("result")))

        # ---------- 3. verified skill -> gate bypassed ----------
        async with get_async_session() as db:
            node, skill, session_id = await _fixtures(db)
            skill.status = SkillStatus.VERIFIED
            await db.flush()
            _stub_llm(str(skill.id))
            _stub_skill_retrieval(skill)

            calls: list[dict[str, Any]] = []

            async def record(request: dict[str, Any]) -> bool:
                calls.append(request)
                return True

            result = await rt.AgentRuntime.invoke(
                db, node, directive="Double 21.", session_id=session_id, approval_gate=record
            )
            await db.rollback()

        check(len(calls) == 0, "verified skill bypasses gate", f"calls={len(calls)}")
        check(len(result.skill_calls) == 1, "verified skill still executed")

        # ---------- 4. HITL disabled -> gate inert even for candidates ----------
        settings.HITL_REQUIRE_APPROVAL_FOR_NEW_SKILLS = False
        async with get_async_session() as db:
            node, skill, session_id = await _fixtures(db)
            _stub_llm(str(skill.id))
            _stub_skill_retrieval(skill)

            calls2: list[dict[str, Any]] = []

            async def record2(request: dict[str, Any]) -> bool:
                calls2.append(request)
                return False

            result = await rt.AgentRuntime.invoke(
                db, node, directive="Double 21.", session_id=session_id, approval_gate=record2
            )
            await db.rollback()

        check(len(calls2) == 0, "gate inert when HITL flag is off", f"calls={len(calls2)}")
        check(
            any(c.get("success") for c in result.skill_calls),
            "skill executed with HITL off",
        )

        # ---------- 5. no gate supplied (REST path) -> executes ----------
        settings.HITL_REQUIRE_APPROVAL_FOR_NEW_SKILLS = True
        async with get_async_session() as db:
            node, skill, session_id = await _fixtures(db)
            _stub_llm(str(skill.id))
            _stub_skill_retrieval(skill)
            result = await rt.AgentRuntime.invoke(
                db, node, directive="Double 21.", session_id=session_id
            )
            await db.rollback()
        check(
            any(c.get("success") for c in result.skill_calls),
            "no-gate caller executes (engine-agnostic default)",
        )
    finally:
        rt.LLMGateway.complete = original_complete  # type: ignore[assignment]
        persona_mod.SkillService.search = original_search  # type: ignore[assignment]
        settings.HITL_REQUIRE_APPROVAL_FOR_NEW_SKILLS = original_flag
        from app.core.database import close_async_engine

        await close_async_engine()

    passed = sum(1 for ok, _, _ in RESULTS if ok)
    failed = len(RESULTS) - passed
    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
