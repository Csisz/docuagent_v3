"""
Knowledge Layer — RAG retrieval + feedback context.

Runs concurrently with intake.py entity extraction.
"""
import logging
from dataclasses import dataclass, field
from typing import Optional
from services import qdrant_service, learning_service

log = logging.getLogger("docuagent")


@dataclass
class KnowledgeContext:
    results: list = field(default_factory=list)       # Qdrant search results
    top_score: float = 0.0
    sources: list = field(default_factory=list)        # [{filename, score, collection}]
    context_text: str = ""                             # formatted for LLM prompt
    feedback_ctx: str = ""                             # feedback examples string
    forced_override: Optional[str] = None             # learned override status if any
    forced_sim: float = 0.0


async def retrieve(
    subject: str,
    body: str,
    policy: dict,
    tenant_id: Optional[str] = None,
) -> KnowledgeContext:
    """
    1. RAG search in Qdrant (tenant-scoped)
    2. Feedback context from learning_service (tenant-scoped)
    Returns KnowledgeContext with everything the drafting layer needs.
    """
    query = f"{subject}\n\n{(body or '')[:1000]}"

    # ── RAG search ────────────────────────────────────────────
    try:
        results = await qdrant_service.search_multi(
            query, limit_per=3, tenant_id=tenant_id
        )
    except Exception as e:
        log.warning(f"Knowledge RAG error: {e}")
        results = []

    top_score = results[0]["score"] if results else 0.0
    sources = [
        {"filename": r["filename"], "score": r["score"], "collection": r["collection"]}
        for r in results
    ]

    context_text = ""
    if results:
        parts = [
            f"[Forrás: {r['filename']} | relevancia: {r['score']:.0%}]\n{r['text']}"
            for r in results[:4]
        ]
        context_text = "\n\n---\n\n".join(parts)

    # ── Feedback context ──────────────────────────────────────
    feedback_ctx = ""
    forced_override = None
    forced_sim = 0.0

    if policy.get("learning_enabled", True):
        try:
            feedback_ctx, forced_override, forced_sim = await learning_service.get_feedback_context(
                subject, body or "", tenant_id=tenant_id
            )
        except Exception as e:
            log.warning(f"Knowledge feedback context error: {e}")

    return KnowledgeContext(
        results=results,
        top_score=top_score,
        sources=sources,
        context_text=context_text,
        feedback_ctx=feedback_ctx,
        forced_override=forced_override,
        forced_sim=forced_sim,
    )
