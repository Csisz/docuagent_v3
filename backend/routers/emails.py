"""
Email kezelés: lista, státusz frissítés, törlés, ingest.
"""
import os
import uuid
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Security
from typing import Optional
from pydantic import BaseModel

import db.queries as q
import db.audit_queries as alog
from models.schemas import StatusUpdateRequest, FeedbackRequest, EmailStatus
from core.config import OPENAI_API_KEY, N8N_LABEL_WEBHOOK
from core.security import require_api_key, get_current_user_optional, get_current_user

router = APIRouter(prefix="/api", tags=["Emails"])
log    = logging.getLogger("docuagent")


@router.get("/emails")
async def list_emails(
    status: Optional[str] = None,
    limit:  int = 50,
    offset: int = 0,
    current_user: Optional[dict] = Depends(get_current_user_optional),
    _auth=Security(require_api_key)
):
    tenant_id = current_user.get("tenant_id") if current_user else None
    rows, total = await q.list_emails(status, limit, offset, tenant_id=tenant_id)
    return {
        "emails": [
            {
                "id":          str(r["id"]),
                "subject":     r["subject"] or "",
                "sender":      r["sender"] or "",
                "body":        r["body"] or "",
                "category":    r["category"] or "other",
                "status":      r["status"],
                "urgent":      r["urgent"],
                "confidence":  round(float(r["confidence"] or 0), 2),
                "ai_response": r["ai_response"],
                "ai_decision": r["ai_decision"],
                "urgency_score": int(r["urgency_score"] or 0),
                "sentiment":   r["sentiment"] or "neutral",
                "created_at":  r["created_at"].isoformat() if r["created_at"] else "",
            }
            for r in (rows or [])
        ],
        "total":  total,
        "limit":  limit,
        "offset": offset,
    }


# ── Approval Inbox endpointok ─────────────────────────────────

def _serialize_approval(row) -> dict:
    import json as _json
    d = {
        "id":            str(row["id"]),
        "subject":       row["subject"] or "",
        "sender":        row["sender"] or "",
        "body":          row["body"] or "",
        "category":      row["category"] or "other",
        "status":        row["status"],
        "urgent":        row["urgent"],
        "urgency_score": int(row["urgency_score"] or 0),
        "confidence":    round(float(row["confidence"] or 0), 2),
        "ai_response":   row["ai_response"],
        "ai_decision":   row["ai_decision"],
        "sentiment":     row["sentiment"] or "neutral",
        "created_at":    row["created_at"].isoformat() if row["created_at"] else "",
        "rag_sources":   [],
        "rag_confidence": None,
    }
    # RAG forrás docs
    src = row.get("source_docs")
    if src:
        try:
            parsed = _json.loads(src) if isinstance(src, str) else src
            d["rag_sources"] = parsed if isinstance(parsed, list) else []
        except Exception:
            pass
    if row.get("rag_confidence") is not None:
        d["rag_confidence"] = round(float(row["rag_confidence"]), 2)
    return d


