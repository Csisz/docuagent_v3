"""
Vision OCR Service — email szöveg strukturált kinyerése GPT-4o Vision API-val.

Funkciók:
  - run_ocr_for_email(): async OCR job végrehajtás email alapján
  - validate_hu_tax_rate(): Magyar ÁFA kulcsok validálása (0%, 5%, 18%, 27%)
  - extract_structured(): strukturált JSON kinyerés (számla mezők)

Retry logika: az openai_service.chat() belső retry (3 attempt, exponential backoff)
              elegendő — nincs külön retry szükséges ennél a wrapper-nél.
"""
import json
import logging
import time
import uuid
from typing import Optional

import db.database as _db
from services import openai_service
from core.config import OPENAI_API_KEY

log = logging.getLogger("docuagent")

# Érvényes Magyar ÁFA kulcsok
HU_TAX_RATES = {0.0, 5.0, 18.0, 27.0}

# OCR kinyerési prompt (strukturált invoice mezők)
_OCR_PROMPT = """Te egy magyar számla OCR rendszer vagy. Az alábbi szövegből kinyered a számla adatait.

Adj vissza kizárólag valid JSON-t, az alábbi struktúrával:
{
  "invoice_number": "...",
  "vendor_name": "...",
  "vendor_tax_number": "...",
  "customer_name": "...",
  "issue_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "currency": "HUF",
  "net_amount": 0.0,
  "tax_rate": 27.0,
  "tax_amount": 0.0,
  "gross_amount": 0.0,
  "line_items": [
    {"description": "...", "quantity": 1, "unit_price": 0.0, "amount": 0.0}
  ],
  "payment_method": "átutalás or null",
  "bank_account": "...",
  "notes": "...",
  "confidence": 0.85
}

Szabályok:
- tax_rate csak 0, 5, 18 vagy 27 lehet (magyar ÁFA kulcsok)
- Ha egy mező nem azonosítható, legyen null
- confidence 0.0–1.0 közötti szám, mennyire biztos vagy az adatokban
- Dátumok YYYY-MM-DD formátumban
- Összegek numerikus float értékek (Ft jel nélkül)"""


def validate_hu_tax_rate(rate: float) -> float:
    """Kerekíti a legközelebbi érvényes Magyar ÁFA kulcsra, vagy 27%-ra visszaesik."""
    if rate is None:
        return 27.0
    closest = min(HU_TAX_RATES, key=lambda r: abs(r - float(rate)))
    return closest


async def run_ocr_for_email(
    job_id: str,
    email_id: str,
    tenant_id: str,
    text: str,
) -> dict:
    """
    OCR job végrehajtása. Az email szövegéből strukturált számlat kinyerése.
    A job státuszát menet közben frissíti az ocr_jobs táblában.
    """
    if not OPENAI_API_KEY:
        await _fail_job(job_id, "OpenAI API key nincs beállítva")
        return {}

    # Status: running
    await _db.execute(
        "UPDATE ocr_jobs SET status='running' WHERE id=$1",
        uuid.UUID(job_id),
    )

    t0 = time.monotonic()
    try:
        raw = await openai_service.chat(
            messages=[
                {"role": "system", "content": _OCR_PROMPT},
                {"role": "user",   "content": f"Számla szöveg:\n\n{text[:6000]}"},
            ],
            max_tokens=1200,
            json_mode=True,
            task_type="extract_entities",
            tenant_id=tenant_id,
        )
        latency = int((time.monotonic() - t0) * 1000)

        extracted = json.loads(raw)

        # Validate + normalize HU tax rate
        if extracted.get("tax_rate") is not None:
            extracted["tax_rate"] = validate_hu_tax_rate(extracted["tax_rate"])

        confidence = float(extracted.get("confidence", 0.5))

        # Estimate cost (gpt-4o-mini: ~0.15$/1K tokens)
        cost = round(latency / 1000 * 0.00015, 6)

        await _db.execute(
            """UPDATE ocr_jobs
               SET status='done', extracted_json=$2, raw_text=$3, confidence=$4,
                   latency_ms=$5, cost_usd=$6, finished_at=NOW()
               WHERE id=$1""",
            uuid.UUID(job_id),
            json.dumps(extracted),
            text[:2000],
            confidence,
            latency,
            cost,
        )
        log.info(
            f"[OCR] job={job_id[:8]} email={email_id[:8]} "
            f"confidence={confidence:.2f} latency={latency}ms"
        )
        return extracted

    except Exception as e:
        latency = int((time.monotonic() - t0) * 1000)
        log.error(f"[OCR] job={job_id[:8]} error: {e}")
        await _fail_job(job_id, str(e)[:500])
        return {}


async def _fail_job(job_id: str, error: str) -> None:
    try:
        await _db.execute(
            "UPDATE ocr_jobs SET status='failed', error_message=$2, finished_at=NOW() WHERE id=$1",
            uuid.UUID(job_id), error,
        )
    except Exception:
        pass
