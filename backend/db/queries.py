"""
Minden SQL lekérdezés egy helyen.
A router/service réteg csak ezeket a függvényeket hívja,
soha nem ír nyers SQL-t.
"""
import json
from typing import Optional
from datetime import datetime, timezone
import db.database as db


# ══════════════════════════════════════════════════════════════
# EMAILS
# ══════════════════════════════════════════════════════════════

async def get_email_by_id(email_id: str):
    return await db.fetchrow(
        "SELECT * FROM emails WHERE id=$1", email_id
    )


async def get_email_with_rag(email_id: str):
    """Email részletek a legutóbbi RAG log forrásaival (LATERAL JOIN)."""
    return await db.fetchrow(
        """SELECT
               e.*,
               rl.source_docs,
               rl.confidence AS rag_confidence
           FROM emails e
           LEFT JOIN LATERAL (
               SELECT source_docs, confidence
               FROM rag_logs
               WHERE email_id = e.id
               ORDER BY created_at DESC
               LIMIT 1
           ) rl ON true
           WHERE e.id = $1""",
        email_id
    )


async def get_email_by_message_id(message_id: str):
    return await db.fetchrow(
        "SELECT id FROM emails WHERE message_id=$1", message_id
    )


async def insert_email(email_id, message_id, subject, sender, body,
                       category, urgent, ai_reply, tenant_id=None):
    return await db.execute(
        """INSERT INTO emails
           (id, message_id, subject, sender, body, category,
            status, urgent, ai_response, confidence, tenant_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,'NEW',$7,$8,0.0,$9,NOW())""",
        email_id, message_id, subject, sender, body, category,
        urgent, ai_reply or None, tenant_id
    )


async def update_email_classification(email_id: str, category: str,
                                       status: str, ai_decision: dict,
                                       confidence: float,
                                       urgency_score: int = 0,
                                       sentiment: str = "neutral"):
    return await db.execute(
        """UPDATE emails
           SET category=$1, status=$2, ai_decision=$3, confidence=$4,
               urgency_score=$5, sentiment=$6
           WHERE id=$7""",
        category, status, json.dumps(ai_decision), confidence,
        urgency_score, sentiment, email_id
    )


async def update_email_reply(email_id: str, reply: str):
    return await db.execute(
        "UPDATE emails SET ai_response=$1, status='AI_ANSWERED' WHERE id=$2",
        reply, email_id
    )


async def update_email_status(email_id: str, status: str):
    return await db.execute(
        "UPDATE emails SET status=$1 WHERE id=$2", status, email_id
    )


async def list_emails(status: Optional[str], limit: int, offset: int,
                      tenant_id: Optional[str] = None):
    fields = """id, subject, sender, body, category, status,
                urgent, confidence, ai_response, ai_decision, created_at,
                COALESCE(urgency_score, 0) AS urgency_score,
                COALESCE(sentiment, 'neutral') AS sentiment"""
    if tenant_id and status:
        rows = await db.fetch(
            f"SELECT {fields} FROM emails WHERE tenant_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT $3 OFFSET $4",
            tenant_id, status, limit, offset
        )
        total = await db.fetchrow("SELECT COUNT(*) FROM emails WHERE tenant_id=$1 AND status=$2", tenant_id, status)
    elif tenant_id:
        rows = await db.fetch(
            f"SELECT {fields} FROM emails WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            tenant_id, limit, offset
        )
        total = await db.fetchrow("SELECT COUNT(*) FROM emails WHERE tenant_id=$1", tenant_id)
    elif status:
        rows = await db.fetch(
            f"SELECT {fields} FROM emails WHERE status=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            status, limit, offset
        )
        total = await db.fetchrow("SELECT COUNT(*) FROM emails WHERE status=$1", status)
    else:
        rows = await db.fetch(
            f"SELECT {fields} FROM emails ORDER BY created_at DESC LIMIT $1 OFFSET $2",
            limit, offset
        )
        total = await db.fetchrow("SELECT COUNT(*) FROM emails")
    return rows, (total["count"] if total else 0)


async def delete_email_by_id(email_id: str):
    await db.execute("DELETE FROM feedback WHERE email_id=$1", email_id)
    return await db.execute("DELETE FROM emails WHERE id=$1", email_id)


