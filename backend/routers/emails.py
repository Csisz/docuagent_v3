"""
Email kezelés: lista, státusz frissítés, törlés, ingest.
"""
import os
import uuid
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Security
from typing import Optional

import db.queries as q
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
