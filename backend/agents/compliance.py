"""
Compliance Layer — policy rule evaluation.

Checks the draft classification against tenant policy rules
and may veto or override the AI decision.
"""
import logging
from dataclasses import dataclass
from typing import Optional

from agents.drafting import ClassificationOutput
from agents.intake import IntakeContext
from services.policy_engine import TAX_KEYWORDS, INVOICE_KEYWORDS

log = logging.getLogger("docuagent")


@dataclass
class ComplianceDecision:
    can_answer: bool
    status: str                 # "AI_ANSWERED" | "NEEDS_ATTENTION"
    veto_reason: Optional[str] = None
    domain_tag: Optional[str] = None   # "tax" | "invoice" | None


def _contains_keywords(text: str, keywords: list) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in keywords)


def evaluate(
    draft: ClassificationOutput,
    intake: IntakeContext,
    subject: str,
    body: str,
    policy: dict,
) -> ComplianceDecision:
    """
    Apply policy rules on top of the drafted classification.

    Rules (in priority order):
    1. Complaints never auto-reply (policy: complaint_auto_reply)
    2. auto_reply_enabled=False → always NEEDS_ATTENTION
    3. confidence < conf_threshold → NEEDS_ATTENTION
    4. Tax domain detected → NEEDS_ATTENTION (human review required)
    5. All clear → respect draft decision
    """
    conf_threshold = policy.get("conf_threshold", 0.72)
    auto_reply_enabled = policy.get("auto_reply_enabled", True)
    complaint_auto_reply = policy.get("complaint_auto_reply", False)
    tax_routing = policy.get("tax_routing_enabled", True)
    invoice_routing = policy.get("invoice_routing_enabled", True)

    full_text = f"{subject} {body or ''}"

    # ── Domain detection ──────────────────────────────────────
    domain_tag = None
    if tax_routing and _contains_keywords(full_text, TAX_KEYWORDS):
        domain_tag = "tax"
    elif invoice_routing and _contains_keywords(full_text, INVOICE_KEYWORDS):
        domain_tag = "invoice"

    # ── Rule 1: global auto-reply switch ──────────────────────
    if not auto_reply_enabled:
        return ComplianceDecision(
            can_answer=False,
            status="NEEDS_ATTENTION",
            veto_reason="auto_reply_enabled=False (policy)",
            domain_tag=domain_tag,
        )

    # ── Rule 2: complaint block ───────────────────────────────
    if draft.category == "complaint" and not complaint_auto_reply:
        return ComplianceDecision(
            can_answer=False,
            status="NEEDS_ATTENTION",
            veto_reason="complaint → human review required",
            domain_tag=domain_tag,
        )

    # ── Rule 3: low confidence ────────────────────────────────
    if draft.confidence < conf_threshold:
        return ComplianceDecision(
            can_answer=False,
            status="NEEDS_ATTENTION",
            veto_reason=f"confidence {draft.confidence:.2f} < threshold {conf_threshold}",
            domain_tag=domain_tag,
        )

    # ── Rule 4: tax domain always needs human review ──────────
    if domain_tag == "tax":
        return ComplianceDecision(
            can_answer=False,
            status="NEEDS_ATTENTION",
            veto_reason="tax domain detected — requires human review",
            domain_tag=domain_tag,
        )

    # ── Rule 5: appointment always needs human ────────────────
    if draft.category == "appointment":
        return ComplianceDecision(
            can_answer=False,
            status="NEEDS_ATTENTION",
            veto_reason="appointment → requires human scheduling",
            domain_tag=domain_tag,
        )

    # ── All clear ─────────────────────────────────────────────
    can = draft.can_answer
    return ComplianceDecision(
        can_answer=can,
        status="AI_ANSWERED" if can else "NEEDS_ATTENTION",
        domain_tag=domain_tag,
    )
