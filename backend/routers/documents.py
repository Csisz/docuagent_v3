"""
Dokumentum feltöltés és RAG keresés.

v3.4 változások:
  - Tenant isolation: store_document() és delete_by_doc_id() kap tenant_id-t
  - Async interface: az upload végpont azonnal visszatér, a Qdrant ingest
    FastAPI BackgroundTasks-ban fut
  - agent_runs: doc_ingest esemény loggolva (create_run / finish_run)
  - GET /api/documents/{doc_id}/status: lekérdezhető az ingest státusza

v3.3 változások:
  - Confidence scoring: ha top_score < RAG_FALLBACK_THRESHOLD → sablon válasz
  - Forrás-visszaadás: response tartalmazza [{filename, score, collection}]
  - Logolás: minden rag/query hívás bekerül a rag_logs táblába
  - Multi-collection: tag alapján kerül a megfelelő Qdrant collection-be
"""
import time
import uuid
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

import db.queries as q
import db.run_queries as rq
import db.audit_queries as alog
from models.schemas import RagRequest
from services import openai_service, qdrant_service, file_service
from core.config import (
    OPENAI_API_KEY, UPLOAD_DIR, ALLOWED_EXTS, COMPANY_NAME,
    RAG_FALLBACK_THRESHOLD,
    FALLBACK_REPLY_HU, FALLBACK_REPLY_EN, FALLBACK_REPLY_DE
)
from core.security import get_current_user

router = APIRouter(prefix="/api", tags=["Documents"])
log    = logging.getLogger("docuagent")


# ── Suggest-tag request model ─────────────────────────────────

class SuggestTagBody(BaseModel):
    filename: str
    first_bytes_b64: Optional[str] = ""


_BILLING_KW = [
    "szamla", "számla", "szla", "afa", "áfa", "billing",
    "invoice", "faktura", "faktúra", "dijbeker", "díjbekér",
]
_LEGAL_KW = [
    "nav", "adó", "ado", "adozas", "adózás", "tax", "kata",
    "legal", "jogi", "szerzod", "szerződ", "gdpr",
    "rendelet", "hatarozat", "határozat",
]
_HR_KW = [
    "ber", "bér", "munka", "hr", "cafeteria", "szabadsag",
    "szabadság", "fizetes", "fizetés", "berszam", "bérszám",
    "munkavallal", "munkavállal",
]
_SUPPORT_KW = ["support", "ugyfel", "ügyfél", "help", "segitseg", "segítség", "aszf", "ászf"]
_FAQ_KW     = ["gyik", "faq"]


@router.post("/documents/suggest-tag")
async def suggest_tag(body: SuggestTagBody):
    """
    Rule-based tag suggestion from filename — no OpenAI call needed.
    Returns: { suggested_tag, confidence, reason }
    """
    name = body.filename.lower()

    for kw in _BILLING_KW:
        if kw in name:
            return {"suggested_tag": "billing", "confidence": 0.9,
                    "reason": f"Fájlnév tartalmazza: '{kw}'"}

    for kw in _LEGAL_KW:
        if kw in name:
            return {"suggested_tag": "legal", "confidence": 0.9,
                    "reason": f"Fájlnév tartalmazza: '{kw}'"}

    for kw in _HR_KW:
        if kw in name:
            return {"suggested_tag": "hr", "confidence": 0.9,
                    "reason": f"Fájlnév tartalmazza: '{kw}'"}

    for kw in _FAQ_KW:
        if kw in name:
            return {"suggested_tag": "general", "confidence": 0.7,
                    "reason": f"GYIK / FAQ fájl → általános kategória"}

    for kw in _SUPPORT_KW:
        if kw in name:
            return {"suggested_tag": "support", "confidence": 0.9,
                    "reason": f"Fájlnév tartalmazza: '{kw}'"}

    # Extension hints (weaker signal)
    ext = body.filename.rsplit(".", 1)[-1].lower() if "." in body.filename else ""
    if ext in ("xlsx", "xls", "csv"):
        return {"suggested_tag": "billing", "confidence": 0.6,
                "reason": "Táblázat formátum → valószínűleg számlázási adat"}

    return {"suggested_tag": "general", "confidence": 0.4,
            "reason": "Nincs specifikus kulcsszó a fájlnévben"}


