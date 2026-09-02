"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import auth, chat, graphs, health, memory, personas, sessions, skills

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(graphs.router)
api_router.include_router(personas.router)
api_router.include_router(sessions.router)
api_router.include_router(chat.router)
api_router.include_router(skills.router)
api_router.include_router(skills.postmortem_router)
api_router.include_router(memory.router)

__all__ = ["api_router", "health"]