async def get_approval_queue(tenant_id: Optional[str] = None, limit: int = 50):
    """NEEDS_ATTENTION emailek confidence + legutóbbi RAG forrásokkal."""
    base = """
        SELECT
            e.id, e.subject, e.sender, e.body,
            e.category, e.status,
            e.urgent, e.urgency_score,
            COALESCE(e.confidence, 0)  AS confidence,
            e.ai_response, e.ai_decision,
            COALESCE(e.sentiment, 'neutral') AS sentiment,
            e.created_at,
            rl.source_docs, rl.confidence AS rag_confidence
        FROM emails e
        LEFT JOIN LATERAL (
            SELECT source_docs, confidence
            FROM rag_logs
            WHERE email_id = e.id
            ORDER BY created_at DESC
            LIMIT 1
        ) rl ON true
        WHERE e.status = 'NEEDS_ATTENTION'
    """
    if tenant_id:
        return await db.fetch(
            base + " AND e.tenant_id=$1 ORDER BY e.urgent DESC, e.urgency_score DESC, e.created_at ASC LIMIT $2",
            tenant_id, limit
        )
    return await db.fetch(
        base + " ORDER BY e.urgent DESC, e.urgency_score DESC, e.created_at ASC LIMIT $1",
        limit
    )


async def get_approval_queue_count(tenant_id: Optional[str] = None) -> int:
    if tenant_id:
        row = await db.fetchrow(
            "SELECT COUNT(*) FROM emails WHERE status='NEEDS_ATTENTION' AND tenant_id=$1",
            tenant_id
        )
    else:
        row = await db.fetchrow("SELECT COUNT(*) FROM emails WHERE status='NEEDS_ATTENTION'")
    return int(row["count"]) if row else 0


# ══════════════════════════════════════════════════════════════
# FEEDBACK
# ══════════════════════════════════════════════════════════════

async def insert_feedback(email_id: str, ai_decision: str,
                           user_decision: str, note: str,
                           tenant_id: Optional[str] = None):
    """Feedback mentése. tenant_id opcionális — ha megadva, a feedback közvetlenül is
    tenant-hoz van kötve (a JOIN úgyis elvégzi a scoping-ot lekérdezéskor)."""
    return await db.execute(
        """INSERT INTO feedback(email_id, ai_decision, user_decision, note, tenant_id)
           VALUES($1,$2,$3,$4,$5)""",
        email_id, ai_decision, user_decision, note, tenant_id
    )


async def get_recent_feedback(limit: int = 30, tenant_id: Optional[str] = None):
    """Legutóbbi feedback sorok az emailek adataival együtt, tenant-ra szűrve."""
    if tenant_id:
        return await db.fetch(
            """SELECT e.subject, e.body, e.category, f.user_decision, f.ai_decision
               FROM feedback f JOIN emails e ON e.id = f.email_id
               WHERE e.tenant_id = $2
               ORDER BY f.created_at DESC LIMIT $1""",
            limit, tenant_id,
        )
    return await db.fetch(
        """SELECT e.subject, e.body, e.category, f.user_decision, f.ai_decision
           FROM feedback f JOIN emails e ON e.id = f.email_id
           ORDER BY f.created_at DESC LIMIT $1""",
        limit,
    )


async def get_feedback_for_prompt(limit: int = 10, tenant_id: Optional[str] = None):
    """Rövid lista a prompt kontextushoz, tenant-ra szűrve."""
    if tenant_id:
        return await db.fetch(
            """SELECT f.ai_decision, f.user_decision, e.subject, e.category
               FROM feedback f JOIN emails e ON e.id = f.email_id
               WHERE e.tenant_id = $2
               ORDER BY f.created_at DESC LIMIT $1""",
            limit, tenant_id,
        )
    return await db.fetch(
        """SELECT f.ai_decision, f.user_decision, e.subject, e.category
           FROM feedback f JOIN emails e ON e.id = f.email_id
           ORDER BY f.created_at DESC LIMIT $1""",
        limit,
    )


async def get_feedback_count(tenant_id: Optional[str] = None):
    if tenant_id:
        return await db.fetchrow(
            "SELECT COUNT(*) FROM feedback WHERE tenant_id=$1", tenant_id
        )
    return await db.fetchrow("SELECT COUNT(*) FROM feedback")