_FALLBACK_BY_LANG = {"HU": FALLBACK_REPLY_HU, "EN": FALLBACK_REPLY_EN, "DE": FALLBACK_REPLY_DE}

# ── Optimalizált RAG system prompt ────────────────────────────
_RAG_SYSTEM_PROMPT = f"""Te a(z) {COMPANY_NAME} ügyfélszolgálati asszisztense vagy.

Feladatod: az alábbi belső dokumentumok alapján válaszolj az ügyfél kérdésére.

Szabályok:
- Csak a megadott dokumentumok tartalmára támaszkodj
- Ha nincs elegendő információ, mondd: "Sajnos erre a kérdésre nem találok pontos választ dokumentumainkban."
- Légy tömör, udvarias és szakszerű
- Ne találj ki adatokat, árakat, határidőket
- A válasz nyelvét igazítsd a kérdés nyelvéhez
- Ne hivatkozz a dokumentumok nevére vagy belső azonosítójára"""


# ── Background ingest task ────────────────────────────────────

async def _ingest_background(
    doc_id: str,
    dest: Path,
    filename: str,
    tag: str,
    department: str,
    access_level: str,
    uploader_email: str,
    tenant_id: str,
    run_id: str,
):
    """
    Background task: szöveget kibont a fájlból, feltölti Qdrant-ba,
    majd frissíti a documents táblát és zárja az agent_run-t.
    """
    t_start = time.monotonic()
    try:
        text       = file_service.extract_text(dest)
        lang       = file_service.detect_language(text)
        qdrant_ok, collection = await qdrant_service.store_document(
            doc_id, filename, text, tag, department, access_level, uploader_email, tenant_id
        )
        await q.update_document_qdrant_status(doc_id, qdrant_ok, collection, lang)
        latency_ms = int((time.monotonic() - t_start) * 1000)
        await rq.finish_run(
            run_id,
            status="success" if qdrant_ok else "failed",
            latency_ms=latency_ms,
            result_summary=f"{'OK' if qdrant_ok else 'FAIL'}: {filename} → {collection}",
        )
        log.info(f"Background ingest done: {filename} tenant={tenant_id[:8]} qdrant={qdrant_ok} {latency_ms}ms")
    except Exception as e:
        latency_ms = int((time.monotonic() - t_start) * 1000)
        await rq.finish_run(run_id, "failed", latency_ms=latency_ms, error_message=str(e))
        log.error(f"Background ingest failed for {filename}: {e}")


# ── Upload ────────────────────────────────────────────────────

