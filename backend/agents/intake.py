"""
Intake Layer — entity extraction from inbound email.

Runs concurrently with knowledge.py retrieval.
Extracts: invoice_ids, dates, amounts, company_names, urgency_signals.
"""
import json
import logging
from dataclasses import dataclass, field
from typing import Optional
from services import openai_service

log = logging.getLogger("docuagent")

_EXTRACT_SYSTEM = """You are an entity extractor. Extract named entities from the email text.
Respond ONLY with valid JSON matching this schema:
{
  "invoice_ids": ["string"],
  "dates": ["string"],
  "amounts": ["string"],
  "company_names": ["string"],
  "urgency_signals": ["string"]
}

Rules:
- invoice_ids: any invoice number, order ID, reference number (e.g. "INV-2024-001", "SZ-123")
- dates: explicit dates or deadlines mentioned (e.g. "2024-03-15", "March 15", "határidő: április 5")
- amounts: monetary values (e.g. "€500", "50 000 Ft", "1.200 EUR")
- company_names: organization names mentioned (not the sender's own company)
- urgency_signals: words/phrases that signal urgency (e.g. "sürgős", "azonnal", "lejárt", "urgent", "asap")
- If none found for a category, return empty array []
"""


@dataclass
class IntakeContext:
    invoice_ids: list = field(default_factory=list)
    dates: list = field(default_factory=list)
    amounts: list = field(default_factory=list)
    company_names: list = field(default_factory=list)
    urgency_signals: list = field(default_factory=list)
    raw_entities: dict = field(default_factory=dict)


async def process(
    subject: str,
    body: str,
    policy: dict,
    tenant_id: Optional[str] = None,
) -> IntakeContext:
    """
    Extract entities from email subject + body using GPT-4o-mini.
    Returns empty IntakeContext if extraction is disabled or fails.
    """
    if not policy.get("entity_extraction_enabled", True):
        return IntakeContext()

    text = f"Subject: {subject}\n\n{(body or '')[:2000]}"

    try:
        raw = await openai_service.chat(
            [
                {"role": "system", "content": _EXTRACT_SYSTEM},
                {"role": "user",   "content": text},
            ],
            max_tokens=300,
            json_mode=True,
            task_type="extract_entities",
            model=openai_service.MODEL_MINI,
            tenant_id=tenant_id,
        )
        parsed = json.loads(raw)
        return IntakeContext(
            invoice_ids=parsed.get("invoice_ids", []),
            dates=parsed.get("dates", []),
            amounts=parsed.get("amounts", []),
            company_names=parsed.get("company_names", []),
            urgency_signals=parsed.get("urgency_signals", []),
            raw_entities=parsed,
        )
    except Exception as e:
        log.warning(f"Intake entity extraction failed: {e}")
        return IntakeContext()