# ══════════════════════════════════════════════════════════════
# DOCUMENTS
# ══════════════════════════════════════════════════════════════

async def insert_document(doc_id: str, filename: str, uploader: str,
                           uploader_email: str, tag: str, department: str,
                           access_level: str, size_kb: int, lang: str,
                           qdrant_ok: bool, tenant_id: Optional[str] = None):
    return await db.execute(
        """INSERT INTO documents
           (id, tenant_id, filename, uploader, uploader_email, tag, department,
            access_level, size_kb, lang, qdrant_ok)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
        doc_id, tenant_id, filename, uploader, uploader_email, tag, department,
        access_level, size_kb, lang, qdrant_ok
    )


async def get_document_by_id(doc_id: str):
    return await db.fetchrow("SELECT * FROM documents WHERE id=$1", doc_id)


async def soft_delete_document(doc_id: str):
    return await db.execute(
        "UPDATE documents SET deleted_at=NOW() WHERE id=$1", doc_id
    )


async def update_document_qdrant_status(doc_id: str, qdrant_ok: bool,
                                         collection: str, lang: str):
    """Background ingest tasz után frissíti a dokumentum Qdrant státuszát és nyelvét."""
    return await db.execute(
        """UPDATE documents
           SET qdrant_ok=$2, qdrant_collection=$3, lang=$4
           WHERE id=$1""",
        doc_id, qdrant_ok, collection, lang,
    )


async def get_document_by_filename(filename: str, tenant_id: str = None):
    if tenant_id:
        return await db.fetchrow(
            "SELECT * FROM documents WHERE filename=$1 AND tenant_id=$2 AND deleted_at IS NULL",
            filename, tenant_id
        )
    return await db.fetchrow(
        "SELECT * FROM documents WHERE filename=$1 AND deleted_at IS NULL ORDER BY created_at DESC",
        filename
    )


async def list_documents(limit: int = 10, tenant_id: str = None):
    if tenant_id:
        return await db.fetch(
            """SELECT id, filename, uploader, size_kb, lang, created_at, tag, qdrant_collection
               FROM documents
               WHERE deleted_at IS NULL AND tenant_id=$1
               ORDER BY created_at DESC LIMIT $2""",
            tenant_id, limit
        )
    return await db.fetch(
        """SELECT id, filename, uploader, size_kb, lang, created_at, tag, qdrant_collection
           FROM documents WHERE deleted_at IS NULL
           ORDER BY created_at DESC LIMIT $1""",
        limit
    )


# ══════════════════════════════════════════════════════════════
# DASHBOARD / STATS
# ══════════════════════════════════════════════════════════════

async def get_status_stats(days: int, tenant_id: Optional[str] = None):
    if tenant_id:
        return await db.fetch(
            f"""SELECT status, COUNT(*) AS cnt,
                       COUNT(*) FILTER(WHERE urgent) AS urg,
                       AVG(confidence) AS avg_conf
                FROM emails
                WHERE tenant_id=$1 AND created_at > NOW() - INTERVAL '{days} days'
                GROUP BY status""",
            tenant_id
        )
    return await db.fetch(
        f"""SELECT status, COUNT(*) AS cnt,
                   COUNT(*) FILTER(WHERE urgent) AS urg,
                   AVG(confidence) AS avg_conf
            FROM emails WHERE created_at > NOW() - INTERVAL '{days} days'
            GROUP BY status"""
    )


async def get_avg_confidence(days: int, tenant_id: Optional[str] = None):
    if tenant_id:
        return await db.fetchrow(
            f"SELECT AVG(confidence)*100 AS v FROM emails WHERE tenant_id=$1 AND created_at > NOW() - INTERVAL '{days} days'",
            tenant_id
        )
    return await db.fetchrow(
        f"SELECT AVG(confidence)*100 AS v FROM emails WHERE created_at > NOW() - INTERVAL '{days} days'"
    )


async def get_timeline(days: int = 7, tenant_id: Optional[str] = None):
    if tenant_id:
        return await db.fetch(
            f"""SELECT DATE(created_at)::text AS day, COUNT(*) AS cnt,
                       COUNT(*) FILTER(WHERE status='NEEDS_ATTENTION') AS needs
                FROM emails
                WHERE tenant_id=$1 AND created_at > NOW() - INTERVAL '{days} days'
                GROUP BY day ORDER BY day""",
            tenant_id
        )
    return await db.fetch(
        f"""SELECT DATE(created_at)::text AS day, COUNT(*) AS cnt,
                   COUNT(*) FILTER(WHERE status='NEEDS_ATTENTION') AS needs
            FROM emails WHERE created_at > NOW() - INTERVAL '{days} days'
            GROUP BY day ORDER BY day"""
    )


async def get_category_breakdown(days: int, tenant_id: Optional[str] = None):
    if tenant_id:
        return await db.fetch(
            f"""SELECT COALESCE(category,'other') AS cat, COUNT(*) AS cnt
                FROM emails
                WHERE tenant_id=$1 AND created_at > NOW() - INTERVAL '{days} days'
                GROUP BY cat""",
            tenant_id
        )
    return await db.fetch(
        f"""SELECT COALESCE(category,'other') AS cat, COUNT(*) AS cnt
            FROM emails WHERE created_at > NOW() - INTERVAL '{days} days'
            GROUP BY cat"""
    )


async def get_recent_activity(limit: int = 8, tenant_id: Optional[str] = None):
    if tenant_id:
        return await db.fetch(
            "SELECT subject, sender, status, confidence, created_at FROM emails WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2",
            tenant_id, limit
        )
    return await db.fetch(
        "SELECT subject, sender, status, confidence, created_at FROM emails ORDER BY created_at DESC LIMIT $1",
        limit
    )


async def get_insights_stats():
    """AI insights oldalhoz - státusz + kategória bontás."""
    stats = await db.fetch(
        "SELECT status, COUNT(*) AS c, AVG(confidence) AS ac FROM emails WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY status"
    )
    cats = await db.fetch(
        "SELECT COALESCE(category,'other') AS cat, COUNT(*) AS c FROM emails WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY cat ORDER BY c DESC"
    )
    return stats, cats


# ══════════════════════════════════════════════════════════════
# RAG LOGS  (v3.3)
# ══════════════════════════════════════════════════════════════

async def insert_rag_log(email_id: Optional[str], query: str, answer: Optional[str],
                          fallback_used: bool, confidence: float,
                          source_docs: list, collection: str,
                          lang: str, latency_ms: int):
    import json as _json
    return await db.execute(
        """INSERT INTO rag_logs
           (email_id, query, answer, fallback_used, confidence,
            sources_count, source_docs, collection, lang, latency_ms)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
        email_id, query, answer, fallback_used, confidence,
        len(source_docs), _json.dumps(source_docs), collection, lang, latency_ms
    )


