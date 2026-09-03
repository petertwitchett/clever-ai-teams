"""Multi-canvas API tests: library listing, search/sort, duplication, per-canvas chat.

Verifies the backend supports "many canvases, pick one, chat with it":
  * graph list returns node/edge/session counts in ONE request (no N+1)
  * search, compiled_only, owned_only and sort work over a large library
  * duplicate clones DSL + nodes + edges into a fresh draft, sharing no history
  * sessions can be filtered per graph and carry graph_name/message_count

Run: .venv/bin/python tests/test_multi_canvas.py [base_url]
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8099"

RESULTS: list[tuple[bool, str, str]] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    RESULTS.append((ok, label, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {label} {detail}")


def _dsl(name: str, *, specialist: str = "researcher") -> dict:
    """Minimal valid two-node team DSL."""
    return {
        "dsl_version": "1.0",
        "metadata": {"name": name, "description": f"{name} description"},
        "orchestrator": {"node_key": "orchestrator", "stall_limit": 3, "max_steps": 12},
        "nodes": [
            {
                "key": "orchestrator",
                "node_type": "orchestrator",
                "identity": {
                    "display_name": "Atlas",
                    "professional_role": "Team Orchestrator",
                    "primary_duty": "Decompose the goal and dispatch subtasks.",
                },
                "persona": {"tone": "decisive", "temperament": "calm"},
                "ethics": {"absolute_constraints": []},
                "brain": {"temperature": 0.3},
            },
            {
                "key": specialist,
                "node_type": "researcher",
                "identity": {
                    "display_name": "Vera",
                    "professional_role": "Senior Research Specialist",
                    "primary_duty": "Gather and verify evidence.",
                },
                "persona": {"tone": "analytical", "temperament": "methodical"},
                "ethics": {"absolute_constraints": ["Never fabricate a citation."]},
                "brain": {"temperature": 0.5},
            },
            {
                "key": "critic",
                "node_type": "critic",
                "identity": {
                    "display_name": "Kant",
                    "professional_role": "Analytical Critic",
                    "primary_duty": "Cross-examine artifacts for logical gaps.",
                },
                "persona": {"tone": "skeptical", "temperament": "rigorous"},
                "ethics": {"absolute_constraints": []},
                "brain": {"temperature": 0.2},
            },
        ],
        "edges": [
            {"source": "orchestrator", "target": specialist, "channel": "subtask_dispatch"},
            {"source": specialist, "target": "critic", "channel": "dialectical_review", "bidirectional": True},
        ],
    }


def main() -> int:
    suffix = uuid.uuid4().hex[:8]
    with httpx.Client(base_url=BASE, timeout=120) as client:
        # ---- auth ----
        email = f"canvas-{suffix}@example.com"
        password = "CanvasTest!2345"
        r = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "full_name": "Canvas Tester"},
        )
        check(r.status_code == 201, "register", f"({r.status_code})")
        r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
        headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

        # ---- create several canvases ----
        created: list[str] = []
        names = [
            f"Alpha Market Research {suffix}",
            f"Beta Code Review {suffix}",
            f"Gamma Legal Analysis {suffix}",
        ]
        for name in names:
            r = client.post(
                "/api/v1/graphs",
                headers=headers,
                json={"name": name, "description": f"{name} desc", "dsl": _dsl(name)},
            )
            if r.status_code != 201:
                check(False, f"create graph {name}", f"({r.status_code}) {r.text[:200]}")
                return 1
            created.append(r.json()["id"])
        check(len(created) == 3, "created 3 canvases", f"n={len(created)}")

        # ---- listing carries counts in ONE request (no N+1) ----
        r = client.get("/api/v1/graphs", headers=headers, params={"limit": 100})
        check(r.status_code == 200, "list graphs", f"({r.status_code})")
        items = r.json()["items"]
        mine = {g["id"]: g for g in items if g["id"] in created}
        check(len(mine) == 3, "all created graphs listed", f"n={len(mine)}")
        first = mine[created[0]]
        check(
            first.get("node_count") == 3 and first.get("edge_count") == 2,
            "counts present without detail fetch",
            f"nodes={first.get('node_count')} edges={first.get('edge_count')}",
        )
        check("session_count" in first, "session_count exposed", f"={first.get('session_count')}")

        # ---- search ----
        r = client.get("/api/v1/graphs", headers=headers, params={"search": f"Beta Code Review {suffix}"})
        found = [g for g in r.json()["items"] if g["id"] == created[1]]
        check(len(found) == 1 and r.json()["total"] == 1, "search narrows to one canvas", f"total={r.json()['total']}")

        # ---- compiled_only ----
        r = client.post(
            "/api/v1/graphs", headers=headers, json={"name": f"Draft Only {suffix}", "description": "no dsl"}
        )
        draft_id = r.json()["id"]
        r = client.get("/api/v1/graphs", headers=headers, params={"compiled_only": True, "limit": 100})
        ids = {g["id"] for g in r.json()["items"]}
        check(draft_id not in ids and created[0] in ids, "compiled_only excludes drafts")

        # ---- owned_only ----
        r = client.get("/api/v1/graphs", headers=headers, params={"owned_only": True, "limit": 100})
        check(
            all(g["owner_id"] for g in r.json()["items"]) and created[0] in {g["id"] for g in r.json()["items"]},
            "owned_only returns my canvases",
        )

        # ---- sort by name ----
        r = client.get(
            "/api/v1/graphs", headers=headers, params={"sort": "name", "search": suffix, "limit": 100}
        )
        got = [g["name"] for g in r.json()["items"]]
        check(got == sorted(got), "sort=name is ordered", f"{got[:2]}")

        # ---- duplicate ----
        r = client.post(
            f"/api/v1/graphs/{created[0]}/duplicate",
            headers=headers,
            params={"name": f"Alpha Clone {suffix}"},
        )
        check(r.status_code == 201, "duplicate canvas", f"({r.status_code}) {r.text[:160]}")
        clone = r.json()
        check(clone["id"] != created[0], "clone has new id")
        check(len(clone["nodes"]) == 3, "clone copied nodes", f"n={len(clone['nodes'])}")
        check(len(clone["edges"]) == 2, "clone copied edges", f"n={len(clone['edges'])}")
        check(clone["status"] == "compiled", "clone recompiled and chat-ready", clone["status"])
        check(clone["name"] == f"Alpha Clone {suffix}", "clone renamed", clone["name"])
        check(clone["is_public"] is False, "clone is private by default")

        # source unaffected
        r = client.get(f"/api/v1/graphs/{created[0]}", headers=headers)
        check(len(r.json()["nodes"]) == 3, "source canvas untouched by clone")

        # ---- sessions per canvas ----
        s_ids: dict[str, str] = {}
        for gid, title in ((created[0], "alpha chat"), (created[1], "beta chat")):
            r = client.post("/api/v1/sessions", headers=headers, json={"graph_id": gid, "title": title})
            if r.status_code != 201:
                check(False, f"create session for {gid}", f"({r.status_code}) {r.text[:200]}")
                return 1
            s_ids[gid] = r.json()["id"]
        check(len(s_ids) == 2, "sessions opened on two canvases")

        # unfiltered list is enriched
        r = client.get("/api/v1/sessions", headers=headers, params={"limit": 100})
        sess = {s["id"]: s for s in r.json()["items"]}
        alpha = sess[s_ids[created[0]]]
        check(alpha.get("graph_name") == names[0], "session carries graph_name", str(alpha.get("graph_name"))[:40])
        check("message_count" in alpha and "run_count" in alpha, "session carries counts")
        check(alpha.get("graph_status") == "compiled", "session carries graph_status")

        # filtered by graph
        r = client.get("/api/v1/sessions", headers=headers, params={"graph_id": created[0]})
        got_ids = {s["id"] for s in r.json()["items"]}
        check(
            got_ids == {s_ids[created[0]]},
            "graph_id filter scopes chat history to one canvas",
            f"n={len(got_ids)}",
        )

        # title search
        r = client.get("/api/v1/sessions", headers=headers, params={"search": "beta chat"})
        check(
            {s["id"] for s in r.json()["items"]} == {s_ids[created[1]]},
            "session title search works",
        )

        # session_count on the graph reflects the new session
        r = client.get("/api/v1/graphs", headers=headers, params={"search": names[0]})
        check(r.json()["items"][0]["session_count"] >= 1, "graph session_count updated")

        # ---- draft cannot be chatted with ----
        r = client.post("/api/v1/sessions", headers=headers, json={"graph_id": draft_id})
        check(r.status_code == 422, "draft canvas rejected for chat", f"({r.status_code})")

        # ---- cleanup ----
        for gid in [*created, draft_id, clone["id"]]:
            client.delete(f"/api/v1/graphs/{gid}", headers=headers)

    passed = sum(1 for ok, _, _ in RESULTS if ok)
    failed = len(RESULTS) - passed
    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
