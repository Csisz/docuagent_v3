"""
Agent Builder — CRUD a tenant agent konfigurációkhoz.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

import db.database as db
import db.audit_queries as alog
from core.security import get_current_user

router = APIRouter(prefix="/api/agents", tags=["Agents"])
log = logging.getLogger("docuagent")


# ── Pydantic modellek ─────────────────────────────────────────

class AgentCreate(BaseModel):
    name:                 str
    trigger:              str           = "email"
    filters:              dict          = {}
    actions:              list          = []
    approval_mode:        str           = "auto"
    style:                dict          = {}
    is_active:            bool          = True
    system_prompt:        Optional[str] = None
    model:                str           = "gpt-4o-mini"
    confidence_threshold: float         = 0.75
    n8n_webhook_url:      Optional[str] = None


class AgentUpdate(BaseModel):
    name:                 Optional[str]   = None
    trigger:              Optional[str]   = None
    filters:              Optional[dict]  = None
    actions:              Optional[list]  = None
    approval_mode:        Optional[str]   = None
    style:                Optional[dict]  = None
    is_active:            Optional[bool]  = None
    system_prompt:        Optional[str]   = None
    model:                Optional[str]   = None
    confidence_threshold: Optional[float] = None
    n8n_webhook_url:      Optional[str]   = None


# ── Helpers ───────────────────────────────────────────────────

def _serialize(row) -> dict:
    def _parse(val):
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return val
        return val

    return {
        "id":                   str(row["id"]),
        "tenant_id":            str(row["tenant_id"]) if row["tenant_id"] else None,
        "name":                 row["name"],
        "trigger":              row["trigger"],
        "filters":              _parse(row["filters"]),
        "actions":              _parse(row["actions"]),
        "approval_mode":        row["approval_mode"],
        "style":                _parse(row["style"]),
        "is_active":            row["is_active"],
        "created_at":           row["created_at"].isoformat() if row.get("created_at") else None,
        "system_prompt":        row.get("system_prompt"),
        "model":                row.get("model") or "gpt-4o-mini",
        "confidence_threshold": row.get("confidence_threshold"),
        "n8n_webhook_url":      row.get("n8n_webhook_url"),
        "last_activated_at":    row["last_activated_at"].isoformat() if row.get("last_activated_at") else None,
        "run_count":            row.get("run_count") or 0,
    }


# ── Endpoints ─────────────────────────────────────────────────

@router.get("")
async def list_agents(current_user: dict = Depends(get_current_user)):
    """Tenant összes agent konfigurációja."""
    tenant_id = current_user.get("tenant_id")
    if tenant_id:
        rows = await db.fetch(
            "SELECT * FROM agent_configs WHERE tenant_id=$1 ORDER BY created_at DESC",
            tenant_id
        )
    else:
        rows = await db.fetch("SELECT * FROM agent_configs ORDER BY created_at DESC")
    return {"agents": [_serialize(r) for r in (rows or [])]}


@router.post("", status_code=201)
async def create_agent(
    req: AgentCreate,
    current_user: dict = Depends(get_current_user),
):
    """Új agent konfiguráció létrehozása."""
    tenant_id = current_user.get("tenant_id")
    row = await db.fetchrow(
        """INSERT INTO agent_configs
           (tenant_id, name, trigger, filters, actions, approval_mode, style, is_active,
            system_prompt, model, confidence_threshold, n8n_webhook_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *""",
        tenant_id,
        req.name,
        req.trigger,
        json.dumps(req.filters),
        json.dumps(req.actions),
        req.approval_mode,
        json.dumps(req.style),
        req.is_active,
        req.system_prompt,
        req.model,
        req.confidence_threshold,
        req.n8n_webhook_url,
    )
    log.info(f"Agent created: {req.name} tenant={tenant_id}")
    agent_id = str(row["id"])
    await alog.insert_audit_log(
        tenant_id=tenant_id, user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="create", entity_type="agent",
        entity_id=agent_id, details={"name": req.name, "trigger": req.trigger},
    )
    return _serialize(row)


@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Egy agent konfiguráció részletei."""
    tenant_id = current_user.get("tenant_id")
    row = await db.fetchrow("SELECT * FROM agent_configs WHERE id=$1", agent_id)
    if not row:
        raise HTTPException(404, "Agent nem található")
    if tenant_id and str(row["tenant_id"]) != tenant_id:
        raise HTTPException(403, "Nincs jogosultság")
    return _serialize(row)


@router.put("/{agent_id}")
async def update_agent(
    agent_id: str,
    req: AgentUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Agent konfiguráció módosítása."""
    tenant_id = current_user.get("tenant_id")
    existing = await db.fetchrow("SELECT * FROM agent_configs WHERE id=$1", agent_id)
    if not existing:
        raise HTTPException(404, "Agent nem található")
    if tenant_id and str(existing["tenant_id"]) != tenant_id:
        raise HTTPException(403, "Nincs jogosultság")

    updates = {}
    if req.name                 is not None: updates["name"]                 = req.name
    if req.trigger              is not None: updates["trigger"]              = req.trigger
    if req.filters              is not None: updates["filters"]              = json.dumps(req.filters)
    if req.actions              is not None: updates["actions"]              = json.dumps(req.actions)
    if req.approval_mode        is not None: updates["approval_mode"]        = req.approval_mode
    if req.style                is not None: updates["style"]                = json.dumps(req.style)
    if req.is_active            is not None: updates["is_active"]            = req.is_active
    if req.system_prompt        is not None: updates["system_prompt"]        = req.system_prompt
    if req.model                is not None: updates["model"]                = req.model
    if req.confidence_threshold is not None: updates["confidence_threshold"] = req.confidence_threshold
    if req.n8n_webhook_url      is not None: updates["n8n_webhook_url"]      = req.n8n_webhook_url

    if not updates:
        return _serialize(existing)

    set_clause = ", ".join(f"{k}=${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())
    row = await db.fetchrow(
        f"UPDATE agent_configs SET {set_clause} WHERE id=$1 RETURNING *",
        agent_id, *values
    )
    log.info(f"Agent updated: {agent_id}")
    await alog.insert_audit_log(
        tenant_id=tenant_id, user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="update", entity_type="agent",
        entity_id=agent_id, details={"name": req.name or existing["name"], "fields": list(updates.keys())},
    )
    return _serialize(row)


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Agent konfiguráció törlése."""
    tenant_id = current_user.get("tenant_id")
    existing = await db.fetchrow("SELECT * FROM agent_configs WHERE id=$1", agent_id)
    if not existing:
        raise HTTPException(404, "Agent nem található")
    if tenant_id and str(existing["tenant_id"]) != tenant_id:
        raise HTTPException(403, "Nincs jogosultság")
    await db.execute("DELETE FROM agent_configs WHERE id=$1", agent_id)
    log.info(f"Agent deleted: {agent_id}")
    await alog.insert_audit_log(
        tenant_id=tenant_id, user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="delete", entity_type="agent",
        entity_id=agent_id, details={"name": existing["name"]},
    )


@router.post("/{agent_id}/toggle")
async def toggle_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Agent aktiválása/deaktiválása."""
    tenant_id = current_user.get("tenant_id")
    existing = await db.fetchrow("SELECT * FROM agent_configs WHERE id=$1", agent_id)
    if not existing:
        raise HTTPException(404, "Agent nem található")
    if tenant_id and str(existing["tenant_id"]) != tenant_id:
        raise HTTPException(403, "Nincs jogosultság")

    new_state = not existing["is_active"]
    row = await db.fetchrow(
        "UPDATE agent_configs SET is_active=$1 WHERE id=$2 RETURNING *",
        new_state, agent_id
    )
    log.info(f"Agent toggled: {agent_id} → is_active={new_state}")
    await alog.insert_audit_log(
        tenant_id=tenant_id, user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="toggle", entity_type="agent",
        entity_id=agent_id, details={"name": existing["name"], "is_active": new_state},
    )
    return {"id": agent_id, "is_active": new_state}


@router.post("/{agent_id}/activate")
async def activate_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Agent aktiválása: is_active=True, last_activated_at=NOW(), run_count++.
    Ha n8n_webhook_url be van állítva, beküldi a config-ot a webhook-ra.
    Gracefully failel ha n8n nem elérhető.
    """
    tenant_id = current_user.get("tenant_id")
    existing = await db.fetchrow("SELECT * FROM agent_configs WHERE id=$1", agent_id)
    if not existing:
        raise HTTPException(404, "Agent nem található")
    if tenant_id and str(existing["tenant_id"]) != tenant_id:
        raise HTTPException(403, "Nincs jogosultság")

    # Activate + timestamp
    row = await db.fetchrow(
        """UPDATE agent_configs
           SET is_active=TRUE, last_activated_at=NOW(), run_count=COALESCE(run_count,0)+1
           WHERE id=$1 RETURNING *""",
        agent_id,
    )

    # Optional n8n webhook ping (graceful fail)
    n8n_result = {"status": "skipped"}
    webhook_url = existing.get("n8n_webhook_url")
    if webhook_url:
        try:
            payload = {
                "agent_id": agent_id,
                "name":     existing["name"],
                "trigger":  existing["trigger"],
                "model":    existing.get("model") or "gpt-4o-mini",
            }
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(webhook_url, json=payload)
            n8n_result = {"status": "ok", "http_status": resp.status_code}
        except Exception as e:
            log.warning(f"[Agent activate] n8n ping failed for {agent_id[:8]}: {e}")
            n8n_result = {"status": "error", "detail": str(e)[:120]}

    log.info(f"Agent activated: {agent_id} n8n={n8n_result['status']}")
    await alog.insert_audit_log(
        tenant_id=tenant_id, user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="activate", entity_type="agent",
        entity_id=agent_id, details={"name": existing["name"], "n8n": n8n_result},
    )
    result = _serialize(row)
    result["n8n_ping"] = n8n_result
    return result


@router.get("/{agent_id}/runs")
async def get_agent_runs(
    agent_id: str,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    """Agent futtatási előzmények, legújabb elöl."""
    tenant_id = current_user.get("tenant_id")
    existing = await db.fetchrow("SELECT id, tenant_id FROM agent_configs WHERE id=$1", agent_id)
    if not existing:
        raise HTTPException(404, "Agent nem található")
    if tenant_id and str(existing["tenant_id"]) != tenant_id:
        raise HTTPException(403, "Nincs jogosultság")

    rows = await db.fetch(
        """SELECT id, agent_config_id, email_id, status, action_taken,
                  confidence, processing_time_ms, error_message, created_at
           FROM agent_runs
           WHERE agent_config_id=$1
           ORDER BY created_at DESC
           LIMIT $2""",
        uuid.UUID(agent_id), limit,
    )

    def _ser_run(r) -> dict:
        return {
            "id":               str(r["id"]),
            "agent_config_id":  str(r["agent_config_id"]) if r.get("agent_config_id") else None,
            "email_id":         str(r["email_id"]) if r.get("email_id") else None,
            "status":           r.get("status"),
            "action_taken":     r.get("action_taken"),
            "confidence":       float(r["confidence"]) if r.get("confidence") is not None else None,
            "processing_time_ms": r.get("processing_time_ms"),
            "error_message":    r.get("error_message"),
            "created_at":       r["created_at"].isoformat() if r.get("created_at") else None,
        }

    return {"agent_id": agent_id, "runs": [_ser_run(r) for r in (rows or [])], "total": len(rows or [])}


@router.get("/performance")
async def get_agent_performance(
    days: int = 7,
    current_user: dict = Depends(get_current_user),
):
    """
    Agent teljesítmény metrikák az emails tábla alapján.
    Visszaad: automated_count, manual_count, automation_rate,
              avg_confidence, time_saved_hours, top_categories, daily_trend.
    """
    tenant_id = current_user.get("tenant_id")

    # Tenant szűrés feltétele
    t_filter = "AND tenant_id=$2" if tenant_id else ""

    # ── Fő metrikák ─────────────────────────────────────────────
    stats_args = [days, tenant_id] if tenant_id else [days]
    stats = await db.fetchrow(
        f"""SELECT
              COUNT(*) FILTER (WHERE status = 'AI_ANSWERED')          AS automated_count,
              COUNT(*) FILTER (WHERE status = 'NEEDS_ATTENTION')      AS manual_count,
              AVG(confidence) FILTER (WHERE status = 'AI_ANSWERED')   AS avg_conf_auto
            FROM emails
            WHERE created_at > NOW() - INTERVAL '{days} days'
            {t_filter}""",
        *stats_args
    )

    automated = int(stats["automated_count"] or 0)
    manual    = int(stats["manual_count"]    or 0)
    total     = automated + manual
    automation_rate  = round(automated / total * 100, 1) if total else 0.0
    avg_confidence   = round(float(stats["avg_conf_auto"] or 0) * 100, 1)
    time_saved_hours = round(automated * 3 / 60, 1)

    # ── Top kategóriák ───────────────────────────────────────────
    cats_args = [days, tenant_id] if tenant_id else [days]
    cats = await db.fetch(
        f"""SELECT
              COALESCE(category, 'other') AS category,
              COUNT(*)                    AS cnt,
              ROUND(AVG(confidence)*100::numeric, 1) AS avg_conf
            FROM emails
            WHERE status = 'AI_ANSWERED'
              AND created_at > NOW() - INTERVAL '{days} days'
              {t_filter}
            GROUP BY category
            ORDER BY cnt DESC
            LIMIT 5""",
        *cats_args
    )

    # ── Napi trend ───────────────────────────────────────────────
    trend_args = [days, tenant_id] if tenant_id else [days]
    trend = await db.fetch(
        f"""SELECT
              DATE(created_at)::text                                          AS day,
              COUNT(*) FILTER (WHERE status = 'AI_ANSWERED')                  AS automated,
              COUNT(*) FILTER (WHERE status = 'NEEDS_ATTENTION')              AS manual,
              ROUND(AVG(confidence) FILTER (WHERE status='AI_ANSWERED')*100::numeric, 1) AS confidence
            FROM emails
            WHERE created_at > NOW() - INTERVAL '{days} days'
              {t_filter}
            GROUP BY day
            ORDER BY day ASC""",
        *trend_args
    )

    return {
        "automated_count":  automated,
        "manual_count":     manual,
        "automation_rate":  automation_rate,
        "avg_confidence":   avg_confidence,
        "time_saved_hours": time_saved_hours,
        "top_categories":   [
            {"category": r["category"], "count": int(r["cnt"]), "avg_confidence": float(r["avg_conf"] or 0)}
            for r in (cats or [])
        ],
        "daily_trend": [
            {
                "day":        r["day"],
                "automated":  int(r["automated"]),
                "manual":     int(r["manual"]),
                "confidence": float(r["confidence"] or 0),
            }
            for r in (trend or [])
        ],
    }
