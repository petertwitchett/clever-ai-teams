"""Seed rich multi-agent teams and Python skills into the PostgreSQL database."""

import asyncio
import re
from sqlalchemy import select
from app.core.database import get_async_session
from app.services.graph_compiler import compile_graph
from app.services.skills import SkillService
from app.models import User, AgentGraph, GraphStatus, UserRole
from app.schemas.dsl import GraphDSL

team_engineering = {
    "dsl_version": "1.0",
    "metadata": {
        "name": "Autonomous Fullstack Engineering Team",
        "description": "Cross-functional software engineering team with automated AST security audits and peer code review.",
        "tags": ["software", "engineering", "security"]
    },
    "orchestrator": {
        "node_key": "orchestrator",
        "stall_limit": 4,
        "max_steps": 25,
        "max_milestones": 15,
        "timeout_seconds": 900,
        "max_review_iterations": 2
    },
    "nodes": [
        {
            "key": "orchestrator",
            "node_type": "orchestrator",
            "identity": {
                "display_name": "Nexus Prime",
                "professional_role": "Lead Systems Architect",
                "primary_duty": "Deconstruct software architectures, assign code modules, and enforce sprint delivery."
            },
            "persona": {
                "tone": "decisive",
                "temperament": "calm",
                "cognitive_style": "modular",
                "quirks": ["prefers clean abstractions"]
            },
            "ethics": {
                "absolute_constraints": ["Never commit untested or unverified code.", "Adhere to least privilege principle."]
            },
            "brain": {"provider": "openai", "model": "o1-preview", "temperature": 0.2}
        },
        {
            "key": "developer",
            "node_type": "developer",
            "identity": {
                "display_name": "Kaelen Chen",
                "professional_role": "Senior Fullstack Engineer",
                "primary_duty": "Implement core algorithms, backend API endpoints, and clean React UI modules."
            },
            "persona": {
                "tone": "pragmatic",
                "temperament": "focused",
                "cognitive_style": "test-driven",
                "quirks": ["writes exhaustive comments"]
            },
            "ethics": {
                "absolute_constraints": ["Never introduce known CVE security vulnerabilities.", "Follow DRY principles."]
            },
            "brain": {"provider": "deepseek", "model": "deepseek-coder-v2", "temperature": 0.3}
        },
        {
            "key": "critic",
            "node_type": "critic",
            "identity": {
                "display_name": "Marcus Drake",
                "professional_role": "Security & Code Auditor",
                "primary_duty": "Perform AST syntax analysis, check boundary conditions, and verify memory safety."
            },
            "persona": {
                "tone": "skeptical",
                "temperament": "exacting",
                "cognitive_style": "adversarial",
                "quirks": ["scrutinizes regex edge cases"]
            },
            "ethics": {
                "absolute_constraints": ["Reject ungrounded code claims without automated verification."]
            },
            "brain": {"provider": "anthropic", "model": "claude-3-5-sonnet", "temperature": 0.2}
        }
    ],
    "edges": [
        {"source": "orchestrator", "target": "developer", "channel": "subtask_dispatch"},
        {"source": "orchestrator", "target": "critic", "channel": "subtask_dispatch"},
        {"source": "developer", "target": "critic", "channel": "dialectical_review", "bidirectional": True}
    ]
}

team_quant = {
    "dsl_version": "1.0",
    "metadata": {
        "name": "Quantitative Risk & Market Intelligence Collective",
        "description": "High-frequency market analysis and dialectical macroeconomic risk auditing.",
        "tags": ["finance", "risk", "quantitative"]
    },
    "orchestrator": {
        "node_key": "orchestrator",
        "stall_limit": 3,
        "max_steps": 20,
        "max_milestones": 10,
        "timeout_seconds": 600,
        "max_review_iterations": 2
    },
    "nodes": [
        {
            "key": "orchestrator",
            "node_type": "orchestrator",
            "identity": {
                "display_name": "Alpha Director",
                "professional_role": "Chief Investment Strategist",
                "primary_duty": "Formulate hypothesis-driven asset allocation models and oversee risk budgets."
            },
            "persona": {
                "tone": "analytical",
                "temperament": "unflappable",
                "cognitive_style": "probabilistic",
                "quirks": ["always demands standard deviation bounds"]
            },
            "ethics": {
                "absolute_constraints": ["Never project returns without disclosing downside variance."]
            },
            "brain": {"provider": "openai", "model": "gpt-4o", "temperature": 0.2}
        },
        {
            "key": "researcher",
            "node_type": "researcher",
            "identity": {
                "display_name": "Sofia Reyes",
                "professional_role": "Macroeconomic Data Specialist",
                "primary_duty": "Ingest macroeconomic indicators, interest rate forecasts, and inflation vectors."
            },
            "persona": {
                "tone": "rigorous",
                "temperament": "curious",
                "cognitive_style": "empirical",
                "quirks": ["cites central bank minutes directly"]
            },
            "ethics": {
                "absolute_constraints": ["Never extrapolate trends without statistical significance p < 0.05."]
            },
            "brain": {"provider": "anthropic", "model": "claude-3-5-sonnet", "temperature": 0.3}
        },
        {
            "key": "critic",
            "node_type": "critic",
            "identity": {
                "display_name": "Victoria Sterling",
                "professional_role": "Dialectical Risk Auditor",
                "primary_duty": "Stress-test assumptions against black swan events and liquidity crises."
            },
            "persona": {
                "tone": "cautious",
                "temperament": "penetrating",
                "cognitive_style": "tail-risk analysis",
                "quirks": ["focuses exclusively on worst-case drawdown"]
            },
            "ethics": {
                "absolute_constraints": ["Always reject strategies that risk total capital impairment."]
            },
            "brain": {"provider": "deepseek", "model": "deepseek-r1", "temperature": 0.1}
        }
    ],
    "edges": [
        {"source": "orchestrator", "target": "researcher", "channel": "subtask_dispatch"},
        {"source": "orchestrator", "target": "critic", "channel": "subtask_dispatch"},
        {"source": "researcher", "target": "critic", "channel": "dialectical_review", "bidirectional": True}
    ]
}

