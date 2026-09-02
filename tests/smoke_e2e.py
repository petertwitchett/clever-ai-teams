#!/usr/bin/env python3
"""End-to-end smoke test against a running API instance.

Covers: registration, login, graph compile (DSL), personas, skill registration
and sandbox execution, memory append/search, session creation, chat command
with SSE observability stream, run inspection and post-mortem drain.
"""

from __future__ import annotations

import json
import sys
import time
import uuid

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8099"
EMAIL = f"smoke-{uuid.uuid4().hex[:8]}@example.com"
PASSWORD = "smoke-test-password-123"

DSL = {
    "dsl_version": "1.0",
    "metadata": {"name": "Deep Research Team", "description": "Smoke-test team", "tags": ["smoke"]},
    "orchestrator": {"node_key": "orchestrator", "stall_limit": 3, "max_steps": 20, "max_review_iterations": 1},
    "nodes": [
        {
            "key": "orchestrator",
            "node_type": "orchestrator",
            "identity": {
                "display_name": "Atlas",
                "professional_role": "Team Orchestrator",
                "primary_duty": "Decompose goals, dispatch subtasks, synthesize final answers.",
            },
            "persona": {"tone": "decisive", "temperament": "calm", "cognitive_style": "strategic"},
            "ethics": {"absolute_constraints": ["Never fabricate facts or citations."]},
            "brain": {"temperature": 0.3},
        },
        {
            "key": "researcher",
            "node_type": "researcher",
            "identity": {
                "display_name": "Dr. Elena Voss",
                "professional_role": "Senior Research Specialist",
                "primary_duty": "Gather, verify and summarize domain research for assigned subtasks.",
            },
            "persona": {
                "tone": "analytical",
                "temperament": "methodical",
                "quirks": ["cites sources compulsively"],
                "values": ["empirical rigor"],
            },
            "ethics": {"absolute_constraints": ["Never fabricate statistics.", "Never present speculation as fact."]},
            "brain": {"temperature": 0.5},
        },
        {
            "key": "critic",
            "node_type": "critic",
            "identity": {
                "display_name": "Marcus Chen",
                "professional_role": "Analytical Critic",
                "primary_duty": "Cross-examine artifacts for logical fallacies and factual gaps.",
            },
            "persona": {"tone": "skeptical", "temperament": "exacting"},
            "ethics": {"absolute_constraints": ["Never approve unverified claims without noting reservations."]},
            "brain": {"temperature": 0.2},
        },
    ],
    "edges": [
        {"source": "orchestrator", "target": "researcher", "channel": "subtask_dispatch"},
        {"source": "orchestrator", "target": "critic", "channel": "subtask_dispatch"},
        {"source": "researcher", "target": "critic", "channel": "dialectical_review", "bidirectional": True},
    ],
}

SKILL_CODE = '''
import statistics

def run(numbers: list) -> dict:
    """Compute descriptive statistics for a list of numbers."""
    data = [float(n) for n in numbers]
    return {
        "count": len(data),
        "mean": statistics.mean(data),
        "median": statistics.median(data),
        "stdev": statistics.stdev(data) if len(data) > 1 else 0.0,
        "min": min(data),
        "max": max(data),
    }
'''


