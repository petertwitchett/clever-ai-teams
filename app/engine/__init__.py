"""LangGraph execution engine package.

Modules:
- ``state``        typed graph state channels with reducers
- ``checkpointer`` AsyncPostgresSaver durable persistence
- ``nodes``        node callables (planner, dispatch, persona, review, synthesis)
- ``routers``      conditional edge predicates
- ``factory``      compiles a Graph DSL document into a CompiledStateGraph
- ``runner``       drives astream_events(v2) and maps runtime events to SSE frames
"""
