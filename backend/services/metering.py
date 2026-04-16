"""
Usage metering per tenant per billing period.

All writes are fire-and-forget (non-blocking).
Quota checks are synchronous and called before agent layers.
"""
import logging
from datetime import date, timedelta
from typing import Optional, Tuple

import db.database as _db

log = logging.getLogger("docuagent")

# Plan-level default quotas (fallback if tenant_quotas row missing)
_DEFAULT_QUOTAS = {
    "starter":    {"max_emails_per_month": 500,  "max_documents": 50,  "max_ai_calls_per_month": 1000,  "max_tokens_per_month": 500_000},
    "pro":        {"max_emails_per_month": 2000, "max_documents": 200, "max_ai_calls_per_month": 5000,  "max_tokens_per_month": 2_000_000},
    "enterprise": {"max_emails_per_month": 0,    "max_documents": 0,   "max_ai_calls_per_month": 0,     "max_tokens_per_month": 0},  # 0 = unlimited
}

FIELD_MAP = {
    "emails_processed": "emails_processed",
    "ai_calls_made":    "ai_calls_made",
    "tokens_consumed":  "tokens_consumed",
    "cost_usd":         "cost_usd",
    "documents_stored": "documents_stored",
    "rag_queries":      "rag_queries",
}


def _period() -> Tuple[date, date]:
    """Current billing period: 1st of month → last day of month."""
    today = date.today()
    start = today.replace(day=1)
    if today.month == 12:
        end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
    return start, end


async def increment_usage(tenant_id: str, field: str, value: float = 1.0) -> None:
    """
    Upsert usage record for the current billing period.
    Fire-and-forget — caller does not await this in practice,
    but it IS async so callers can optionally await it.
    """
    if field not in FIELD_MAP:
        log.warning(f"metering: unknown field {field!r}")
        return

    col = FIELD_MAP[field]
    start, end = _period()

    try:
        await _db.execute(
            f"""INSERT INTO usage_records (tenant_id, period_start, period_end, {col})
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (tenant_id, period_start) DO UPDATE
                  SET {col} = usage_records.{col} + EXCLUDED.{col},
                      updated_at = NOW()""",
            tenant_id, start, end, value,
        )
    except Exception as e:
        log.debug(f"metering increment failed: {e}")


async def get_usage_summary(tenant_id: str) -> dict:
    """Return usage + quota for the current billing period."""
    start, _ = _period()

    usage_row = await _db.fetchrow(
        "SELECT * FROM usage_records WHERE tenant_id=$1 AND period_start=$2",
        tenant_id, start,
    )
    quota_row = await _db.fetchrow(
        "SELECT * FROM tenant_quotas WHERE tenant_id=$1", tenant_id
    )

    plan = (quota_row["plan"] if quota_row else "starter") or "starter"
    defaults = _DEFAULT_QUOTAS.get(plan, _DEFAULT_QUOTAS["starter"])

    def _q(key: str) -> int:
        if quota_row and quota_row.get(key) is not None:
            return quota_row[key]
        return defaults.get(key, 0)

    return {
        "period_start": start.isoformat(),
        "plan": plan,
        "usage": {
            "emails_processed": usage_row["emails_processed"] if usage_row else 0,
            "ai_calls_made":    usage_row["ai_calls_made"]    if usage_row else 0,
            "tokens_consumed":  usage_row["tokens_consumed"]  if usage_row else 0,
            "cost_usd":         round(usage_row["cost_usd"] or 0, 4) if usage_row else 0,
            "documents_stored": usage_row["documents_stored"] if usage_row else 0,
            "rag_queries":      usage_row["rag_queries"]      if usage_row else 0,
        },
        "quotas": {
            "max_emails_per_month":   _q("max_emails_per_month"),
            "max_documents":          _q("max_documents"),
            "max_ai_calls_per_month": _q("max_ai_calls_per_month"),
            "max_tokens_per_month":   _q("max_tokens_per_month"),
            "allow_premium_model":    quota_row["allow_premium_model"] if quota_row else False,
        },
    }


async def check_quota(tenant_id: str, resource: str) -> Tuple[bool, int]:
    """
    Check if tenant can use more of `resource`.

    resource: "emails" | "ai_calls" | "tokens"
    Returns (allowed: bool, remaining: int).
    0 remaining means at limit. -1 means unlimited (enterprise).
    """
    summary = await get_usage_summary(tenant_id)
    usage   = summary["usage"]
    quotas  = summary["quotas"]

    if resource == "emails":
        limit = quotas["max_emails_per_month"]
        used  = usage["emails_processed"]
    elif resource == "ai_calls":
        limit = quotas["max_ai_calls_per_month"]
        used  = usage["ai_calls_made"]
    elif resource == "tokens":
        limit = quotas["max_tokens_per_month"]
        used  = usage["tokens_consumed"]
    else:
        return True, -1

    if limit == 0:  # unlimited (enterprise)
        return True, -1

    remaining = max(0, limit - used)
    return remaining > 0, remaining
