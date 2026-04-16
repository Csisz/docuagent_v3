"""
OpenAI API hívások egy helyen.
Chat completions + embedding generálás.

v3.13: AI Gateway — model routing + usage logging.
"""
import uuid
import logging
import httpx
from typing import Optional
from core.config import OPENAI_API_KEY

log = logging.getLogger("docuagent")

CHAT_URL      = "https://api.openai.com/v1/chat/completions"
EMBEDDING_URL = "https://api.openai.com/v1/embeddings"
EMBED_MODEL   = "text-embedding-3-small"

MODEL_MINI  = "gpt-4o-mini"
MODEL_SMART = "gpt-4o"

# Becsült cost / 1K token (input+output átlag)
_COST_PER_1K = {
    MODEL_MINI:  0.00015,
    MODEL_SMART: 0.005,
}


def select_model(
    task_type: str,
    confidence_required: float = 0.0,
    tenant_policy: Optional[dict] = None,
) -> str:
    """
    Intelligens model routing.
    - classify          → gpt-4o-mini (gyors, olcsó)
    - extract_entities  → gpt-4o-mini
    - summarize         → gpt-4o-mini
    - draft_reply       → gpt-4o-mini (agent drafting layer)
    - reply (conf > threshold) → gpt-4o (pontosabb, fontosabb email)
    - reply (conf ≤ threshold) → gpt-4o-mini
    - insights          → gpt-4o
    - general           → gpt-4o-mini

    tenant_policy overrides:
    - use_smart_model_for_reply: False → always gpt-4o-mini for reply
    - smart_model_threshold: float → confidence threshold for gpt-4o
    """
    policy = tenant_policy or {}
    use_smart = policy.get("use_smart_model_for_reply", True)
    smart_thresh = float(policy.get("smart_model_threshold", 0.80))

    if task_type in ("classify", "extract_entities", "summarize", "draft_reply"):
        return MODEL_MINI
    if task_type == "insights":
        return MODEL_SMART
    if task_type == "reply":
        if not use_smart:
            return MODEL_MINI
        return MODEL_SMART if confidence_required > smart_thresh else MODEL_MINI
    return MODEL_MINI


def _auth_headers() -> dict:
    return {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }


async def _log_usage(model: str, task_type: str, tokens: int, tenant_id: Optional[str] = None) -> None:
    """Aszinkron, tűz és felejtsd el — ha hibázik, nem töri el a hívót."""
    try:
        import db.database as _db
        cost = round(tokens / 1000 * _COST_PER_1K.get(model, 0.00015), 6)
        tid  = uuid.UUID(tenant_id) if tenant_id else None
        await _db.execute(
            """INSERT INTO ai_usage_log (id, tenant_id, model, task_type, tokens_used, cost_usd)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            uuid.uuid4(), tid, model, task_type, tokens, cost,
        )
    except Exception as e:
        log.debug(f"ai_usage_log insert failed: {e}")


async def chat(
    messages: list,
    max_tokens: int = 800,
    json_mode: bool = False,
    task_type: str = "general",
    model: Optional[str] = None,
    confidence_required: float = 0.0,
    tenant_id: Optional[str] = None,
) -> str:
    """
    Chat completion.
    model=None → select_model(task_type, confidence_required) alapján választ.
    Logol az ai_usage_log táblába.
    """
    chosen = model or select_model(task_type, confidence_required)

    body: dict = {
        "model":      chosen,
        "messages":   messages,
        "max_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(CHAT_URL, headers=_auth_headers(), json=body)
        r.raise_for_status()
        data    = r.json()
        content = data["choices"][0]["message"]["content"]
        tokens  = data.get("usage", {}).get("total_tokens", 0)

    log.debug(f"AI Gateway: task={task_type} model={chosen} tokens={tokens}")
    await _log_usage(chosen, task_type, tokens, tenant_id)
    return content


async def embed(text: str) -> list[float]:
    """Szöveg embedding vektorrá alakítása (text-embedding-3-small, 1536 dim)."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            EMBEDDING_URL,
            headers=_auth_headers(),
            json={"model": EMBED_MODEL, "input": text[:8000]},
        )
        r.raise_for_status()
        return r.json()["data"][0]["embedding"]