async def get_rag_stats(days: int = 7):
    return await db.fetch(
        f"""SELECT DATE(created_at) AS day, COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE fallback_used) AS fallbacks,
                   ROUND(AVG(confidence)::numeric, 2) AS avg_conf,
                   ROUND(AVG(latency_ms)::numeric) AS avg_ms
            FROM rag_logs
            WHERE created_at > NOW() - INTERVAL '{days} days'
            GROUP BY day ORDER BY day DESC"""
    )


# ══════════════════════════════════════════════════════════════
# CONFIG  (kulcs-érték tároló — SLA és egyéb beállításokhoz)
# ══════════════════════════════════════════════════════════════

async def get_config(key: str, default: Optional[str] = None) -> Optional[str]:
    """Visszaad egy config értéket kulcs alapján. Ha nincs, default-ot ad."""
    row = await db.fetchrow(
        "SELECT value FROM config WHERE key=$1", key
    )
    if row:
        return row["value"]
    return default


async def set_config(key: str, value: str) -> None:
    """Beállít vagy frissít egy config értéket (upsert)."""
    await db.execute(
        """INSERT INTO config (key, value)
           VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()""",
        key, value
    )


# ══════════════════════════════════════════════════════════════
# SLA  (válaszidő tracking)
# ══════════════════════════════════════════════════════════════