@router.post("/upload")
async def upload_doc(
    background_tasks: BackgroundTasks,
    file:           UploadFile = File(...),
    uploader_name:  str = Form("Demo"),
    uploader_email: str = Form("demo@agentify.hu"),
    tag:            str = Form("general"),
    department:     str = Form("General"),
    access_level:   str = Form("employee"),
    current_user:   dict = Depends(get_current_user)
):
    tenant_id = current_user.get("tenant_id") or "global"
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"Nem támogatott formátum: {ext}")

    content  = await file.read()
    size_kb  = round(len(content) / 1024)
    dest     = UPLOAD_DIR / f"{uuid.uuid4().hex[:8]}_{file.filename}"
    dest.write_bytes(content)

    doc_id = str(uuid.uuid4())

    # Verziózás: ha ugyanolyan nevű fájl már létezik, töröld a régit
    existing = await q.get_document_by_filename(file.filename, tenant_id=tenant_id)
    if existing:
        old_collection = existing.get("qdrant_collection") or qdrant_service.tag_to_collection(existing.get("tag", "general"))
        await qdrant_service.delete_by_doc_id(str(existing["id"]), old_collection, tenant_id=tenant_id)
        await q.soft_delete_document(str(existing["id"]))
        log.info(f"Document versioned: replaced {existing['id']} with {doc_id} for {file.filename}")

    # DB insert immediately (qdrant_ok=False until background finishes)
    await q.insert_document(
        doc_id, file.filename, uploader_name, uploader_email,
        tag, department, access_level, size_kb, lang=None, qdrant_ok=False,
        tenant_id=tenant_id
    )

    # agent_run record
    run_id = None
    if OPENAI_API_KEY:
        run_id = await rq.create_run(
            tenant_id=tenant_id,
            trigger_type="doc_ingest",
            trigger_ref=doc_id,
            input_summary=f"{file.filename} ({size_kb}KB, tag={tag})",
        )

        # Try arq queue first, fall back to BackgroundTasks
        _enqueued_via_arq = False
        try:
            import os as _os
            _redis_url = _os.getenv("REDIS_URL", "")
            if _redis_url:
                from arq import create_pool
                from arq.connections import RedisSettings
                _url = _redis_url.replace("redis://", "")
                _hp = _url.split("/")[0].split(":")
                _rs = RedisSettings(host=_hp[0], port=int(_hp[1]) if len(_hp) > 1 else 6379)
                _pool = await create_pool(_rs)
                await _pool.enqueue_job(
                    "process_document",
                    doc_id, tenant_id, str(dest), file.filename,
                    tag, department, access_level, uploader_email, run_id,
                )
                await _pool.aclose()
                _enqueued_via_arq = True
                log.info(f"Upload enqueued via arq: {file.filename} run_id={run_id}")
        except Exception as _arq_err:
            log.warning(f"arq enqueue failed, falling back to BackgroundTasks: {_arq_err}")

        if not _enqueued_via_arq:
            background_tasks.add_task(
                _ingest_background,
                doc_id, dest, file.filename, tag, department,
                access_level, uploader_email, tenant_id, run_id,
            )

    await alog.insert_audit_log(
        tenant_id=tenant_id, user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="upload", entity_type="document",
        entity_id=doc_id,
        details={"filename": file.filename, "size_kb": size_kb, "tag": tag, "run_id": run_id},
    )

    log.info(f"Upload accepted: {file.filename} ({size_kb}KB) → background ingest run_id={run_id}")
    return {
        "status":   "processing",
        "run_id":   run_id,
        "doc_id":   doc_id,
        "filename": file.filename,
        "size_kb":  size_kb,
    }


# ── Document ingest status ────────────────────────────────────