@router.get("/emails/approval-queue")
async def approval_queue(
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """NEEDS_ATTENTION emailek confidence + RAG forrásokkal. Sürgőség szerint rendezve."""
    tenant_id = current_user.get("tenant_id")
    rows = await q.get_approval_queue(tenant_id, limit)
    count = await q.get_approval_queue_count(tenant_id)
    return {
        "emails": [_serialize_approval(r) for r in (rows or [])],
        "total":  count,
    }


@router.get("/emails/{email_id}")
async def get_email(
    email_id: str,
    current_user: Optional[dict] = Depends(get_current_user_optional),
    _auth=Security(require_api_key)
):
    """Email részletek + legutóbbi RAG forrásai."""
    import json as _json
    row = await q.get_email_with_rag(email_id)
    if not row:
        raise HTTPException(404, "Email nem található")

    src = row["source_docs"]
    if isinstance(src, str):
        try:
            src = _json.loads(src)
        except Exception:
            src = []
    elif src is None:
        src = []

    return {
        "id":            str(row["id"]),
        "subject":       row["subject"] or "",
        "sender":        row["sender"] or "",
        "body":          row["body"] or "",
        "category":      row["category"] or "other",
        "status":        row["status"],
        "urgent":        row["urgent"],
        "confidence":    round(float(row["confidence"] or 0), 2),
        "ai_response":   row["ai_response"],
        "ai_decision":   row["ai_decision"],
        "urgency_score": int(row["urgency_score"] or 0),
        "sentiment":     row["sentiment"] or "neutral",
        "created_at":    row["created_at"].isoformat() if row["created_at"] else "",
        "source_docs":   src,
        "rag_confidence": round(float(row["rag_confidence"] or 0), 2) if row["rag_confidence"] else None,
    }


@router.patch("/emails/{email_id}/status")
async def update_status(
    email_id: str,
    req: StatusUpdateRequest,
    _auth=Security(require_api_key)
):
    import json
    row = await q.get_email_by_id(email_id)
    if not row:
        raise HTTPException(404, "Not found")

    old = row["status"]
    ai  = (json.dumps(row["ai_decision"])
           if isinstance(row["ai_decision"], dict)
           else (row["ai_decision"] or old))

    await q.update_email_status(email_id, req.status.value)

    if old != req.status.value:
        await q.insert_feedback(email_id, ai, req.status.value, req.note or "")
        log.info(f"Status update + feedback: {email_id} {old} → {req.status.value}")

        if N8N_LABEL_WEBHOOK and row["message_id"]:
            try:
                async with httpx.AsyncClient(timeout=5) as c:
                    await c.post(N8N_LABEL_WEBHOOK, json={
                        "email_id":         email_id,
                        "gmail_message_id": row["message_id"],
                        "old_status":       old,
                        "new_status":       req.status.value,
                    })
                log.info(f"n8n label webhook: {row['message_id']} → {req.status.value}")
            except Exception as e:
                log.warning(f"n8n label webhook failed: {e}")

    return {
        "status":          "ok",
        "email_id":        email_id,
        "new_status":      req.status.value,
        "learning_stored": old != req.status.value,
    }


@router.delete("/emails/{email_id}")
async def delete_email(email_id: str, _auth=Security(require_api_key)):
    row = await q.get_email_by_id(email_id)
    if not row:
        raise HTTPException(404, "Not found")
    await q.delete_email_by_id(email_id)
    log.info(f"Deleted email: {email_id}")
    return {"status": "ok", "deleted": email_id}


@router.delete("/emails")
async def delete_emails_bulk(ids: list[str], _auth=Security(require_api_key)):
    deleted = 0
    for email_id in ids:
        result = await q.delete_email_by_id(email_id)
        if result:
            deleted += 1
    log.info(f"Bulk deleted {deleted} emails")
    return {"status": "ok", "deleted": deleted}


@router.post("/feedback")
async def store_feedback(req: FeedbackRequest):
    await q.update_email_status(req.email_id, req.new_status.value)
    await q.insert_feedback(
        req.email_id, req.original_ai_decision,
        req.new_status.value, req.note or ""
    )
    log.info(f"Feedback: {req.email_id} {req.original_ai_decision} → {req.new_status.value}")
    return {"status": "ok", "email_id": req.email_id, "new_status": req.new_status.value}


@router.post("/email-log")
async def ingest_email(request: Request):
    from routers.classify import classify_email, generate_reply
    from models.schemas import ClassifyRequest, ReplyRequest

    data       = await request.json()
    email_id   = str(uuid.uuid4())
    message_id = data.get("message_id") or data.get("id") or email_id
    subject    = data.get("subject", "")
    sender     = data.get("from", data.get("sender", ""))
    body       = data.get("body", data.get("text", ""))

    # Tenant meghatározása — prioritás sorrendben:
    # 1. Ha az n8n küldi explicit (jövőbeli multi-tenant)
    # 2. Default: az egyetlen aktív tenant
    tenant_id = data.get("tenant_id") or "00000000-0000-0000-0000-000000000001"

    
    category   = data.get("category", "other")
    urgent     = bool(data.get("urgent", False))
    ai_reply   = data.get("ai_reply", "")

    existing = await q.get_email_by_message_id(message_id)
    if existing:
        log.info(f"Duplicate skipped: {message_id}")
        return {"status": "duplicate", "id": str(existing["id"])}

    try:
        await q.insert_email(email_id, message_id, subject, sender,
                     body, category, urgent, ai_reply or None, tenant_id)
    except Exception as e:
        log.error(f"Insert error: {e}")
        return {"status": "error", "detail": str(e)}

    status = "NEW"; confidence = 0.0; learned = False

    if OPENAI_API_KEY:
        try:
            clf = await classify_email(ClassifyRequest(
                email_id=email_id, subject=subject, body=body or "", sender=sender
            ))
            confidence = clf.confidence
            status     = clf.status.value
            learned    = clf.learned_override

            if status == "AI_ANSWERED" and not ai_reply:
                try:
                    from models.schemas import EmailCategory
                    reply_resp = await generate_reply(ReplyRequest(
                        email_id=email_id, subject=subject,
                        body=body or "", category=EmailCategory(clf.category.value)
                    ))
                    ai_reply = reply_resp.get("reply", "")
                    log.info(f"Auto-reply generated: {subject[:50]}")
                except Exception as re_err:
                    log.warning(f"Auto-reply failed: {re_err}")
        except Exception as e:
            log.warning(f"Auto-classify failed: {e}")
    elif ai_reply:
        status = "AI_ANSWERED"
        await q.update_email_status(email_id, "AI_ANSWERED")

    log.info(f"Ingested: '{subject[:50]}' status={status} conf={confidence:.2f} learned={learned}")
    return {
        "status":            "ok",
        "id":                email_id,
        "classified_status": status,
        "confidence":        confidence,
        "learned_override":  learned,
    }


class RejectRequest(BaseModel):
    note: Optional[str] = ""


class EditApproveRequest(BaseModel):
    reply: str
    note:  Optional[str] = ""


@router.post("/emails/{email_id}/approve")
async def approve_email(
    email_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Jóváhagyja az AI által javasolt választ és elküldi.
    Az ai_response meglévő szövegét küldi ki.
    """
    row = await q.get_email_by_id(email_id)
    if not row:
        raise HTTPException(404, "Email nem található")
    if row["status"] not in ("NEEDS_ATTENTION", "NEW"):
        raise HTTPException(400, f"Email nem jóváhagyható ebben az állapotban: {row['status']}")

    reply_text = (row["ai_response"] or "").strip()
    if not reply_text:
        raise HTTPException(400, "Nincs AI válasz javaslat — előbb szerkeszd meg")

    is_demo = current_user.get("tenant_slug", "") == "demo"
    if is_demo:
        await q.update_email_status(email_id, "AI_ANSWERED")
        log.info(f"Demo approve (mock): {email_id} by={current_user.get('email')}")
        return {"status": "mock_sent", "demo": True,
                "message": "Demo módban az email nem kerül elküldésre"}

    await q.update_email_reply(email_id, reply_text)
    await q.insert_feedback(
        email_id, row["status"], "AI_ANSWERED",
        f"Jóváhagyva: {current_user.get('email', 'unknown')}"
    )

    n8n_send_webhook = os.getenv("N8N_SEND_REPLY_WEBHOOK", "")
    sent_via = "dashboard_only"

    if n8n_send_webhook and row.get("message_id"):
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                resp = await c.post(n8n_send_webhook, json={
                    "email_id":         email_id,
                    "gmail_message_id": row["message_id"],
                    "reply_text":       reply_text,
                    "approved_by":      current_user.get("email"),
                    "sender":           row["sender"],
                    "subject":          row["subject"],
                })
                if resp.status_code < 300:
                    sent_via = "gmail_via_n8n"
                else:
                    log.warning(f"approve: n8n send webhook failed: {resp.status_code}")
        except Exception as e:
            log.warning(f"approve: n8n send webhook error: {e}")

    log.info(f"Approved email {email_id} via={sent_via} by={current_user.get('email')}")
    await alog.insert_audit_log(
        tenant_id=current_user.get("tenant_id"), user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="approve", entity_type="email",
        entity_id=email_id, details={"subject": row["subject"], "sent_via": sent_via},
    )
    return {"status": "ok", "email_id": email_id, "sent_via": sent_via}  # noqa: RET504


@router.post("/emails/{email_id}/reject")
async def reject_email(
    email_id: str,
    req: RejectRequest,
    current_user: dict = Depends(get_current_user)
):
    """Elutasítja az emailt — CLOSED státuszra állítja, feedback-et ment."""
    row = await q.get_email_by_id(email_id)
    if not row:
        raise HTTPException(404, "Email nem található")

    note = (req.note or "").strip() or f"Elutasítva: {current_user.get('email', 'unknown')}"
    await q.update_email_status(email_id, "CLOSED")
    await q.insert_feedback(email_id, row["status"], "CLOSED", note)

    log.info(f"Rejected email {email_id} by={current_user.get('email')} note={note[:60]!r}")
    await alog.insert_audit_log(
        tenant_id=current_user.get("tenant_id"), user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="reject", entity_type="email",
        entity_id=email_id, details={"subject": row["subject"], "note": note[:200]},
    )
    return {"status": "ok", "email_id": email_id, "new_status": "CLOSED"}


@router.patch("/emails/{email_id}/edit-and-approve")
async def edit_and_approve(
    email_id: str,
    req: EditApproveRequest,
    current_user: dict = Depends(get_current_user)
):
    """Szerkesztett választ küld — felülírja az AI javaslatot, majd elküldi."""
    reply_text = req.reply.strip()
    if not reply_text:
        raise HTTPException(400, "A szerkesztett válasz nem lehet üres")

    row = await q.get_email_by_id(email_id)
    if not row:
        raise HTTPException(404, "Email nem található")

    is_demo = current_user.get("tenant_slug", "") == "demo"
    if is_demo:
        await q.update_email_status(email_id, "AI_ANSWERED")
        log.info(f"Demo edit-approve (mock): {email_id} by={current_user.get('email')}")
        return {"status": "mock_sent", "demo": True,
                "message": "Demo módban az email nem kerül elküldésre"}

    await q.update_email_reply(email_id, reply_text)
    await q.insert_feedback(
        email_id, row["status"], "AI_ANSWERED",
        f"Szerkesztve és jóváhagyva: {current_user.get('email', 'unknown')}"
        + (f" — {req.note}" if req.note else "")
    )

    n8n_send_webhook = os.getenv("N8N_SEND_REPLY_WEBHOOK", "")
    sent_via = "dashboard_only"

    if n8n_send_webhook and row.get("message_id"):
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                resp = await c.post(n8n_send_webhook, json={
                    "email_id":         email_id,
                    "gmail_message_id": row["message_id"],
                    "reply_text":       reply_text,
                    "approved_by":      current_user.get("email"),
                    "sender":           row["sender"],
                    "subject":          row["subject"],
                })
                if resp.status_code < 300:
                    sent_via = "gmail_via_n8n"
                else:
                    log.warning(f"edit-approve: n8n failed: {resp.status_code}")
        except Exception as e:
            log.warning(f"edit-approve: n8n error: {e}")

    log.info(f"Edit-approved email {email_id} via={sent_via} by={current_user.get('email')}")
    await alog.insert_audit_log(
        tenant_id=current_user.get("tenant_id"), user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="edit_approve", entity_type="email",
        entity_id=email_id, details={"subject": row["subject"], "sent_via": sent_via, "note": req.note or ""},
    )
    return {"status": "ok", "email_id": email_id, "sent_via": sent_via}


@router.post("/emails/{email_id}/send-reply")
async def send_reply(
    email_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Agent által jóváhagyott válasz elküldése.
    1. Ha N8N_SEND_REPLY_WEBHOOK be van állítva → n8n-en Gmail reply
    2. Fallback: csak DB frissítés + napló
    """
    data = await request.json()
    reply_text = data.get("reply", "").strip()
    if not reply_text:
        raise HTTPException(400, "Üres válasz nem küldhető")

    row = await q.get_email_by_id(email_id)
    if not row:
        raise HTTPException(404, "Email nem található")

    await q.update_email_reply(email_id, reply_text)
    await q.insert_feedback(
        email_id,
        row["status"],
        "AI_ANSWERED",
        f"Human approved by {current_user.get('email', 'unknown')}"
    )
    await q.update_email_status(email_id, "AI_ANSWERED")

    n8n_send_webhook = os.getenv("N8N_SEND_REPLY_WEBHOOK", "")
    sent_via = "dashboard_only"
    is_demo  = current_user.get("tenant_slug") == "demo"

    if is_demo:
        sent_via = "mock_demo"
        log.info(f"Demo mode: skipping n8n send-reply for email {email_id}")
    elif n8n_send_webhook and row.get("message_id"):
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                resp = await c.post(n8n_send_webhook, json={
                    "email_id":         email_id,
                    "gmail_message_id": row["message_id"],
                    "reply_text":       reply_text,
                    "approved_by":      current_user.get("email"),
                    "sender":           row["sender"],
                    "subject":          row["subject"],
                })
                if resp.status_code < 300:
                    sent_via = "gmail_via_n8n"
                else:
                    log.warning(f"n8n send webhook failed: {resp.status_code}")
        except Exception as e:
            log.warning(f"n8n send webhook error: {e}")

    log.info(f"Reply sent: {email_id} via={sent_via} by={current_user.get('email')}")
    return {
        "status":      "ok",
        "email_id":    email_id,
        "sent_via":    sent_via,
        "approved_by": current_user.get("email"),
    }
