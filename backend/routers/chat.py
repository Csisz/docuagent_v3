"""
Chat-alapú tudásbázis kérdezés (RAG + conversation context).
Két mód:
  - /api/chat/*        → belső, JWT auth szükséges
  - /api/widget/chat/* → publikus embed widget, tenant_slug alapján
"""
import re
import time
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I
)

from core.security import get_current_user
from core.config import OPENAI_API_KEY, COMPANY_NAME, RAG_FALLBACK_THRESHOLD
from services import openai_service, qdrant_service
import db.queries as q
import db.auth_queries as aq

router = APIRouter(prefix="/api/chat", tags=["Chat"])
widget_router = APIRouter(prefix="/api/widget/chat", tags=["Chat Widget"])
log = logging.getLogger("docuagent")


class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    collection: Optional[str] = None


class WidgetChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    tenant_slug: str
    visitor_id: Optional[str] = None


_CHAT_SYSTEM = f"""Te a(z) {COMPANY_NAME} belső tudásbázis asszisztense vagy.

Feladatod: A feltöltött belső dokumentumok alapján válaszolj a munkatársak kérdéseire.

Szabályok:
- Csak a megadott dokumentumok és az előző üzenetek alapján válaszolj
- Ha nincs elegendő információ, jelezd egyértelműen
- Hivatkozz a forrás dokumentumra, ha konkrét adatot adsz meg
- Légy tömör és szakszerű
- A válasz nyelvét igazítsd a kérdés nyelvéhez"""


@router.post("/message")
async def send_message(
    req: ChatRequest,
    current_user: dict = Depends(get_current_user)
):
    if not OPENAI_API_KEY:
        raise HTTPException(503, "Nincs API kulcs")

    t_start = time.monotonic()
    tenant_id = current_user["tenant_id"]
    user_id   = current_user["user_id"]

    # Session kezelés
    session_id = req.session_id
    if not session_id:
        session = await q.create_chat_session(tenant_id, user_id)
        session_id = str(session["id"])
        is_new_session = True
    else:
        session = await q.get_chat_session(session_id)
        if not session:
            raise HTTPException(404, "Session nem található")
        is_new_session = False

    # User üzenet mentése
    await q.insert_chat_message(session_id, "user", req.question)

    # Auto title generálás az első kérdésből
    if is_new_session:
        title = req.question[:60] + ("..." if len(req.question) > 60 else "")
        await q.update_session_title(session_id, title)

    # RAG keresés
    try:
        if req.collection:
            results = await qdrant_service.search(req.question, req.collection, limit=4)
        else:
            results = await qdrant_service.search_multi(req.question, limit_per=3)
    except Exception as e:
        log.warning(f"Chat RAG error: {e}")
        results = []

    top_score = results[0]["score"] if results else 0.0
    sources = [
        {"filename": r["filename"], "score": r["score"], "collection": r["collection"]}
        for r in results
    ]

    # Conversation history (utolsó 7 üzenet, DESC → megfordítjuk, kihagyjuk az épp elmentett user msg-t)
    history = await q.get_chat_history(session_id, limit=7)
    messages_ctx = [
        {"role": row["role"], "content": row["content"]}
        for row in reversed(list(history)[1:])
    ]

    # Kontextus összeállítása
    context_text = ""
    if results:
        parts = [f"[{r['filename']} | {r['score']:.0%}]\n{r['text']}" for r in results[:4]]
        context_text = "\n\n---\n\n".join(parts)

    # GPT üzenetek
    gpt_messages = [{"role": "system", "content": _CHAT_SYSTEM}]
    if context_text:
        gpt_messages.append({
            "role": "system",
            "content": f"Releváns dokumentumrészletek:\n\n{context_text}"
        })
    gpt_messages.extend(messages_ctx)
    gpt_messages.append({"role": "user", "content": req.question})

    # LLM válasz
    try:
        answer = await openai_service.chat(gpt_messages, max_tokens=600)
    except Exception as e:
        log.error(f"Chat LLM error: {e}")
        raise HTTPException(500, "AI válasz generálási hiba")

    latency_ms = int((time.monotonic() - t_start) * 1000)

    # Assistant üzenet mentése
    await q.insert_chat_message(
        session_id, "assistant", answer,
        sources=sources, confidence=top_score
    )

    log.info(f"Chat: session={session_id} score={top_score:.2f} {latency_ms}ms")

    return {
        "session_id": session_id,
        "answer":     answer,
        "sources":    sources,
        "confidence": round(top_score, 3),
        "fallback":   top_score < RAG_FALLBACK_THRESHOLD,
        "latency_ms": latency_ms,
    }


@router.get("/sessions")
async def list_sessions(current_user: dict = Depends(get_current_user)):
    sessions = await q.list_chat_sessions(
        current_user["tenant_id"], current_user["user_id"]
    )
    return {"sessions": [dict(s) for s in sessions]}


