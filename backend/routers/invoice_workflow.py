"""
Invoice extraction workflow — Hungarian moat feature.

Extracts structured invoice data from email body using GPT-4o-mini.
Stores result in invoice_extractions table.
Does NOT call Billingo API (Phase 7 integration).
"""
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security import get_current_user
from services import openai_service
import db.database as _db
import db.run_queries as rq

router = APIRouter(prefix="/api/invoice-workflow", tags=["Invoice Workflow"])
log = logging.getLogger("docuagent")


_EXTRACT_SYSTEM = """You are a Hungarian invoice data extractor.

Extract structured invoice data from the email text.
Respond ONLY with valid JSON matching this schema:
{
  "invoice_number": "string or null",
  "vendor_name": "string or null",
  "amount": number or null,
  "currency": "HUF" or "EUR" or "USD",
  "due_date": "YYYY-MM-DD or null",
  "issue_date": "YYYY-MM-DD or null",
  "vat_amount": number or null,
  "confidence": 0.0-1.0
}

Rules:
- invoice_number: look for "számla", "számlaszám", "szt.", "INV-", reference numbers
- vendor_name: the company issuing the invoice (not the recipient)
- amount: gross amount (with VAT), as a number without formatting
- currency: default HUF if not specified
- due_date: payment deadline ("fizetési határidő", "esedékes")
- issue_date: issue date of the invoice ("kelt", "kiállítás dátuma")
- vat_amount: ÁFA amount if explicitly stated
- confidence: how confident you are (0.0-1.0) that this is actually an invoice email
- If a field cannot be determined, use null
"""


class ExtractRequest(BaseModel):
    email_id: str


class VerifyRequest(BaseModel):
    invoice_number: Optional[str] = None
    vendor_name:    Optional[str] = None
    amount:         Optional[float] = None
    currency:       str = "HUF"
    due_date:       Optional[str] = None
    issue_date:     Optional[str] = None
    vat_amount:     Optional[float] = None


@router.post("/extract")
async def extract_invoice(
    req: ExtractRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Extract structured invoice data from an email.
    Stores result in invoice_extractions table.
    """
    tenant_id = current_user["tenant_id"]

    # Load email
    email = await _db.fetchrow(
        "SELECT * FROM emails WHERE id=$1 AND tenant_id=$2",
        req.email_id, tenant_id,
    )
    if not email:
        raise HTTPException(404, "Email nem található")

    # Check if extraction already exists
    existing = await _db.fetchrow(
        "SELECT * FROM invoice_extractions WHERE email_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1",
        req.email_id, tenant_id,
    )
    if existing and existing["status"] in ("extracted", "verified"):
        return {"extraction": _serialize(existing), "cached": True}

    # Create agent run
    run_id = await rq.create_run(
        tenant_id=tenant_id,
        trigger_type="invoice_extract",
        trigger_ref=req.email_id,
        input_summary=f"Subject: {str(email['subject'])[:80]}",
    )

    text = f"Subject: {email['subject']}\n\n{email['body'] or ''}"

    import time
    t_start = time.monotonic()

    try:
        raw = await openai_service.chat(
            [
                {"role": "system", "content": _EXTRACT_SYSTEM},
                {"role": "user",   "content": text[:4000]},
            ],
            max_tokens=400,
            json_mode=True,
            task_type="extract_entities",
            model=openai_service.MODEL_MINI,
            tenant_id=tenant_id,
        )
        parsed = json.loads(raw)
    except Exception as e:
        latency_ms = int((time.monotonic() - t_start) * 1000)
        await rq.finish_run(run_id, "failed", latency_ms=latency_ms, error_message=str(e))
        raise HTTPException(500, f"Kinyerés sikertelen: {e}")

    latency_ms = int((time.monotonic() - t_start) * 1000)

    # Parse dates safely
    def _parse_date(v):
        if not v:
            return None
        try:
            from datetime import date
            return date.fromisoformat(str(v))
        except Exception:
            return None

    extraction_id = str(uuid.uuid4())
    confidence = float(parsed.get("confidence") or 0.0)

    await _db.execute(
        """INSERT INTO invoice_extractions
           (id, tenant_id, email_id, invoice_number, vendor_name, amount, currency,
            due_date, issue_date, vat_amount, raw_extraction, confidence, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'extracted')""",
        extraction_id, tenant_id, req.email_id,
        parsed.get("invoice_number"),
        parsed.get("vendor_name"),
        parsed.get("amount"),
        parsed.get("currency", "HUF"),
        _parse_date(parsed.get("due_date")),
        _parse_date(parsed.get("issue_date")),
        parsed.get("vat_amount"),
        json.dumps(parsed),
        confidence,
    )

    await rq.finish_run(
        run_id, "success", latency_ms=latency_ms,
        result_summary=f"invoice_number={parsed.get('invoice_number')} conf={confidence:.2f}",
    )

    row = await _db.fetchrow(
        "SELECT * FROM invoice_extractions WHERE id=$1", extraction_id
    )
    return {"extraction": _serialize(row), "cached": False}


@router.get("/email/{email_id}")
async def get_invoice_for_email(
    email_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get the most recent invoice extraction for an email."""
    tenant_id = current_user["tenant_id"]
    row = await _db.fetchrow(
        "SELECT * FROM invoice_extractions WHERE email_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1",
        email_id, tenant_id,
    )
    if not row:
        return {"extraction": None}
    return {"extraction": _serialize(row)}


@router.post("/{extraction_id}/verify")
async def verify_invoice(
    extraction_id: str,
    req: VerifyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Save verified/corrected invoice data."""
    tenant_id = current_user["tenant_id"]

    row = await _db.fetchrow(
        "SELECT * FROM invoice_extractions WHERE id=$1 AND tenant_id=$2",
        extraction_id, tenant_id,
    )
    if not row:
        raise HTTPException(404, "Kinyerés nem található")

    def _parse_date(v):
        if not v:
            return None
        try:
            from datetime import date
            return date.fromisoformat(str(v))
        except Exception:
            return None

    await _db.execute(
        """UPDATE invoice_extractions
           SET invoice_number=$1, vendor_name=$2, amount=$3, currency=$4,
               due_date=$5, issue_date=$6, vat_amount=$7, status='verified'
           WHERE id=$8""",
        req.invoice_number, req.vendor_name, req.amount, req.currency,
        _parse_date(req.due_date), _parse_date(req.issue_date),
        req.vat_amount, extraction_id,
    )
    updated = await _db.fetchrow("SELECT * FROM invoice_extractions WHERE id=$1", extraction_id)
    return {"extraction": _serialize(updated)}


def _serialize(row) -> dict:
    if not row:
        return {}
    d = dict(row)
    for k in ("due_date", "issue_date", "created_at"):
        if d.get(k) is not None:
            try:
                d[k] = d[k].isoformat()
            except Exception:
                pass
    if "raw_extraction" in d and isinstance(d["raw_extraction"], str):
        try:
            d["raw_extraction"] = json.loads(d["raw_extraction"])
        except Exception:
            pass
    for key in ("id", "tenant_id", "email_id", "document_id"):
        if key in d and d[key] is not None:
            d[key] = str(d[key])
    return d
