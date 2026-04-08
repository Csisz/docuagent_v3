"""
Demo Sandbox — reset endpoint sales demo célra.
"""
import logging
from fastapi import APIRouter, HTTPException, Depends

from core.security import get_current_user
from db.demo_data import DEMO_TENANT_SLUG, reset_demo_data
import db.auth_queries as aq

router = APIRouter(prefix="/api/demo", tags=["Demo"])
log = logging.getLogger("docuagent")


@router.post("/reset")
async def demo_reset(current_user: dict = Depends(get_current_user)):
    """
    Demo adatok visszaállítása.
    Csak a 'demo' slug-ú tenant engedélyezett.
    """
    tenant_slug = current_user.get("tenant_slug", "")
    if tenant_slug != DEMO_TENANT_SLUG:
        raise HTTPException(403, "Ez a művelet csak a demo fiókban érhető el")

    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(400, "Tenant azonosító hiányzik")

    stats = await reset_demo_data(tenant_id)
    log.info(f"Demo reset by user={current_user.get('email')} tenant={tenant_id}")
    return {
        "status":  "ok",
        "message": "Demo adatok visszaállítva",
        "stats":   stats,
    }
