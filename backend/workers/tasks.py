"""
arq worker task definitions.

Tasks are imported by WorkerSettings in main.py.
Each task receives `ctx` (arq context) as first argument.
"""
import logging
import time
from pathlib import Path

log = logging.getLogger("docuagent")


def _heartbeat():
    try:
        Path("/tmp/worker_alive").write_text(str(time.time()))
    except Exception:
        pass


async def process_document(
    ctx,
    doc_id: str,
    tenant_id: str,
    file_path: str,
    filename: str,
    tag: str,
    department: str,
    access_level: str,
    uploader_email: str,
    run_id: str,
):
    """
    arq task: extract text from uploaded file, embed and store in Qdrant.
    Called after upload_doc inserts the DB record with qdrant_ok=False.
    """
    _heartbeat()
    from services import qdrant_service, file_service
    from db import queries as q
    from db import run_queries as rq

    dest = Path(file_path)
    t_start = time.monotonic()
    try:
        text       = file_service.extract_text(dest)
        lang       = file_service.detect_language(text)
        qdrant_ok, collection = await qdrant_service.store_document(
            doc_id, filename, text, tag, department, access_level, uploader_email, tenant_id
        )
        await q.update_document_qdrant_status(doc_id, qdrant_ok, collection, lang)
        if qdrant_ok and tenant_id:
            try:
                from services.metering import increment_usage
                await increment_usage(tenant_id, "documents_stored", 1)
            except Exception:
                pass
        # Clean up uploaded file after successful indexing to prevent disk fill
        if qdrant_ok:
            try:
                dest.unlink(missing_ok=True)
                log.info(f"[arq] cleaned up upload: {dest.name}")
            except Exception as cleanup_err:
                log.warning(f"[arq] file cleanup failed (non-fatal): {cleanup_err}")
        # Note: keep failed files for debugging and retry
        latency_ms = int((time.monotonic() - t_start) * 1000)
        if run_id:
            await rq.finish_run(
                run_id,
                status="success" if qdrant_ok else "failed",
                latency_ms=latency_ms,
                result_summary=f"{'OK' if qdrant_ok else 'FAIL'}: {filename} → {collection}",
            )
        log.info(f"[arq] process_document done: {filename} tenant={tenant_id[:8]} qdrant={qdrant_ok} {latency_ms}ms")
    except Exception as e:
        latency_ms = int((time.monotonic() - t_start) * 1000)
        if run_id:
            from db import run_queries as rq2
            await rq2.finish_run(run_id, "failed", latency_ms=latency_ms, error_message=str(e))
        log.error(f"[arq] process_document failed for {filename}: {e}")
        raise  # arq will retry


async def reindex_tenant_documents(ctx, tenant_id: str):
    """
    arq task: re-embed all active documents for a tenant.
    Used for model upgrades or collection restructuring.
    """
    from services import qdrant_service, file_service
    from db import queries as q
    import db.database as _db

    log.info(f"[arq] reindex_tenant_documents start: tenant={tenant_id[:8]}")
    docs = await q.list_documents(limit=1000, tenant_id=tenant_id)
    success = 0
    failed  = 0

    for doc in docs:
        try:
            # Re-read the uploaded file
            import glob as _glob
            from core.config import UPLOAD_DIR
            matches = list(_glob.glob(str(UPLOAD_DIR / f"*_{doc['filename']}")))
            if not matches:
                log.warning(f"[arq] reindex: file not found for {doc['filename']}")
                failed += 1
                continue

            dest = Path(matches[0])
            text = file_service.extract_text(dest)
            lang = file_service.detect_language(text)
            tag  = doc.get("tag", "general")

            # Delete old vectors then re-store
            old_collection = doc.get("qdrant_collection") or qdrant_service.tag_to_collection(tag)
            await qdrant_service.delete_by_doc_id(str(doc["id"]), old_collection, tenant_id=tenant_id)

            qdrant_ok, collection = await qdrant_service.store_document(
                str(doc["id"]), doc["filename"], text, tag,
                doc.get("department", "General"),
                doc.get("access_level", "employee"),
                doc.get("uploader_email", ""),
                tenant_id,
            )
            await q.update_document_qdrant_status(str(doc["id"]), qdrant_ok, collection, lang)
            success += 1
        except Exception as e:
            log.error(f"[arq] reindex failed for {doc['filename']}: {e}")
            failed += 1

    log.info(f"[arq] reindex_tenant_documents done: tenant={tenant_id[:8]} success={success} failed={failed}")
    return {"success": success, "failed": failed}