@router.get("/documents/{doc_id}/status")
async def get_document_status(
    doc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Visszaadja a dokumentum ingest státuszát az agent_runs tábla alapján.
    A background task fut tovább, ez az endpoint polling-ra használható.
    """
    doc = await q.get_document_by_id(doc_id)
    if not doc:
        raise HTTPException(404, "Dokumentum nem található")

    # Find the most recent doc_ingest run for this doc
    try:
        import db.database as _db
        import uuid as _uuid
        row = await _db.fetchrow(
            """SELECT status, latency_ms, error_message, result_summary, created_at, finished_at
               FROM agent_runs
               WHERE trigger_ref = $1 AND trigger_type = 'doc_ingest'
               ORDER BY created_at DESC LIMIT 1""",
            _uuid.UUID(doc_id),
        )
    except Exception:
        row = None

    return {
        "doc_id":       doc_id,
        "filename":     doc["filename"],
        "qdrant_ok":    doc["qdrant_ok"],
        "lang":         doc.get("lang"),
        "ingest_run": {
            "status":         row["status"]         if row else "unknown",
            "latency_ms":     row["latency_ms"]     if row else None,
            "error_message":  row["error_message"]  if row else None,
            "result_summary": row["result_summary"] if row else None,
            "finished_at":    row["finished_at"].isoformat() if row and row["finished_at"] else None,
        } if row else None,
    }


# ── RAG query ─────────────────────────────────────────────────

@router.post("/rag/query")
async def rag_query(req: RagRequest):
    """
    RAG keresés dokumentumokban.

    Response:
      found        – volt-e elég biztos találat
      answer       – AI válasz VAGY sablon (ha found=False)
      fallback     – True ha sablon válasz ment ki
      confidence   – legjobb találat score-ja (0-1)
      sources      – [{filename, score, collection}] lista
      latency_ms   – válaszidő
    """
    if not OPENAI_API_KEY:
        return {"found": False, "answer": None, "error": "No API key"}

    t_start  = time.monotonic()
    email_id = getattr(req, "email_id", None)
    lang     = getattr(req, "language", "HU") or "HU"

    # ── 1. Keresés (multi-collection, no tenant scope on public endpoint) ─
    try:
        results = await qdrant_service.search_multi(req.query)
    except Exception as e:
        log.warning(f"Qdrant query hiba: {e}")
        return {"found": False, "answer": None, "error": str(e)}

    top_score     = results[0]["score"] if results else 0.0
    fallback_used = (not results) or (top_score < RAG_FALLBACK_THRESHOLD)

    source_docs = [
        {"filename": r["filename"], "score": r["score"], "collection": r["collection"]}
        for r in results
    ]

    # ── 2a. Fallback ─────────────────────────────────────────
    if fallback_used:
        fallback_answer = _FALLBACK_BY_LANG.get(lang, FALLBACK_REPLY_HU)
        latency_ms = int((time.monotonic() - t_start) * 1000)
        await q.insert_rag_log(
            email_id=email_id, query=req.query, answer=fallback_answer,
            fallback_used=True, confidence=top_score,
            source_docs=source_docs, collection="—", lang=lang,
            latency_ms=latency_ms
        )
        log.info(f"RAG FALLBACK (score={top_score:.2f} < {RAG_FALLBACK_THRESHOLD}): '{req.query[:50]}'")
        return {
            "found":      False,
            "answer":     fallback_answer,
            "fallback":   True,
            "confidence": round(top_score, 3),
            "sources":    source_docs,
            "latency_ms": latency_ms,
        }

    # ── 2b. AI válasz ─────────────────────────────────────────
    context_parts = []
    for r in results[:4]:
        context_parts.append(
            f"[Forrás: {r['filename']} | relevancia: {r['score']:.0%}]\n{r['text']}"
        )
    context_text = "\n\n---\n\n".join(context_parts)

    user_prompt = (
        f"DOKUMENTUMOK:\n{context_text}\n\n"
        f"ÜGYFÉL KÉRDÉSE:\n{req.query}"
    )

    try:
        answer = await openai_service.chat(
            [{"role": "system", "content": _RAG_SYSTEM_PROMPT},
             {"role": "user",   "content": user_prompt}],
            max_tokens=600
        )
    except Exception as e:
        log.warning(f"RAG chat hiba: {e}")
        return {"found": False, "answer": None, "error": str(e)}

    latency_ms     = int((time.monotonic() - t_start) * 1000)
    top_collection = results[0]["collection"] if results else "general"

    await q.insert_rag_log(
        email_id=email_id, query=req.query, answer=answer,
        fallback_used=False, confidence=top_score,
        source_docs=source_docs, collection=top_collection,
        lang=lang, latency_ms=latency_ms
    )

    log.info(
        f"RAG OK: '{req.query[:50]}' | "
        f"score={top_score:.2f} | sources={len(results)} | {latency_ms}ms"
    )

    return {
        "found":      True,
        "answer":     answer,
        "fallback":   False,
        "confidence": round(top_score, 3),
        "sources":    source_docs,
        "latency_ms": latency_ms,
    }


# ── Delete ────────────────────────────────────────────────────

@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Dokumentum törlése: DB soft-delete + Qdrant hard-delete + fájl törlése."""
    doc = await q.get_document_by_id(doc_id)
    if not doc:
        raise HTTPException(404, "Dokumentum nem található")

    tenant_id = current_user.get("tenant_id")

    # Qdrant vektorok törlése (tenant-scoped)
    collection = doc.get("qdrant_collection") or qdrant_service.tag_to_collection(doc.get("tag", "general"))
    deleted_vectors = await qdrant_service.delete_by_doc_id(doc_id, collection, tenant_id=tenant_id)

    # DB soft delete
    await q.soft_delete_document(doc_id)

    # Fájl törlése lemezről
    import glob as _glob
    for f in _glob.glob(str(UPLOAD_DIR / f"*_{doc['filename']}")):
        try:
            Path(f).unlink()
        except Exception:
            pass

    log.info(f"Document deleted: {doc_id} filename={doc['filename']} vectors={deleted_vectors}")
    await alog.insert_audit_log(
        tenant_id=tenant_id, user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="delete", entity_type="document",
        entity_id=doc_id, details={"filename": doc["filename"], "vectors_removed": deleted_vectors},
    )
    return {
        "status":          "ok",
        "deleted":         doc_id,
        "filename":        doc["filename"],
        "vectors_removed": deleted_vectors,
    }