def main() -> int:
    ok = 0
    failed = 0

    def check(name: str, condition: bool, detail: str = "") -> None:
        nonlocal ok, failed
        symbol = "PASS" if condition else "FAIL"
        print(f"[{symbol}] {name} {detail}")
        if condition:
            ok += 1
        else:
            failed += 1

    with httpx.Client(base_url=BASE, timeout=180) as client:
        # health
        r = client.get("/health/ready")
        check("readiness", r.status_code == 200 and r.json()["checks"]["database"]["status"] == "healthy")

        # auth
        r = client.post("/api/v1/auth/register", json={"email": EMAIL, "password": PASSWORD, "full_name": "Smoke"})
        check("register", r.status_code == 201, f"({r.status_code})")
        r = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
        check("login", r.status_code == 200)
        headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

        # graph validate + create + compile
        r = client.post("/api/v1/graphs/validate", json={"dsl": DSL}, headers=headers)
        check("dsl validate", r.status_code == 200 and not [i for i in r.json()["issues"] if i["severity"] == "error"],
              json.dumps(r.json().get("issues", []))[:120])

        r = client.post("/api/v1/graphs", json={"name": "Deep Research Team", "dsl": DSL}, headers=headers)
        check("graph create+compile", r.status_code == 201 and r.json()["status"] == "compiled", f"({r.status_code})")
        graph = r.json()
        graph_id = graph["id"]
        nodes = {n["node_key"]: n for n in graph["nodes"]}
        check("nodes materialized", len(nodes) == 3 and len(graph["edges"]) == 3)

        researcher_id = nodes["researcher"]["id"]

        # persona patch
        r = client.patch(f"/api/v1/personas/{researcher_id}", json={"temperature": 0.4}, headers=headers)
        check("persona patch", r.status_code == 200 and abs(r.json()["temperature"] - 0.4) < 1e-6)

        # skill register (admin: first user) + execute
        r = client.post(
            "/api/v1/skills",
            json={
                "name": "descriptive_stats",
                "description": "Compute count/mean/median/stdev/min/max for a list of numbers. "
                               "Useful for quick numeric analysis of datasets.",
                "code": SKILL_CODE,
                "entrypoint": "run",
                "node_id": researcher_id,
            },
            headers=headers,
        )
        check("skill register", r.status_code == 201, f"({r.status_code}) {r.text[:120]}")
        skill_id = r.json()["id"] if r.status_code == 201 else None

        if skill_id:
            r = client.post(
                f"/api/v1/skills/{skill_id}/execute",
                json={"arguments": {"numbers": [1, 2, 3, 4, 100]}},
                headers=headers,
            )
            good = r.status_code == 200 and r.json()["success"] and r.json()["result"]["mean"] == 22.0
            check("skill sandbox execute", good, f"result={r.json().get('result')}")

            r = client.post("/api/v1/skills/search", json={"query": "statistics of a number list"}, headers=headers)
            check("skill vector search", r.status_code == 200 and len(r.json()) >= 1,
                  f"hits={len(r.json()) if r.status_code == 200 else r.text[:100]}")

        # forbidden skill must be rejected by the AST validator
        r = client.post(
            "/api/v1/skills",
            json={
                "name": "evil",
                "description": "bad",
                "code": "import os\ndef run():\n    return os.listdir('/')",
                "node_id": researcher_id,
            },
            headers=headers,
        )
        check("forbidden skill rejected", r.status_code == 422, f"({r.status_code})")

        # memory append + search
        r = client.post(
            f"/api/v1/memory/nodes/{researcher_id}",
            json={"content": "The user prefers concise, well-cited answers about market research.", "memory_type": "preference"},
            headers=headers,
        )
        check("memory append", r.status_code == 201)
        r = client.post(
            f"/api/v1/memory/nodes/{researcher_id}/search",
            json={"query": "how should I format answers for this user?", "top_k": 3},
            headers=headers,
        )
        check("memory vector search", r.status_code == 200 and len(r.json()) >= 1,
              f"sim={r.json()[0]['similarity'] if r.status_code == 200 and r.json() else 'n/a'}")

        # session + chat (non-streaming first)
        r = client.post("/api/v1/sessions", json={"graph_id": graph_id}, headers=headers)
        check("session create", r.status_code == 201)
        session_id = r.json()["id"]

        r = client.post(
            f"/api/v1/chat/{session_id}/messages",
            json={"content": "Give a two-sentence overview of what multi-agent AI systems are.", "stream": False},
            headers=headers,
        )
        check("chat command accepted", r.status_code == 201, f"({r.status_code}) {r.text[:120]}")
        run_id = r.json()["id"]

        # poll run to completion
        deadline = time.time() + 120
        status = "pending"
        while time.time() < deadline:
            r = client.get(f"/api/v1/chat/runs/{run_id}", headers=headers)
            status = r.json()["status"]
            if status in ("completed", "failed", "cancelled", "timeout"):
                break
            time.sleep(2)
        run = r.json()
        check("run completed", status == "completed", f"status={status} err={str(run.get('error_message'))[:100]}")
        check("task ledger populated", bool(run["task_ledger"].get("milestones")),
              f"milestones={len(run['task_ledger'].get('milestones', []))}")
        check("final response", bool(run.get("final_response")), f"len={len(run.get('final_response') or '')}")

        # event replay
        r = client.get(f"/api/v1/chat/runs/{run_id}/events/history", headers=headers)
        events = [e["event"] for e in r.json()]
        check("event history", r.status_code == 200 and "run_started" in events and "run_completed" in events,
              f"events={len(events)}")

        # SSE streaming send
        got_events: list[str] = []
        with client.stream(
            "POST",
            f"/api/v1/chat/{session_id}/messages",
            json={"content": "Now summarize that in one sentence.", "stream": True},
            headers=headers,
        ) as response:
            check("sse stream opened", response.status_code in (200, 201), f"({response.status_code})")
            for line in response.iter_lines():
                if line.startswith("event:"):
                    got_events.append(line.split(":", 1)[1].strip())
                if "run_completed" in line or "error" == line.strip():
                    if got_events and got_events[-1] in ("run_completed", "error"):
                        break
        check("sse frames received", "run_started" in got_events and "run_completed" in got_events,
              f"unique={sorted(set(got_events))[:8]}")

        # messages ledger
        r = client.get(f"/api/v1/sessions/{session_id}/messages", headers=headers, params={"limit": 200})
        check("message ledger", r.status_code == 200 and r.json()["total"] >= 4, f"total={r.json().get('total')}")

        # post-mortem drain (ExpeL) - admin only; 403 for regular users proves the guard
        r = client.post("/api/v1/post-mortems/drain", headers=headers)
        check("post-mortem drain guarded", r.status_code in (200, 403), r.text[:120])
        r = client.get("/api/v1/post-mortems", headers=headers)
        check("post-mortem jobs listed", r.status_code == 200 and r.json()["total"] >= 1,
              f"total={r.json().get('total')}")

    print(f"\n{ok} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
