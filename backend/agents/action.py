"""
Action Layer — persist classification results + case auto-linking.

Writes final status to DB and optionally links the email to a CRM case.
"""
import logging
import uuid
from dataclasses import dataclass, field
from typing import Optional

import db.queries as q
import db.database as _db
from agents.drafting import ClassificationOutput, DraftResult
from agents.compliance import ComplianceDecision
from agents.intake import IntakeContext

log = logging.getLogger("docuagent")


@dataclass
class ActionResult:
    email_updated: bool = False
    case_id: Optional[str] = None
    case_linked: bool = False
    case_created: bool = False


def _extract_domain(sender: str) -> Optional[str]:
    """Extract domain from 'Name <email@domain.com>' or 'email@domain.com'."""
    if not sender:
        return None
    # strip display name
    if "<" in sender and ">" in sender:
        sender = sender[sender.index("<") + 1: sender.index(">")]
    sender = sender.strip().lower()
    if "@" in sender:
        return sender.split("@", 1)[1]
    return None


async def _find_open_case_for_domain(tenant_id: str, domain: str) -> Optional[str]:
    """Find the most recent open case for this sender domain."""
    try:
        row = await _db.fetchrow(
            """SELECT c.id FROM crm_cases c
               JOIN crm_contacts ct ON ct.id = c.contact_id
               WHERE c.tenant_id = $1
                 AND c.status IN ('open', 'in_progress')
                 AND ct.email ILIKE $2
               ORDER BY c.created_at DESC
               LIMIT 1""",
            tenant_id, f"%@{domain}",
        )
        return str(row["id"]) if row else None
    except Exception as e:
        log.warning(f"Case domain lookup failed: {e}")
        return None


async def _find_contact_id_for_sender(tenant_id: str, sender: str) -> Optional[str]:
    """Find CRM contact ID matching this exact sender email."""
    if not sender:
        return None
    try:
        # strip display name
        email = sender
        if "<" in sender and ">" in sender:
            email = sender[sender.index("<") + 1: sender.index(">")].strip()
        row = await _db.fetchrow(
            "SELECT id FROM crm_contacts WHERE tenant_id=$1 AND LOWER(email)=LOWER($2) LIMIT 1",
            tenant_id, email,
        )
        return str(row["id"]) if row else None
    except Exception as e:
        log.warning(f"Contact lookup failed: {e}")
        return None


async def _create_case_for_sender(tenant_id: str, subject: str, sender: str,
                                   email_id: Optional[str]) -> Optional[str]:
    """Create a new CRM case for the sender (contact must exist or will be None)."""
    try:
        contact_id = await _find_contact_id_for_sender(tenant_id, sender)
        case_id = str(uuid.uuid4())
        title = subject[:120] if subject else "Bejövő email"
        await _db.execute(
            """INSERT INTO crm_cases
               (id, tenant_id, contact_id, title, status, priority, created_at)
               VALUES ($1, $2, $3, $4, 'open', 'normal', NOW())""",
            case_id, tenant_id, contact_id, title,
        )
        log.info(f"Action: auto-created case {case_id} for sender {sender!r}")
        return case_id
    except Exception as e:
        log.warning(f"Case auto-create failed: {e}")
        return None


async def _link_email_to_case(case_id: str, email_id: str) -> bool:
    """Insert case_emails record."""
    try:
        await _db.execute(
            """INSERT INTO case_emails (case_id, email_id, linked_by)
               VALUES ($1, $2, 'auto')
               ON CONFLICT DO NOTHING""",
            case_id, email_id,
        )
        return True
    except Exception as e:
        log.warning(f"Email-case link failed: {e}")
        return False


async def execute(
    email_id: Optional[str],
    subject: str,
    sender: str,
    draft: DraftResult,
    compliance: ComplianceDecision,
    intake: IntakeContext,
    policy: dict,
    tenant_id: Optional[str] = None,
) -> ActionResult:
    """
    1. Persist classification to DB (update_email_classification)
    2. If urgency >= case_autolink_urgency_min and case_autolink_enabled:
       - Find open case for sender domain
       - If none: create new case
       - Link email to case
    """
    result = ActionResult()
    out = draft.output

    # ── 1. DB update ─────────────────────────────────────────
    if email_id:
        try:
            from models.schemas import AiDecision
            decision_dict = {
                "can_answer": out.can_answer,
                "confidence": out.confidence,
                "reason": compliance.veto_reason or out.reason,
                "urgency_score": out.urgency_score,
                "sentiment": out.sentiment,
            }
            await q.update_email_classification(
                email_id,
                out.category,
                compliance.status,
                decision_dict,
                out.confidence,
                urgency_score=out.urgency_score,
                sentiment=out.sentiment,
            )
            # Propagate senior_required flag to emails table
            if compliance.senior_required:
                try:
                    await _db.execute(
                        "UPDATE emails SET senior_required=TRUE WHERE id=$1",
                        email_id,
                    )
                except Exception:
                    pass
            result.email_updated = True
        except Exception as e:
            log.error(f"Action DB update failed: {e}")

    # ── 2. Case auto-link ─────────────────────────────────────
    autolink_enabled = policy.get("case_autolink_enabled", True)
    urgency_min = policy.get("case_autolink_urgency_min", 50)

    if (
        autolink_enabled
        and tenant_id
        and email_id
        and out.urgency_score >= urgency_min
    ):
        domain = _extract_domain(sender)
        case_id = None

        if domain:
            case_id = await _find_open_case_for_domain(tenant_id, domain)

        if not case_id:
            case_id = await _create_case_for_sender(tenant_id, subject, sender, email_id)
            result.case_created = bool(case_id)

        if case_id:
            linked = await _link_email_to_case(case_id, email_id)
            result.case_id = case_id
            result.case_linked = linked

    return result
