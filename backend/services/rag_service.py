"""
RAG metering wrapper around qdrant_service.search / search_multi.

Every search call:
  1. delegates to qdrant_service
  2. increments usage_records.rag_queries (fire-and-forget)
  3. emits structured JSON log for observability
"""
import asyncio
import json
import logging
import time
from typing import Optional

from services import qdrant_service
from services.metering import increment_usage

log = logging.getLogger("docuagent")


async def search(
    query_text: str,
    collection: str = qdrant_service.DEFAULT_COLLECTION,
    limit: int = 5,
    score_threshold: float = 0.0,
    tenant_id: Optional[str] = None,
) -> list:
    """
    Metered wrapper for qdrant_service.search.
    Returns the same result list as the underlying call.
    """
    t0 = time.monotonic()
    results = await qdrant_service.search(
        query_text=query_text,
        collection=collection,
        limit=limit,
        score_threshold=score_threshold,
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    top_score = float(results[0].score) if results else 0.0

    log.info(json.dumps({
        "event":      "rag_search",
        "tenant_id":  tenant_id,
        "collection": collection,
        "hits":       len(results),
        "top_score":  round(top_score, 4),
        "latency_ms": latency_ms,
    }))

    if tenant_id:
        asyncio.ensure_future(increment_usage(tenant_id, "rag_queries", 1.0))

    return results


async def search_multi(
    query_text: str,
    collections: Optional[list] = None,
    limit: int = 5,
    score_threshold: float = 0.0,
    tenant_id: Optional[str] = None,
) -> list:
    """Metered wrapper for qdrant_service.search_multi."""
    t0 = time.monotonic()
    results = await qdrant_service.search_multi(
        query_text=query_text,
        collections=collections,
        limit=limit,
        score_threshold=score_threshold,
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    top_score = float(results[0].score) if results else 0.0

    log.info(json.dumps({
        "event":       "rag_search_multi",
        "tenant_id":   tenant_id,
        "collections": collections,
        "hits":        len(results),
        "top_score":   round(top_score, 4),
        "latency_ms":  latency_ms,
    }))

    if tenant_id:
        asyncio.ensure_future(increment_usage(tenant_id, "rag_queries", 1.0))

    return results