@router.get("/sessions/{session_id}/messages")
async def get_messages(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    history = await q.get_chat_history(session_id, limit=50)
    return {"messages": [dict(m) for m in reversed(list(history))]}


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    await q.delete_chat_session(session_id)
    return {"status": "ok"}


from fastapi.middleware.cors import CORSMiddleware
from fastapi import Response

@router.options("/api/widget/chat/message")
async def widget_cors_preflight():
    """CORS preflight a widget számára."""
    return Response(
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    )

# ── Widget chat (publikus, tenant_slug alapján) ───────────────

@widget_router.post("/message")
async def widget_chat_message(req: WidgetChatRequest):
    """Publikus widget endpoint — nincs JWT, tenant_slug azonosít."""
    if not OPENAI_API_KEY:
        raise HTTPException(503, "Service unavailable")

    tenant = await aq.get_tenant_by_slug(req.tenant_slug)
    if not tenant or not tenant["is_active"]:
        raise HTTPException(404, "Tenant not found")

    t_start = time.monotonic()
    tenant_id = str(tenant["id"])

    session_id = req.session_id
    # Treat non-UUID session_id values as missing to avoid DB cast errors
    if session_id and not _UUID_RE.match(session_id):
        session_id = None
    if not session_id:
        session = await q.create_chat_session(tenant_id, None)
        session_id = str(session["id"])
        is_new_session = True
    else:
        session = await q.get_chat_session(session_id)
        if not session:
            session = await q.create_chat_session(tenant_id, None)
            session_id = str(session["id"])
        is_new_session = False

    await q.insert_chat_message(session_id, "user", req.question)

    if is_new_session:
        title = req.question[:60] + ("..." if len(req.question) > 60 else "")
        await q.update_session_title(session_id, title)

    try:
        results = await qdrant_service.search_multi(req.question, limit_per=3)
    except Exception as e:
        log.warning(f"Widget RAG error: {e}")
        results = []

    top_score = results[0]["score"] if results else 0.0
    sources = [
        {"filename": r["filename"], "score": r["score"], "collection": r["collection"]}
        for r in results
    ]

    history = await q.get_chat_history(session_id, limit=7)
    messages_ctx = [
        {"role": row["role"], "content": row["content"]}
        for row in reversed(list(history)[1:])
    ]

    context_text = ""
    if results:
        parts = [f"[{r['filename']} | {r['score']:.0%}]\n{r['text']}" for r in results[:4]]
        context_text = "\n\n---\n\n".join(parts)

    _WIDGET_SYSTEM = """Te egy ügyfélszolgálati asszisztens vagy.
Feladatod: A feltöltött dokumentumok alapján válaszolj a kérdésekre.
Szabályok:
- Csak a megadott dokumentumok alapján válaszolj
- Ha nincs elegendő információ, jelezd egyértelműen
- Légy tömör és szakszerű
- A válasz nyelvét igazítsd a kérdés nyelvéhez
- Ne találj ki adatokat, árakat, határidőket"""

    gpt_messages = [{"role": "system", "content": _WIDGET_SYSTEM}]
    if context_text:
        gpt_messages.append({
            "role": "system",
            "content": f"Releváns dokumentumrészletek:\n\n{context_text}"
        })
    gpt_messages.extend(messages_ctx)
    gpt_messages.append({"role": "user", "content": req.question})

    try:
        answer = await openai_service.chat(gpt_messages, max_tokens=600)
    except Exception as e:
        log.error(f"Widget LLM error: {e}")
        raise HTTPException(500, "AI válasz generálási hiba")

    latency_ms = int((time.monotonic() - t_start) * 1000)

    await q.insert_chat_message(
        session_id, "assistant", answer,
        sources=sources, confidence=top_score
    )

    log.info(f"Widget chat: session={session_id} score={top_score:.2f} {latency_ms}ms")

    return {
        "session_id": session_id,
        "answer":     answer,
        "sources":    sources,
        "confidence": round(top_score, 3),
        "fallback":   top_score < RAG_FALLBACK_THRESHOLD,
        "latency_ms": latency_ms,
    }


@widget_router.get("/sessions/{session_id}/messages")
async def widget_get_messages(session_id: str):
    """Widget előzmények lekérése session_id alapján."""
    history = await q.get_chat_history(session_id, limit=50)
    return {"messages": [dict(m) for m in reversed(list(history))]}


# ── Widget POST /api/widget/chat  (rövidített alias, message mező) ──

class WidgetChatShortRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    tenant_slug: str


@widget_router.post("")
async def widget_chat_short(req: WidgetChatShortRequest):
    """
    Rövid alias: POST /api/widget/chat
    Input: {message, session_id, tenant_slug}
    Átmappeli a meglévő widget_chat_message logikára.
    """
    return await widget_chat_message(
        WidgetChatRequest(
            question=req.message,
            session_id=req.session_id,
            tenant_slug=req.tenant_slug,
        )
    )


# ── Widget config (publikus) ──────────────────────────────────

_widget_config_router = APIRouter(prefix="/api/widget/config", tags=["Chat Widget"])


@_widget_config_router.get("/{tenant_slug}")
async def widget_config(tenant_slug: str):
    """
    Publikus widget konfig lekérése tenant slug alapján.
    Visszaad: company_name, welcome_message, primary_color, logo_url
    """
    import db.database as _db
    import uuid as _uuid

    tenant = await aq.get_tenant_by_slug(tenant_slug)
    if not tenant or not tenant["is_active"]:
        raise HTTPException(404, "Tenant not found")

    tid = tenant["id"]

    async def _cfg(key: str, default: str = "") -> str:
        row = await _db.fetchrow(
            "SELECT value FROM config WHERE key=$1 AND tenant_id=$2", key, tid
        )
        if row:
            return row["value"]
        # global fallback (tenant_id IS NULL)
        row2 = await _db.fetchrow(
            "SELECT value FROM config WHERE key=$1 AND tenant_id IS NULL", key
        )
        return row2["value"] if row2 else default

    return {
        "company_name":     await _cfg("widget.company_name",     tenant["name"]),
        "welcome_message":  await _cfg("widget.welcome_message",  "Szia! Miben segíthetek?"),
        "primary_color":    await _cfg("widget.primary_color",    "#1a56db"),
        "logo_url":         await _cfg("widget.logo_url",         ""),
        "tenant_slug":      tenant_slug,
    }