async def get_sla_summary(warning_hours: float, breach_hours: float):
    """Összesítő: hány email ok/warning/breach státuszban van."""
    return await db.fetchrow(
        """SELECT
             COUNT(*) FILTER (
               WHERE status NOT IN ('CLOSED','AI_ANSWERED')
               AND EXTRACT(EPOCH FROM (NOW() - created_at))/3600 < $1
             ) AS ok_count,
             COUNT(*) FILTER (
               WHERE status NOT IN ('CLOSED','AI_ANSWERED')
               AND EXTRACT(EPOCH FROM (NOW() - created_at))/3600 >= $1
               AND EXTRACT(EPOCH FROM (NOW() - created_at))/3600 < $2
             ) AS warning_count,
             COUNT(*) FILTER (
               WHERE status NOT IN ('CLOSED','AI_ANSWERED')
               AND EXTRACT(EPOCH FROM (NOW() - created_at))/3600 >= $2
             ) AS breach_count
           FROM emails""",
        warning_hours, breach_hours
    )


async def get_sla_emails(warning_hours: float, breach_hours: float):
    """Nyitott emailek SLA adatokkal (age_hours számítva)."""
    return await db.fetch(
        """SELECT id, subject, sender, status, urgent, created_at,
                  EXTRACT(EPOCH FROM (NOW() - created_at))/3600 AS age_hours
           FROM emails
           WHERE status NOT IN ('CLOSED', 'AI_ANSWERED')
           ORDER BY created_at ASC""",
    )


# ══════════════════════════════════════════════════════════════
# CHAT SESSIONS
# ══════════════════════════════════════════════════════════════

async def create_chat_session(tenant_id: str, user_id: str, title: str = None):
    return await db.fetchrow(
        """INSERT INTO chat_sessions (tenant_id, user_id, title)
           VALUES ($1, $2, $3) RETURNING *""",
        tenant_id, user_id, title
    )


async def get_chat_session(session_id: str):
    return await db.fetchrow(
        "SELECT * FROM chat_sessions WHERE id=$1", session_id
    )


async def list_chat_sessions(tenant_id: str, user_id: str, limit: int = 20):
    return await db.fetch(
        """SELECT cs.*, COUNT(cm.id) AS message_count
           FROM chat_sessions cs
           LEFT JOIN chat_messages cm ON cm.session_id = cs.id
           WHERE cs.tenant_id=$1 AND cs.user_id=$2
           GROUP BY cs.id
           ORDER BY cs.updated_at DESC LIMIT $3""",
        tenant_id, user_id, limit
    )


async def insert_chat_message(session_id: str, role: str, content: str,
                               sources: list = None, confidence: float = None):
    import json as _json
    return await db.fetchrow(
        """INSERT INTO chat_messages (session_id, role, content, sources, confidence)
           VALUES ($1, $2, $3, $4, $5) RETURNING *""",
        session_id, role, content,
        _json.dumps(sources or []), confidence
    )


async def get_chat_history(session_id: str, limit: int = 10):
    """Utolsó N üzenet a session-ből, DESC sorrendben (legújabb először)."""
    return await db.fetch(
        """SELECT role, content FROM chat_messages
           WHERE session_id=$1
           ORDER BY created_at DESC LIMIT $2""",
        session_id, limit
    )


async def update_session_title(session_id: str, title: str):
    await db.execute(
        "UPDATE chat_sessions SET title=$1, updated_at=NOW() WHERE id=$2",
        title, session_id
    )


async def delete_chat_session(session_id: str):
    await db.execute("DELETE FROM chat_sessions WHERE id=$1", session_id)


# ══════════════════════════════════════════════════════════════
# CALENDAR EVENTS
# ══════════════════════════════════════════════════════════════

async def get_calendar_events(tenant_id: str, from_dt=None, to_dt=None):
    if from_dt and to_dt:
        return await db.fetch(
            """SELECT * FROM calendar_events
               WHERE tenant_id=$1 AND start_time >= $2 AND start_time <= $3
               ORDER BY start_time ASC""",
            tenant_id, from_dt, to_dt
        )
    return await db.fetch(
        "SELECT * FROM calendar_events WHERE tenant_id=$1 ORDER BY start_time ASC",
        tenant_id
    )


async def insert_calendar_event(tenant_id: str, data: dict):
    import json as _json
    return await db.fetchrow(
        """INSERT INTO calendar_events
           (tenant_id, title, description, start_time, end_time,
            attendees, status, source, email_id, google_event_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *""",
        tenant_id,
        data["title"],
        data.get("description"),
        data["start_time"],
        data["end_time"],
        _json.dumps(data.get("attendees", [])),
        data.get("status", "confirmed"),
        data.get("source", "manual"),
        data.get("email_id"),
        data.get("google_event_id"),
    )