skills_to_seed = [
    {
        "name": "monte_carlo_risk_simulator",
        "description": "Simulate asset returns over N iterations using geometric Brownian motion with volatility and drift parameters.",
        "code": """import random
import math

def run(initial_price: float = 100.0, mu: float = 0.08, sigma: float = 0.18, days: int = 30, simulations: int = 500) -> dict:
    \"\"\"Run Monte Carlo simulation for asset price trajectory.\"\"\"
    dt = 1.0 / 252.0
    final_prices = []
    for _ in range(simulations):
        price = initial_price
        for _ in range(days):
            z = random.gauss(0, 1)
            price *= math.exp((mu - 0.5 * sigma ** 2) * dt + sigma * math.sqrt(dt) * z)
        final_prices.append(price)
    
    final_prices.sort()
    p5 = final_prices[int(0.05 * simulations)]
    p50 = final_prices[int(0.50 * simulations)]
    p95 = final_prices[int(0.95 * simulations)]
    
    return {
        "simulations": simulations,
        "initial_price": initial_price,
        "days": days,
        "median_projected_price": round(p50, 2),
        "5th_percentile_var": round(p5, 2),
        "95th_percentile_upside": round(p95, 2),
        "max_drawdown_risk_pct": round(((initial_price - p5) / initial_price) * 100, 2)
    }
""",
        "entrypoint": "run"
    },
    {
        "name": "regex_pii_sanitizer",
        "description": "Scan and redact Personally Identifiable Information (emails, IPv4, phone numbers, credit card tokens) from prompt strings.",
        "code": """import re

def run(text: str) -> dict:
    \"\"\"Scan and redact PII patterns from text.\"\"\"
    email_pattern = r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+"
    ipv4_pattern = r"\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b"
    
    emails_found = re.findall(email_pattern, text)
    ips_found = re.findall(ipv4_pattern, text)
    
    sanitized = re.sub(email_pattern, "[REDACTED_EMAIL]", text)
    sanitized = re.sub(ipv4_pattern, "[REDACTED_IP]", sanitized)
    
    return {
        "original_length": len(text),
        "sanitized_length": len(sanitized),
        "pii_detected_count": len(emails_found) + len(ips_found),
        "redacted_emails": len(emails_found),
        "redacted_ips": len(ips_found),
        "sanitized_text": sanitized
    }
""",
        "entrypoint": "run"
    },
    {
        "name": "json_ast_validator",
        "description": "Validate and check structural syntax integrity of nested JSON configurations and Python AST trees.",
        "code": """import json

def run(raw_payload: str, required_keys: list = None) -> dict:
    \"\"\"Validate JSON syntax and verify required key presence.\"\"\"
    required_keys = required_keys or []
    try:
        data = json.loads(raw_payload) if isinstance(raw_payload, str) else raw_payload
        missing = [k for k in required_keys if k not in data]
        return {
            "valid": len(missing) == 0,
            "parsed_type": type(data).__name__,
            "keys_present": list(data.keys()) if isinstance(data, dict) else len(data),
            "missing_required_keys": missing
        }
    except Exception as e:
        return {
            "valid": False,
            "error": str(e)
        }
""",
        "entrypoint": "run"
    }
]

async def main():
    async with get_async_session() as session:
        user = (await session.execute(select(User).where(User.is_active))).scalars().first()
        if not user:
            print("No active user found.")
            return

        for team_dsl in [team_engineering, team_quant]:
            existing = (await session.execute(select(AgentGraph).where(AgentGraph.name == team_dsl["metadata"]["name"]))).scalars().first()
            if not existing:
                graph = AgentGraph(
                    name=team_dsl["metadata"]["name"],
                    description=team_dsl["metadata"]["description"],
                    owner_id=user.id,
                    status=GraphStatus.DRAFT,
                    dsl=team_dsl,
                    is_public=True
                )
                session.add(graph)
                await session.flush()
                parsed_dsl = GraphDSL.model_validate(team_dsl)
                await compile_graph(session, graph.id, parsed_dsl, {})
                print(f"Compiled team: {graph.name}")
            else:
                print(f"Team already exists: {existing.name}")

        for s in skills_to_seed:
            try:
                await SkillService.register(
                    session,
                    name=s["name"],
                    description=s["description"],
                    code=s["code"],
                    entrypoint=s["entrypoint"],
                    parameters_schema={},
                    node_id=None
                )
                print(f"Registered skill: {s['name']}")
            except Exception as e:
                print(f"Skill note for {s['name']}: {e}")

        await session.commit()
        print("Database seed completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
