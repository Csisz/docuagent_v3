"""
Agent run log endpoints + retry.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from core.security import get_current_user
import db.run_queries as rq
import db.database as _db

router = APIRouter(prefix="/api/runs", tags=["Runs"])
log = logging.getLogger("docuagent")


@router.get("")
async def list_runs(
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = current_user["tenant_id"]
    rows = await rq.get_runs_for_tenant(tenant_id, limit=limit)
    return {"runs": [dict(r) for r in (rows or [])], "limit": limit, "offset": offset}


@router.get("/failed")
async def list_failed_runs(
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = current_user["tenant_id"]
    rows = await rq.get_failed_runs(tenant_id, limit=limit)
    return {"runs": [dict(r) for r in (rows or [])], "count": len(rows or [])}


@router.post("/{run_id}/retry")
async def retry_run(
    run_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Re-trigger a failed run.
    - doc_ingest: re-enqueue via arq (if Redis available) or BackgroundTasks fallback
    - email_classify: re-classify the email synchronously
    - Other types: mark as re-queued, return info
    """
    tenant_id = current_user["tenant_id"]

    row = await _db.fetchrow(
        "SELECT * FROM agent_runs WHERE id=$1 AND tenant_id=$2",
        run_id, tenant_id,
    )
    if not row:
        raise HTTPException(404, "Run nem található")

    trigger_type = row["trigger_type"]
    trigger_ref  = str(row["trigger_ref"]) if row["trigger_ref"] else None

    if trigger_type == "doc_ingest" and trigger_ref:
        # Try to re-enqueue the document ingest
        doc = await _db.fetchrow("SELECT * FROM documents WHERE id=$1", trigger_ref)
        if not doc:
            raise HTTPException(404, "Dokumentum nem található — nem lehet újra feldolgozni")

        from core.config import UPLOAD_DIR
        import glob as _glob
        matches = list(_glob.glob(str(UPLOAD_DIR / f"*_{doc['filename']}")))
        if not matches:
            raise HTTPException(422, f"Fájl nem található a szerveren: {doc['filename']}")

        file_path = matches[0]

        # Create a new run record
        new_run_id = await rq.create_run(
            tenant_id=tenant_id,
            trigger_type="doc_ingest",
            trigger_ref=trigger_ref,
            input_summary=f"RETRY: {doc['filename']}",
        )

        # Try arq first, fall back to BackgroundTasks
        try:
            import os
            redis_url = os.getenv("REDIS_URL", "")
            if redis_url:
                from arq import create_pool
                from arq.connections import RedisSettings
                url = redis_url.replace("redis://", "")
                host_port = url.split("/")[0].split(":")
                rs = RedisSettings(host=host_port[0], port=int(host_port[1]) if len(host_port) > 1 else 6379)
                pool = await create_pool(rs)
                await pool.enqueue_job(
                    "process_document",
                    trigger_ref, tenant_id, file_path,
                    doc["filename"], doc.get("tag", "general"),
                    doc.get("department", "General"),
                    doc.get("access_level", "employee"),
                    doc.get("uploader_email", ""),
                    new_run_id,
                )
                await pool.aclose()
                return {"status": "queued", "run_id": new_run_id, "method": "arq"}
        except Exception as e:
            log.warning(f"arq retry failed, falling back: {e}")

        # Synchronous fallback
        from workers.tasks import process_document
        import asyncio
        asyncio.create_task(
            process_document(
                None, trigger_ref, tenant_id, file_path,
                doc["filename"], doc.get("tag", "general"),
                doc.get("department", "General"),
                doc.get("access_level", "employee"),
                doc.get("uploader_email", ""),
                new_run_id,
            )
        )
        return {"status": "queued", "run_id": new_run_id, "method": "background"}

    elif trigger_type == "email_classify" and trigger_ref:
        # Re-classify the email
        email = await _db.fetchrow("SELECT * FROM emails WHERE id=$1", trigger_ref)
        if not email:
            raise HTTPException(404, "Email nem található")

        from routers.classify import classify_email
        from models.schemas import ClassifyRequest
        from starlette.requests import Request as StarletteRequest
        clf_req = ClassifyRequest(
            email_id=str(email["id"]),
            subject=email["subject"] or "",
            body=email["body"] or "",
            sender=email.get("sender") or "",
            tenant_id=tenant_id,
        )
        # Build a minimal Request so classify_email's @limiter.limit decorator is satisfied
        fake_scope = {
            "type": "http", "method": "POST", "path": "/internal/retry",
            "headers": [], "query_string": b"", "client": ("127.0.0.1", 0),
        }
        result = await classify_email(clf_req, request=StarletteRequest(fake_scope))
        return {"status": "retried", "result": result.model_dump(), "method": "sync"}

    else:
        # Just log and return info
        return {"status": "skipped", "reason": f"Retry not implemented for trigger_type={trigger_type}"}
