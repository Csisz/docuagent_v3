"""
GDPR data retention service.

Default retention windows (configurable via env):
  RAG_LOGS_RETENTION_DAYS      = 90
  AI_USAGE_LOG_RETENTION_DAYS  = 365
  CHAT_MESSAGES_RETENTION_DAYS = 180
"""
import logging
import os

log = logging.getLogger("docuagent")

_RAG_DAYS      = int(os.getenv("RAG_LOGS_RETENTION_DAYS",      "90"))
_AI_USAGE_DAYS = int(os.getenv("AI_USAGE_LOG_RETENTION_DAYS",  "365"))
_CHAT_DAYS     = int(os.getenv("CHAT_MESSAGES_RETENTION_DAYS", "180"))


async def run_retention_cleanup() -> dict:
    """Delete rows older than configured retention windows. Returns row counts."""
    import db.database as _db

    rag_deleted = await _db.execute(
        "DELETE FROM rag_logs WHERE created_at < NOW() - ($1 || ' days')::interval",
        str(_RAG_DAYS),
    )
    ai_deleted = await _db.execute(
        "DELETE FROM ai_usage_log WHERE created_at < NOW() - ($1 || ' days')::interval",
        str(_AI_USAGE_DAYS),
    )
    chat_deleted = await _db.execute(
        "DELETE FROM chat_messages WHERE created_at < NOW() - ($1 || ' days')::interval",
        str(_CHAT_DAYS),
    )

    def _count(result) -> int:
        try:
            return int(str(result).split()[-1])
        except Exception:
            return 0

    summary = {
        "rag_logs":      _count(rag_deleted),
        "ai_usage_log":  _count(ai_deleted),
        "chat_messages": _count(chat_deleted),
    }
    log.info(f"[retention] cleanup done: {summary}")
    return summary


async def get_tenant_data_export(tenant_id: str) -> dict:
    """Return all personal data held for a tenant (GDPR Article 20 export)."""
    import db.database as _db

    emails = await _db.fetch(
        "SELECT id, subject, sender, created_at FROM emails WHERE tenant_id=$1 ORDER BY created_at DESC",
        tenant_id,
    )
    documents = await _db.fetch(
        "SELECT id, filename, uploader_email, created_at FROM documents WHERE tenant_id=$1 AND deleted=FALSE ORDER BY created_at DESC",
        tenant_id,
    )
    rag_logs = await _db.fetch(
        "SELECT id, query, created_at FROM rag_logs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1000",
        tenant_id,
    )

    return {
        "tenant_id": tenant_id,
        "emails":    [dict(r) for r in (emails or [])],
        "documents": [dict(r) for r in (documents or [])],
        "rag_logs":  [dict(r) for r in (rag_logs or [])],
    }


async def delete_tenant_data(tenant_id: str) -> dict:
    """Hard-delete all data for a tenant (GDPR Article 17 right to erasure)."""
    import db.database as _db

    await _db.execute("DELETE FROM rag_logs      WHERE tenant_id=$1", tenant_id)
    await _db.execute("DELETE FROM ai_usage_log  WHERE tenant_id=$1", tenant_id)
    await _db.execute("DELETE FROM chat_messages WHERE tenant_id=$1", tenant_id)
    await _db.execute("DELETE FROM emails        WHERE tenant_id=$1", tenant_id)
    await _db.execute("DELETE FROM documents     WHERE tenant_id=$1", tenant_id)
    await _db.execute("DELETE FROM audit_log     WHERE tenant_id=$1", tenant_id)

    log.info(f"[retention] tenant data erased: tenant={tenant_id[:8]}")
    return {"status": "erased", "tenant_id": tenant_id}
