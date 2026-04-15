"""
AI Gateway — modell routing statisztikák.
"""
import logging
from fastapi import APIRouter, Depends
from core.security import get_current_user
import db.database as _db

router = APIRouter(prefix="/api/gateway", tags=["AI Gateway"])
log = logging.getLogger("docuagent")

MODEL_MINI  = "gpt-4o-mini"
MODEL_SMART = "gpt-4o"

# Cost per 1K token (input+output átlag)
_COST_PER_1K = {
    MODEL_MINI:  0.00015,
    MODEL_SMART: 0.005,
}


@router.get("/stats")
async def gateway_stats(
    days: int = 7,
    current_user: dict = Depends(get_current_user),
):
    """
    AI Gateway statisztikák az utolsó N napra.
    Visszaad: total_calls, mini_calls, smart_calls, estimated_cost_usd,
    daily breakdown, task_type breakdown.
    """
    import uuid as _uuid
    tenant_id = current_user.get("tenant_id")

    try:
        tid = _uuid.UUID(tenant_id) if tenant_id else None
    except Exception:
        tid = None

    # Összesítő
    totals = await _db.fetch(
        """SELECT model,
                  COUNT(*)::INT          AS calls,
                  COALESCE(SUM(tokens_used), 0)::INT AS tokens,
                  COALESCE(SUM(cost_usd), 0)         AS cost
           FROM ai_usage_log
           WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
             AND ($2::uuid IS NULL OR tenant_id = $2)
           GROUP BY model""",
        str(days), tid,
    )

    mini_calls  = 0
    smart_calls = 0
    mini_tokens = 0
    smart_tokens = 0
    total_cost  = 0.0

    for row in (totals or []):
        if row["model"] == MODEL_MINI:
            mini_calls   = row["calls"]
            mini_tokens  = row["tokens"]
        else:
            smart_calls  = row["calls"]
            smart_tokens = row["tokens"]
        total_cost += float(row["cost"])

    total_calls = mini_calls + smart_calls

    # Task-type breakdown
    by_task = await _db.fetch(
        """SELECT task_type, COUNT(*)::INT AS calls
           FROM ai_usage_log
           WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
             AND ($2::uuid IS NULL OR tenant_id = $2)
           GROUP BY task_type
           ORDER BY calls DESC""",
        str(days), tid,
    )

    # Napi trend
    daily = await _db.fetch(
        """SELECT DATE(created_at)::TEXT AS day,
                  COUNT(*) FILTER (WHERE model = $3)::INT AS mini,
                  COUNT(*) FILTER (WHERE model != $3)::INT AS smart
           FROM ai_usage_log
           WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
             AND ($2::uuid IS NULL OR tenant_id = $2)
           GROUP BY day ORDER BY day ASC""",
        str(days), tid, MODEL_MINI,
    )

    return {
        "days":              days,
        "total_calls":       total_calls,
        "mini_calls":        mini_calls,
        "smart_calls":       smart_calls,
        "mini_tokens":       mini_tokens,
        "smart_tokens":      smart_tokens,
        "estimated_cost_usd": round(total_cost, 4),
        "by_task": [
            {"task_type": r["task_type"], "calls": r["calls"]}
            for r in (by_task or [])
        ],
        "daily": [
            {"day": r["day"], "mini": r["mini"], "smart": r["smart"]}
            for r in (daily or [])
        ],
    }
