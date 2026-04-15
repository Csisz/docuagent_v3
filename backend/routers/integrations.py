"""
Integrációk: Outlook webhook, integráció státuszok, config.
"""
import logging
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, Request, Security, Depends, HTTPException
from pydantic import BaseModel

import db.database as _db
import db.queries as q
from core.config import N8N_BASE_URL, N8N_LABEL_WEBHOOK, N8N_CALENDAR_SYNC_WEBHOOK, OPENAI_API_KEY
from core.security import require_api_key, get_current_user

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])
log = logging.getLogger("docuagent")


# ── Config helper (integration.* kulcsok, tenant_id=NULL) ─────

async def _get_cfg(key: str, default: str = "") -> str:
    row = await _db.fetchrow(
        "SELECT value FROM config WHERE key=$1 AND tenant_id IS NULL", key
    )
    return row["value"] if row else default


async def _set_cfg(key: str, value: str) -> None:
    await _db.execute(
        """INSERT INTO config (id, tenant_id, key, value)
           VALUES ($1, NULL, $2, $3)
           ON CONFLICT (tenant_id, key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()""",
        uuid.uuid4(), key, value,
    )


# ── Outlook webhook ───────────────────────────────────────────

@router.post("/outlook/webhook")
async def outlook_webhook(
    request: Request,
    _auth=Security(require_api_key),
):
    """
    n8n → DocuAgent Outlook email ingest.
    Ugyanaz a classify + auto-reply pipeline mint a Gmail pipeline-nál.
    """
    from routers.emails import ingest_email   # delayed import, same func
    return await ingest_email(request)


# ── Outlook config mentés ─────────────────────────────────────

class OutlookConfigRequest(BaseModel):
    email:       Optional[str] = None
    webhook_url: Optional[str] = None
    enabled:     bool = True


@router.post("/outlook/config")
async def save_outlook_config(
    body: OutlookConfigRequest,
    current_user: dict = Depends(get_current_user),
):
    if body.email is not None:
        await _set_cfg("integration.outlook_email", body.email)
    if body.webhook_url is not None:
        await _set_cfg("integration.outlook_webhook", body.webhook_url)
    await _set_cfg("integration.outlook_enabled", "true" if body.enabled else "false")
    log.info(f"Outlook config updated by {current_user.get('email')}")
    return {"status": "ok"}


# ── Integráció státusz ────────────────────────────────────────

@router.get("/status")
async def integrations_status(current_user: dict = Depends(get_current_user)):
    """
    Visszaadja minden integráció aktuális állapotát:
      gmail, outlook, calendar, n8n
    """
    # n8n health
    n8n_online = await _check_n8n()

    # Gmail: webhook-ok megléte alapján
    gmail_connected = bool(N8N_LABEL_WEBHOOK)
    gmail_email = await _get_cfg("integration.gmail_email", "")

    # Outlook: config tábla alapján
    outlook_enabled = (await _get_cfg("integration.outlook_enabled", "false")) == "true"
    outlook_email   = await _get_cfg("integration.outlook_email", "")
    outlook_webhook = await _get_cfg("integration.outlook_webhook", "")

    # Calendar
    calendar_connected = bool(N8N_CALENDAR_SYNC_WEBHOOK)
    last_sync = await _get_cfg("integration.calendar_last_sync", "")

    return {
        "gmail": {
            "connected":    gmail_connected,
            "email":        gmail_email,
            "webhook_set":  gmail_connected,
        },
        "outlook": {
            "connected":    outlook_enabled,
            "email":        outlook_email,
            "webhook_url":  outlook_webhook,
        },
        "calendar": {
            "connected":    calendar_connected,
            "last_sync":    last_sync or None,
        },
        "n8n": {
            "online": n8n_online,
            "url":    N8N_BASE_URL,
        },
    }


class WidgetConfigRequest(BaseModel):
    slug:            Optional[str] = None
    color:           Optional[str] = None
    welcome_message: Optional[str] = None


@router.post("/widget/config")
async def save_widget_config(
    body: WidgetConfigRequest,
    current_user: dict = Depends(get_current_user),
):
    """Widget testreszabási beállítások mentése a config táblába."""
    import uuid as _uuid

    tid = _uuid.UUID(current_user["tenant_id"])

    async def _set_tenant_cfg_safe(key: str, value: str):
        existing = await _db.fetchrow(
            "SELECT id FROM config WHERE tenant_id=$1 AND key=$2", tid, key
        )
        if existing:
            await _db.execute(
                "UPDATE config SET value=$1, updated_at=NOW() WHERE tenant_id=$2 AND key=$3",
                value, tid, key,
            )
        else:
            await _db.execute(
                "INSERT INTO config (id, tenant_id, key, value) VALUES ($1, $2, $3, $4)",
                _uuid.uuid4(), tid, key, value,
            )

    if body.color:
        await _set_tenant_cfg_safe("widget.primary_color", body.color)
    if body.welcome_message:
        await _set_tenant_cfg_safe("widget.welcome_message", body.welcome_message)
    if body.slug:
        await _set_tenant_cfg_safe("widget.slug", body.slug)
    log.info(f"Widget config saved by {current_user.get('email')}")
    return {"status": "ok"}


async def _check_n8n() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{N8N_BASE_URL}/healthz")
            return r.status_code < 500
    except Exception:
        return False