async def get_calendar_event_by_id(event_id: str):
    return await db.fetchrow(
        "SELECT * FROM calendar_events WHERE id=$1", event_id
    )


async def delete_calendar_event(event_id: str):
    await db.execute("DELETE FROM calendar_events WHERE id=$1", event_id)


async def upsert_calendar_event(tenant_id: str, event: dict) -> dict:
    """
    Google Calendar szinkron: INSERT or UPDATE google_event_id alapján.
    UNIQUE constraint on google_event_id required for ON CONFLICT to work.
    Returns row dict with 'inserted' bool key.
    """
    import json as _json
    import logging
    _log = logging.getLogger("docuagent")

    google_event_id = event.get("google_event_id")
    if not google_event_id:
        raise ValueError("upsert_calendar_event requires a non-empty google_event_id")

    row = await db.fetchrow(
        """INSERT INTO calendar_events
           (tenant_id, google_event_id, title, description,
            start_time, end_time, attendees, status, source, last_synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'google',NOW())
           ON CONFLICT ON CONSTRAINT unique_google_event_id DO UPDATE SET
             title          = EXCLUDED.title,
             description    = EXCLUDED.description,
             start_time     = EXCLUDED.start_time,
             end_time       = EXCLUDED.end_time,
             attendees      = EXCLUDED.attendees,
             status         = EXCLUDED.status,
             last_synced_at = NOW()
           RETURNING *, (xmax = 0) AS inserted""",
        tenant_id,
        google_event_id,
        event["title"],
        event.get("description", ""),
        event["start_time"],
        event["end_time"],
        _json.dumps(event.get("attendees", [])),
        event.get("status", "confirmed"),
    )

    action = "inserted" if row and row["inserted"] else "updated"
    _log.info(f"Calendar upsert {action}: google_event_id={google_event_id} title={event['title']!r}")
    return row


async def link_google_event(event_id: str, google_event_id: str) -> dict:
    """n8n visszahívás után: google_event_id és last_synced_at beállítása."""
    return await db.fetchrow(
        """UPDATE calendar_events
           SET google_event_id = $2,
               last_synced_at  = NOW()
           WHERE id = $1
           RETURNING *""",
        event_id, google_event_id,
    )


# ══════════════════════════════════════════════════════════════
# ONBOARDING
# ══════════════════════════════════════════════════════════════

async def get_onboarding_state(tenant_id: str):
    return await db.fetchrow(
        "SELECT * FROM onboarding_state WHERE tenant_id=$1", tenant_id
    )


async def upsert_onboarding_state(tenant_id: str, current_step: int,
                                   completed_steps: list, metadata: dict) -> dict:
    import json as _json
    return await db.fetchrow(
        """INSERT INTO onboarding_state (tenant_id, current_step, completed_steps, metadata)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id) DO UPDATE SET
             current_step    = EXCLUDED.current_step,
             completed_steps = EXCLUDED.completed_steps,
             metadata        = EXCLUDED.metadata
           RETURNING *""",
        tenant_id, current_step, completed_steps, _json.dumps(metadata)
    )


async def complete_onboarding(tenant_id: str) -> dict:
    return await db.fetchrow(
        """UPDATE onboarding_state
           SET completed_at = NOW()
           WHERE tenant_id = $1
           RETURNING *""",
        tenant_id
    )


# ══════════════════════════════════════════════════════════════
# POLICY OVERRIDES
# ══════════════════════════════════════════════════════════════

async def get_policy_overrides(tenant_id: str) -> list:
    """Return all policy overrides for a tenant."""
    return await db.fetch(
        "SELECT rule_key, rule_value, updated_at FROM policy_overrides WHERE tenant_id=$1 ORDER BY rule_key",
        tenant_id,
    )


async def set_policy_override(tenant_id: str, rule_key: str, rule_value: str) -> None:
    """Upsert a single policy override for a tenant."""
    await db.execute(
        """INSERT INTO policy_overrides (tenant_id, rule_key, rule_value)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, rule_key) DO UPDATE
             SET rule_value = EXCLUDED.rule_value,
                 updated_at = NOW()""",
        tenant_id, rule_key, rule_value,
    )
