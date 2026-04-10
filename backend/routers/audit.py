"""
Audit Trail — compliance napló lekérdezés.
"""
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends

from core.security import get_current_user
import db.audit_queries as aq

router = APIRouter(prefix="/api/audit", tags=["Audit"])
log = logging.getLogger("docuagent")


@router.get("")
async def list_audit(
    limit:       int            = 50,
    offset:      int            = 0,
    entity_type: Optional[str]  = None,
    action:      Optional[str]  = None,
    user_email:  Optional[str]  = None,
    current_user: dict          = Depends(get_current_user),
):
    """Audit napló lista, tenant_id szűréssel, legújabb először."""
    tenant_id = current_user.get("tenant_id")

    rows, total = await aq.list_audit_logs(
        tenant_id=tenant_id,
        limit=limit,
        offset=offset,
        entity_type=entity_type or None,
        action=action or None,
        user_email=user_email or None,
    )

    def _parse_details(val):
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return {}
        return val or {}

    return {
        "logs": [
            {
                "id":          str(r["id"]),
                "tenant_id":   str(r["tenant_id"]) if r["tenant_id"] else None,
                "user_id":     str(r["user_id"]) if r["user_id"] else None,
                "user_email":  r["user_email"],
                "action":      r["action"],
                "entity_type": r["entity_type"],
                "entity_id":   r["entity_id"],
                "details":     _parse_details(r["details"]),
                "created_at":  r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ],
        "total":  total,
        "limit":  limit,
        "offset": offset,
    }
