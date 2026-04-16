"""
Policy Engine — per-tenant rule management.

BASE_POLICY defines system-wide defaults.
get_policy(tenant_id) merges DB overrides on top.
"""
import logging
from typing import Optional
import db.database as _db

log = logging.getLogger("docuagent")

# ── Keyword lists ─────────────────────────────────────────────

TAX_KEYWORDS = [
    "nav", "kata", "áfa", "szja", "adó", "bevallás",
    "adóhatóság", "iparűzési", "hipa", "társasági adó",
    "eva", "adóellenőrzés", "adóbevallás",
]

INVOICE_KEYWORDS = [
    "számla", "díjbekérő", "fizetés", "tartozás", "kiegyenlítés",
    "számlakorrekció", "stornó", "jóváírás", "számlaegyenleg",
    "fizetési felszólítás", "invoice", "payment", "bill",
]

# ── Default policy ────────────────────────────────────────────

BASE_POLICY: dict = {
    # Classification thresholds
    "conf_threshold":           0.72,   # below this → NEEDS_ATTENTION
    "auto_reply_enabled":       True,   # allow AI_ANSWERED status
    "complaint_auto_reply":     False,  # complaints always → human

    # Model routing
    "use_smart_model_for_reply": True,  # gpt-4o for high-conf replies
    "smart_model_threshold":     0.80,  # conf above this → gpt-4o

    # Case auto-link
    "case_autolink_enabled":    True,
    "case_autolink_urgency_min": 50,    # urgency >= this → auto-link/create

    # Entity extraction
    "entity_extraction_enabled": True,

    # Domain-specific routing
    "tax_routing_enabled":      True,
    "invoice_routing_enabled":  True,

    # Feedback learning
    "learning_enabled":         True,
    "learning_override_threshold": 0.85,
}


def _cast(value: str, reference):
    """Cast DB string to match the type of reference (bool / int / float / str)."""
    if isinstance(reference, bool):
        return value.lower() in ("true", "1", "yes")
    if isinstance(reference, int):
        return int(value)
    if isinstance(reference, float):
        return float(value)
    return value


async def get_policy(tenant_id: Optional[str] = None) -> dict:
    """
    Returns the effective policy for the given tenant.
    Starts with BASE_POLICY and applies DB overrides from policy_overrides.
    Falls back to BASE_POLICY if tenant_id is None or DB errors.
    """
    policy = dict(BASE_POLICY)

    if not tenant_id:
        return policy

    try:
        rows = await _db.fetch(
            "SELECT rule_key, rule_value FROM policy_overrides WHERE tenant_id=$1",
            tenant_id,
        )
        for row in rows:
            key = row["rule_key"]
            val = row["rule_value"]
            if key in policy:
                try:
                    policy[key] = _cast(val, BASE_POLICY[key])
                except (ValueError, TypeError):
                    log.warning(f"policy_overrides: bad cast for {key}={val!r}, using default")
            else:
                policy[key] = val
    except Exception as e:
        log.warning(f"policy_engine: DB read failed, using BASE_POLICY ({e})")

    return policy
