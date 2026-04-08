"""
Onboarding Wizard — tenant beállítási folyamat állapotkezelése.

Endpointok:
  GET  /api/onboarding/state    → aktuális állapot lekérése
  POST /api/onboarding/step     → lépés mentése + előrelépés
  POST /api/onboarding/complete → onboarding lezárása
"""
import json
import logging
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security import get_current_user
import db.queries as q

router = APIRouter(prefix="/api/onboarding", tags=["Onboarding"])
log = logging.getLogger("docuagent")

TOTAL_STEPS = 5


# ── Pydantic modellek ─────────────────────────────────────────

class StepRequest(BaseModel):
    step: int
    data: Optional[dict] = {}


# ── Segédfüggvény ─────────────────────────────────────────────

def _serialize(row) -> dict:
    if not row:
        return None
    d = dict(row)
    for k in ("id", "tenant_id"):
        if d.get(k) is not None:
            d[k] = str(d[k])
    for k in ("created_at", "updated_at", "completed_at"):
        if d.get(k) is not None:
            d[k] = d[k].isoformat()
    if isinstance(d.get("metadata"), str):
        try:
            d["metadata"] = json.loads(d["metadata"])
        except Exception:
            d["metadata"] = {}
    if d.get("completed_steps") is None:
        d["completed_steps"] = []
    d["is_complete"] = d.get("completed_at") is not None
    d["total_steps"] = TOTAL_STEPS
    return d


# ── Endpointok ────────────────────────────────────────────────

@router.get("/state")
async def get_state(current_user: dict = Depends(get_current_user)):
    """Onboarding állapot lekérése. Ha nincs még bejegyzés, üres állapotot ad vissza."""
    tenant_id = current_user["tenant_id"]
    row = await q.get_onboarding_state(tenant_id)

    if not row:
        # Első lekérés: automatikusan létrehozza az állapotot
        row = await q.upsert_onboarding_state(tenant_id, 1, [], {})

    return {"onboarding": _serialize(row)}


@router.post("/step")
async def save_step(
    req: StepRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Egy lépés adatait menti, és előrelép a következő lépésre.
    Ha a step >= TOTAL_STEPS, az onboarding lezárható.
    """
    if req.step < 1 or req.step > TOTAL_STEPS:
        raise HTTPException(400, f"Érvénytelen lépés: {req.step} (1-{TOTAL_STEPS} között kell lennie)")

    tenant_id = current_user["tenant_id"]
    row = await q.get_onboarding_state(tenant_id)

    existing_meta      = {}
    existing_completed = []

    if row:
        if row.get("completed_at"):
            return {"onboarding": _serialize(row)}
        existing_meta      = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else (dict(row["metadata"]) if row["metadata"] else {})
        existing_completed = list(row["completed_steps"] or [])

    # Lépés adatainak merge-elése
    merged_meta = {**existing_meta, f"step_{req.step}": req.data or {}}

    # completed_steps frissítése
    if req.step not in existing_completed:
        existing_completed.append(req.step)
    existing_completed.sort()

    # Következő lépés
    next_step = req.step + 1 if req.step < TOTAL_STEPS else TOTAL_STEPS

    updated = await q.upsert_onboarding_state(
        tenant_id, next_step, existing_completed, merged_meta
    )

    log.info(f"Onboarding step {req.step} saved: tenant={tenant_id} next={next_step}")
    return {"onboarding": _serialize(updated)}


@router.post("/complete")
async def complete_onboarding(current_user: dict = Depends(get_current_user)):
    """Onboarding végleges lezárása. Utána a felhasználó a dashboardra kerül."""
    tenant_id = current_user["tenant_id"]
    row = await q.get_onboarding_state(tenant_id)

    if not row:
        # Ha valahogy kihagyták az állapot létrehozását
        await q.upsert_onboarding_state(
            tenant_id, TOTAL_STEPS,
            list(range(1, TOTAL_STEPS + 1)), {}
        )

    completed = await q.complete_onboarding(tenant_id)
    log.info(f"Onboarding completed: tenant={tenant_id}")
    return {"onboarding": _serialize(completed)}
