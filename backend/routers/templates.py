"""
Template Library — iparág-specifikus AI ügynök sablonok.
"""
import json
import logging
from fastapi import APIRouter, HTTPException, Depends

import db.database as db
from core.security import get_current_user

router = APIRouter(prefix="/api/templates", tags=["Templates"])
log = logging.getLogger("docuagent")


def _serialize(row) -> dict:
    cfg = row["config"]
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except Exception:
            cfg = {}
    return {
        "id":          str(row["id"]),
        "name":        row["name"],
        "category":    row["category"],
        "description": row["description"] or "",
        "config":      cfg,
        "is_default":  row["is_default"],
        "created_at":  row["created_at"].isoformat() if row["created_at"] else "",
    }


@router.get("")
async def list_templates():
    """Összes elérhető sablon visszaadása."""
    rows = await db.fetch(
        "SELECT * FROM agent_templates ORDER BY created_at ASC"
    )
    return {"templates": [_serialize(r) for r in (rows or [])]}


@router.post("/{template_id}/apply")
async def apply_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Sablon alkalmazása a tenant konfigurációjára.
    Elmenti az agent.template_id, agent.reply_style, agent.confidence_threshold
    értékeket a config táblába a tenant_id-vel.
    """
    row = await db.fetchrow(
        "SELECT * FROM agent_templates WHERE id=$1", template_id
    )
    if not row:
        raise HTTPException(404, "Sablon nem található")

    tenant_id = current_user.get("tenant_id")
    cfg = row["config"]
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except Exception:
            cfg = {}

    # Config értékek mentése a config táblába (tenant scope)
    entries = {
        "agent.template_id":           template_id,
        "agent.template_name":         row["name"],
        "agent.template_category":     row["category"],
        "agent.reply_style":           cfg.get("reply_style", "formal"),
        "agent.confidence_threshold":  str(cfg.get("confidence_threshold", 0.75)),
        "agent.language":              cfg.get("language", "hu"),
    }

    for key, value in entries.items():
        await db.execute(
            """INSERT INTO config (tenant_id, key, value)
               VALUES ($1, $2, $3)
               ON CONFLICT (tenant_id, key) DO UPDATE SET value=$3, updated_at=NOW()""",
            tenant_id, key, value
        )

    log.info(f"Template applied: {row['name']} ({template_id}) by tenant={tenant_id}")
    return {
        "status":      "ok",
        "template_id": template_id,
        "name":        row["name"],
        "category":    row["category"],
        "applied":     list(entries.keys()),
    }
