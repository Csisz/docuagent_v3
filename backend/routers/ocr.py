"""
OCR pipeline endpointok.

  POST /api/emails/{id}/ocr    — email OCR indítása (BackgroundTasks)
  GET  /api/ocr/jobs            — OCR job lista (tenant)
  POST /api/ocr/batch           — batch OCR triggerelés (több email)
  GET  /api/ocr/jobs/{job_id}   — egy job részletei + extracted JSON
"""
import json
import logging
import uuid
from typing import Optional, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

import db.database as _db
import db.queries as q
from core.security import get_current_user

log = logging.getLogger("docuagent")
router = APIRouter(prefix="/api", tags=["OCR"])


# ── Serializer ────────────────────────────────────────────────

def _ser_job(row: dict) -> dict:
    d = dict(row)
    d["id"]        = str(d["id"])
    d["tenant_id"] = str(d["tenant_id"])
    if d.get("email_id"):
        d["email_id"] = str(d["email_id"])
    if d.get("extracted_json") and isinstance(d["extracted_json"], str):
        try:
            d["extracted_json"] = json.loads(d["extracted_json"])
        except Exception:
            pass
    for k in ("created_at", "finished_at"):
        if d.get(k) is not None:
            d[k] = d[k].isoformat()
    return d


# ── POST /api/emails/{id}/ocr ─────────────────────────────────

@router.post("/emails/{email_id}/ocr", status_code=202)
async def trigger_email_ocr(
    email_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    OCR job indítása az email szövegéhez.
    Azonnal 202-t ad vissza, a feldolgozás BackgroundTasks-ban fut.
    """
    tenant_id = current_user["tenant_id"]

    email = await q.get_email_by_id(email_id)
    if not email:
        raise HTTPException(404, "Email nem található")

    # Idempotens: ha már fut/kész egy job erre az emailre, visszaadjuk azt
    existing = await _db.fetchrow(
        """SELECT id, status FROM ocr_jobs
           WHERE email_id=$1 AND tenant_id=$2 AND status IN ('pending','running','done')
           ORDER BY created_at DESC LIMIT 1""",
        uuid.UUID(email_id), uuid.UUID(tenant_id),
    )
    if existing and existing["status"] in ("pending", "running"):
        return {"job_id": str(existing["id"]), "status": existing["status"], "reused": True}
    if existing and existing["status"] == "done":
        return {"job_id": str(existing["id"]), "status": "done", "reused": True}

    # Új job
    job_id = str(uuid.uuid4())
    text = f"{email.get('subject','')}\n\n{email.get('body','')}"
    summary = (email.get("subject") or "")[:120]

    await _db.execute(
        """INSERT INTO ocr_jobs (id, tenant_id, email_id, status, input_summary, model)
           VALUES ($1, $2, $3, 'pending', $4, 'gpt-4o-mini')""",
        uuid.UUID(job_id), uuid.UUID(tenant_id), uuid.UUID(email_id), summary,
    )

    # Async futtatás
    from services.ocr_service import run_ocr_for_email
    background_tasks.add_task(run_ocr_for_email, job_id, email_id, tenant_id, text)

    log.info(f"[OCR] job queued: job={job_id[:8]} email={email_id[:8]} tenant={tenant_id[:8]}")
    return {"job_id": job_id, "status": "pending", "reused": False}


# ── GET /api/ocr/jobs ─────────────────────────────────────────

@router.get("/ocr/jobs")
async def list_ocr_jobs(
    limit: int = 50,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Tenant OCR job listája, legújabb elöl."""
    tenant_id = current_user["tenant_id"]
    query = """
        SELECT j.*, e.subject AS email_subject, e.sender AS email_sender
        FROM ocr_jobs j
        LEFT JOIN emails e ON e.id = j.email_id
        WHERE j.tenant_id = $1
    """
    args: list = [uuid.UUID(tenant_id)]
    if status:
        query += f" AND j.status = ${len(args)+1}"
        args.append(status)
    query += f" ORDER BY j.created_at DESC LIMIT ${len(args)+1}"
    args.append(limit)

    rows = await _db.fetch(query, *args)
    jobs = [_ser_job(dict(r)) for r in (rows or [])]
    return {"jobs": jobs, "total": len(jobs)}


# ── GET /api/ocr/jobs/{job_id} ────────────────────────────────

@router.get("/ocr/jobs/{job_id}")
async def get_ocr_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Egy OCR job részletei, beleértve a kinyert JSON-t."""
    row = await _db.fetchrow(
        "SELECT * FROM ocr_jobs WHERE id=$1 AND tenant_id=$2",
        uuid.UUID(job_id), uuid.UUID(current_user["tenant_id"]),
    )
    if not row:
        raise HTTPException(404, "OCR job nem található")
    return _ser_job(dict(row))


# ── POST /api/ocr/batch ───────────────────────────────────────

class BatchOCRRequest(BaseModel):
    email_ids: List[str]
    force_rerun: bool = False


@router.post("/ocr/batch", status_code=202)
async def batch_ocr(
    req: BatchOCRRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    Batch OCR indítása több emailre.
    Max 20 email per hívás.
    """
    if len(req.email_ids) > 20:
        raise HTTPException(400, "Max 20 email per batch")

    tenant_id = current_user["tenant_id"]
    queued = []
    skipped = []

    for email_id in req.email_ids:
        try:
            email = await q.get_email_by_id(email_id)
            if not email:
                skipped.append({"email_id": email_id, "reason": "not_found"})
                continue

            if not req.force_rerun:
                existing = await _db.fetchrow(
                    "SELECT id, status FROM ocr_jobs WHERE email_id=$1 AND tenant_id=$2 AND status IN ('pending','running','done') LIMIT 1",
                    uuid.UUID(email_id), uuid.UUID(tenant_id),
                )
                if existing:
                    skipped.append({"email_id": email_id, "reason": "already_exists", "job_id": str(existing["id"])})
                    continue

            job_id = str(uuid.uuid4())
            text   = f"{email.get('subject','')}\n\n{email.get('body','')}"
            summary = (email.get("subject") or "")[:120]

            await _db.execute(
                "INSERT INTO ocr_jobs (id, tenant_id, email_id, status, input_summary, model) VALUES ($1, $2, $3, 'pending', $4, 'gpt-4o-mini')",
                uuid.UUID(job_id), uuid.UUID(tenant_id), uuid.UUID(email_id), summary,
            )
            from services.ocr_service import run_ocr_for_email
            background_tasks.add_task(run_ocr_for_email, job_id, email_id, tenant_id, text)
            queued.append({"job_id": job_id, "email_id": email_id})

        except Exception as e:
            log.warning(f"[OCR batch] email={email_id} error: {e}")
            skipped.append({"email_id": email_id, "reason": str(e)[:100]})

    return {
        "queued":  len(queued),
        "skipped": len(skipped),
        "jobs":    queued,
        "errors":  skipped,
    }
