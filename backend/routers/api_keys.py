"""
Tenant API key management.

POST   /api/keys/generate          – admin: generate new key for own tenant
GET    /api/keys                   – list active keys (prefix only, never raw)
DELETE /api/keys/{key_prefix}      – soft-delete by prefix
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

import db.database as _db
from core.security import get_current_user, generate_api_key

router = APIRouter(prefix="/api/keys", tags=["API Keys"])
log    = logging.getLogger("docuagent")


class GenerateKeyRequest(BaseModel):
    label: Optional[str] = None


@router.post("/generate")
async def create_api_key(
    body: GenerateKeyRequest,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Csak admin generálhat API kulcsot")

    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Nincs tenant_id a tokenben")

    result = await generate_api_key(tenant_id, body.label)
    log.info(f"API key generated: prefix={result['prefix']} tenant={tenant_id}")
    return result


@router.get("")
async def list_api_keys(user: dict = Depends(get_current_user)):
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Nincs tenant_id a tokenben")

    rows = await _db.fetch(
        """SELECT key_prefix, label, is_active, last_used, created_at
           FROM tenant_api_keys
           WHERE tenant_id=$1 AND is_active=TRUE
           ORDER BY created_at DESC""",
        tenant_id,
    )
    return [
        {
            "prefix":     r["key_prefix"],
            "label":      r["label"],
            "last_used":  r["last_used"].isoformat() if r["last_used"] else None,
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


@router.delete("/{key_prefix}")
async def revoke_api_key(
    key_prefix: str,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Csak admin törölhet API kulcsot")

    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Nincs tenant_id a tokenben")

    result = await _db.execute(
        """UPDATE tenant_api_keys SET is_active=FALSE
           WHERE key_prefix=$1 AND tenant_id=$2 AND is_active=TRUE""",
        key_prefix, tenant_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Kulcs nem található")

    log.info(f"API key revoked: prefix={key_prefix} tenant={tenant_id}")
    return {"status": "revoked", "prefix": key_prefix}
