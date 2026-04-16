"""
arq worker task definitions.

Tasks are imported by WorkerSettings in main.py.
Each task receives `ctx` (arq context) as first argument.
"""
import logging
import time
from pathlib import Path

log = logging.getLogger("docuagent")


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