async def auto_extract_invoice(ctx, email_id: str, tenant_id: str):
    """
    arq task: auto-extract invoice data from email body.
    Triggered when invoice keywords are detected during ingest.
    """
    _heartbeat()
    import json
    import uuid
    from services import openai_service as oai
    import db.database as _db

    _EXTRACT_SYSTEM = """You are a Hungarian invoice data extractor.
Extract structured invoice data from the email text.
Respond ONLY with valid JSON:
{"invoice_number": "string or null", "vendor_name": "string or null",
 "amount": number or null, "currency": "HUF", "due_date": "YYYY-MM-DD or null",
 "issue_date": "YYYY-MM-DD or null", "vat_amount": number or null, "confidence": 0.0-1.0}"""

    try:
        email = await _db.fetchrow(
            "SELECT * FROM emails WHERE id=$1 AND tenant_id=$2", email_id, tenant_id
        )
        if not email:
            log.warning(f"[arq] auto_extract_invoice: email not found {email_id}")
            return

        # Skip if extraction already exists
        existing = await _db.fetchrow(
            "SELECT id FROM invoice_extractions WHERE email_id=$1 AND status IN ('extracted','verified') LIMIT 1",
            email_id
        )
        if existing:
            return

        text = f"Subject: {email['subject']}\n\n{email['body'] or ''}"
        raw = await oai.chat(
            [{"role": "system", "content": _EXTRACT_SYSTEM},
             {"role": "user", "content": text[:4000]}],
            max_tokens=400, json_mode=True,
            task_type="extract_entities", model=oai.MODEL_MINI, tenant_id=tenant_id,
        )
        parsed = json.loads(raw)
        confidence = float(parsed.get("confidence") or 0.0)

        # Only save if reasonably confident this is actually an invoice email
        if confidence < 0.4:
            log.debug(f"[arq] auto_extract_invoice: low confidence {confidence:.2f}, skipping")
            return

        def _parse_date(v):
            if not v:
                return None
            try:
                from datetime import date
                return date.fromisoformat(str(v))
            except Exception:
                return None

        extraction_id = str(uuid.uuid4())
        await _db.execute(
            """INSERT INTO invoice_extractions
               (id, tenant_id, email_id, invoice_number, vendor_name, amount, currency,
                due_date, issue_date, vat_amount, raw_extraction, confidence, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'extracted')
               ON CONFLICT DO NOTHING""",
            extraction_id, tenant_id, email_id,
            parsed.get("invoice_number"), parsed.get("vendor_name"),
            parsed.get("amount"), parsed.get("currency", "HUF"),
            _parse_date(parsed.get("due_date")), _parse_date(parsed.get("issue_date")),
            parsed.get("vat_amount"), json.dumps(parsed), confidence,
        )
        log.info(f"[arq] auto_extract_invoice done: email={email_id[:8]} inv={parsed.get('invoice_number')} conf={confidence:.2f}")
    except Exception as e:
        log.error(f"[arq] auto_extract_invoice failed: {e}")
        raise  # arq will retry


async def daily_retention_cleanup(ctx):
    """
    arq cron task: purge rows exceeding GDPR retention windows.
    Scheduled at 02:00 UTC daily by WorkerSettings.cron_jobs.
    """
    from services.retention import run_retention_cleanup
    try:
        summary = await run_retention_cleanup()
        log.info(f"[arq] daily_retention_cleanup: {summary}")
        return summary
    except Exception as e:
        log.error(f"[arq] daily_retention_cleanup failed: {e}")
        raise
