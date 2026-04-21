"""
Google Calendar integráció — naptár esemény kezelés.

Endpointok:
  GET    /api/calendar/events               → lista (tenant, dátum szűrés)
  POST   /api/calendar/create               → új manuális esemény + n8n webhook
  POST   /api/calendar/link-google          → google_event_id visszaírás (n8n callback)
  DELETE /api/calendar/events/{id}          → esemény törlése
  POST   /api/calendar/book-from-email      → AI-alapú időpont kinyerés emailből
  POST   /api/calendar/sync                 → Google Calendar upsert (n8n WF4)
"""
import json
import logging
import httpx
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.security import get_current_user
from core.config import OPENAI_API_KEY, N8N_CALENDAR_WEBHOOK, N8N_CALENDAR_SYNC_WEBHOOK
from services import openai_service
import db.queries as q

router = APIRouter(prefix="/api/calendar", tags=["Calendar"])
log = logging.getLogger("docuagent")


# ── Pydantic modellek ─────────────────────────────────────────

class CalendarEventCreate(BaseModel):
    title: str
    start_time: datetime
    end_time: datetime
    description: Optional[str] = None
    attendees: Optional[List[str]] = []
    source: Optional[str] = "manual"
    google_event_id: Optional[str] = None


class LinkGoogleRequest(BaseModel):
    event_id: str
    google_event_id: str


class BookFromEmailRequest(BaseModel):
    email_id: str


# ── Segédfüggvény ─────────────────────────────────────────────

def _serialize_event(row) -> dict:
    d = dict(row)
    for k in ("start_time", "end_time", "created_at", "updated_at", "last_synced_at"):
        if isinstance(d.get(k), datetime):
            d[k] = d[k].isoformat()
    if isinstance(d.get("attendees"), str):
        try:
            d["attendees"] = json.loads(d["attendees"])
        except Exception:
            d["attendees"] = []
    for k in ("id", "tenant_id", "email_id"):
        if d.get(k) is not None:
            d[k] = str(d[k])
    # Remove internal xmax flag from upsert RETURNING
    d.pop("inserted", None)
    return d


# ── Endpointok ────────────────────────────────────────────────

@router.get("/events")
async def list_events(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Naptár események listája tenant alapján, opcionális dátum szűréssel."""
    from_dt = datetime.fromisoformat(from_date) if from_date else None
    to_dt   = datetime.fromisoformat(to_date)   if to_date   else None

    rows = await q.get_calendar_events(current_user["tenant_id"], from_dt, to_dt)
    return {"events": [_serialize_event(r) for r in rows]}


@router.post("/create", status_code=201)
async def create_event(
    req: CalendarEventCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Új manuális naptár esemény létrehozása.
    Mentés után n8n webhook-ot hív, hogy a Google Calendarba is bekerüljön.
    """
    if req.end_time <= req.start_time:
        raise HTTPException(400, "end_time must be after start_time")

    data = {
        "title":           req.title,
        "description":     req.description,
        "start_time":      req.start_time,
        "end_time":        req.end_time,
        "attendees":       req.attendees or [],
        "source":          "manual",
        "google_event_id": None,
        "email_id":        None,
    }

    row = await q.insert_calendar_event(current_user["tenant_id"], data)
    event = _serialize_event(row)

    # n8n webhook fire (fire-and-forget, non-blocking)
    _fire_n8n_webhook(event)

    log.info(f"Calendar event created: {req.title} @ {req.start_time.isoformat()}")
    return {"event": event}


def _fire_n8n_webhook(event: dict):
    """n8n webhook hívása async (best-effort, nem blokkoló)."""
    import asyncio

    async def _post():
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    N8N_CALENDAR_WEBHOOK,
                    json={
                        "event_id":    event["id"],
                        "title":       event["title"],
                        "start_time":  event["start_time"],
                        "end_time":    event["end_time"],
                        "description": event.get("description") or "",
                    },
                )
        except Exception as e:
            log.warning(f"n8n calendar webhook failed (non-fatal): {e}")

    try:
        loop = asyncio.get_event_loop()
        loop.create_task(_post())
    except RuntimeError:
        pass  # no running loop (e.g. tests)


@router.post("/link-google", dependencies=[Depends(get_current_user)])
async def link_google_event(req: LinkGoogleRequest):
    """
    n8n visszahívja ezt az endpointot miután a Google Calendarban létrehozta az eseményt.
    Frissíti a DB rekordban a google_event_id-t és a last_synced_at-t.
    """
    if not req.google_event_id:
        raise HTTPException(400, "google_event_id nem lehet üres")

    existing = await q.get_calendar_event_by_id(req.event_id)
    if not existing:
        raise HTTPException(404, "Esemény nem található")

    if existing.get("google_event_id") == req.google_event_id:
        log.info(f"link-google: event {req.event_id} already linked to {req.google_event_id}, no-op")
        return {"event": _serialize_event(existing)}

    row = await q.link_google_event(req.event_id, req.google_event_id)
    if not row:
        raise HTTPException(500, "Linkelés sikertelen")
    log.info(f"link-google: event_id={req.event_id} → google_event_id={req.google_event_id}")
    return {"event": _serialize_event(row)}


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Naptár esemény törlése."""
    existing = await q.get_calendar_event_by_id(event_id)
    if not existing:
        raise HTTPException(404, "Esemény nem található")

    await q.delete_calendar_event(event_id)
    log.info(f"Calendar event deleted: {event_id}")
    return {"status": "ok", "deleted": event_id}


# ── AI-alapú időpont foglalás emailből ───────────────────────

_EXTRACT_PROMPT = """Extract appointment details from this email. Return JSON only:
{"title": "...", "start_iso": "2025-...", "end_iso": "2025-...",
 "attendee_email": "...", "attendee_name": "...", "confidence": 0.0}

Rules:
- start_iso and end_iso must be valid ISO 8601 datetimes (include timezone Z or +00:00)
- If end time is not mentioned, assume 1 hour after start
- If no clear appointment request, return {"confidence": 0}
- title should be a brief meeting title (e.g. "Demo call", "Konzultáció")
- confidence: 0.0-1.0 how certain you are this is an appointment request"""

_REPLY_TEMPLATE = {
    "HU": "Köszönjük megkeresését! Az időpontot rögzítettük: {title}, {start}. Visszaigazolást hamarosan küldünk.",
    "EN": "Thank you for reaching out! We have booked your appointment: {title} on {start}. Confirmation to follow.",
    "DE": "Vielen Dank! Wir haben Ihren Termin eingetragen: {title} am {start}. Eine Bestätigung folgt in Kürze.",
}


@router.post("/book-from-email")
async def book_from_email(
    req: BookFromEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    AI-alapú időpont foglalás emailből.
    Lekéri az email szövegét, GPT-tel kinyeri az időpontot,
    létrehozza a calendar_events sorát.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(503, "No API key configured")

    email = await q.get_email_by_id(req.email_id)
    if not email:
        raise HTTPException(404, "Email nem található")

    subject = email.get("subject", "")
    body    = email.get("body", "")

    try:
        raw = await openai_service.chat(
            [
                {"role": "system", "content": _EXTRACT_PROMPT},
                {"role": "user",   "content": f"Subject: {subject}\n\n{body[:3000]}"},
            ],
            max_tokens=300,
            json_mode=True,
        )
        extracted = json.loads(raw)
    except Exception as e:
        log.error(f"Calendar extraction error: {e}")
        raise HTTPException(500, "Időpont kinyerési hiba")

    confidence = float(extracted.get("confidence", 0))
    if confidence < 0.4:
        return {
            "event":           None,
            "confidence":      confidence,
            "suggested_reply": None,
            "message":         "Nem sikerült egyértelműen azonosítani időpont-kérést az emailben.",
        }

    try:
        start_dt = datetime.fromisoformat(
            extracted["start_iso"].replace("Z", "+00:00")
        )
        end_iso = extracted.get("end_iso")
        if end_iso:
            end_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        else:
            from datetime import timedelta
            end_dt = start_dt + timedelta(hours=1)
    except Exception:
        raise HTTPException(422, "Érvénytelen dátumformátum az AI válaszban")

    attendees = []
    if extracted.get("attendee_email"):
        attendees.append({
            "email": extracted["attendee_email"],
            "name":  extracted.get("attendee_name", ""),
        })
    sender = email.get("sender", "")
    if sender and not any(a.get("email") == sender for a in attendees):
        attendees.append({"email": sender, "name": ""})

    data = {
        "title":       extracted.get("title") or subject[:80],
        "description": f"Emailből automatikusan létrehozva.\nTárgy: {subject}",
        "start_time":  start_dt,
        "end_time":    end_dt,
        "attendees":   attendees,
        "source":      "email_ai",
        "email_id":    req.email_id,
    }

    row = await q.insert_calendar_event(current_user["tenant_id"], data)
    event = _serialize_event(row)

    lang = email.get("lang", "HU") or "HU"
    template = _REPLY_TEMPLATE.get(lang, _REPLY_TEMPLATE["HU"])
    start_fmt = start_dt.strftime("%Y. %m. %d. %H:%M")
    suggested_reply = template.format(title=data["title"], start=start_fmt)

    log.info(f"Calendar booked from email {req.email_id}: {data['title']} @ {start_dt.isoformat()}")
    return {
        "event":           event,
        "confidence":      confidence,
        "suggested_reply": suggested_reply,
    }


# ── Calendar sync státusz ────────────────────────────────────

@router.get("/sync-status")
async def calendar_sync_status(current_user: dict = Depends(get_current_user)):
    """
    Calendar szinkronizálás állapota.
    Visszaadja az utolsó szinkron időpontját, esetleges hibát, és a WF4 webhook konfigurációját.
    """
    from routers.integrations import _get_cfg  # noqa: PLC0415
    last_sync  = await _get_cfg("integration.calendar_last_sync", "")
    last_error = await _get_cfg("integration.calendar_last_error", "")
    webhook_ok = bool(N8N_CALENDAR_SYNC_WEBHOOK)

    return {
        "webhook_configured": webhook_ok,
        "last_sync_at":       last_sync  or None,
        "last_error":         last_error or None,
        "status": "error" if last_error else ("ok" if last_sync else "never"),
    }


# ── Manual sync trigger (frontend Szinkronizálás gomb) ───────

@router.post("/trigger-sync")
async def trigger_sync(current_user: dict = Depends(get_current_user)):
    """
    Elindítja az n8n WF4 workflow-t manuálisan (ha N8N_CALENDAR_SYNC_WEBHOOK be van állítva).
    Ha nincs webhook URL, 503-at ad vissza.
    """
    if not N8N_CALENDAR_SYNC_WEBHOOK:
        raise HTTPException(503, "Manuális szinkronizálás nem konfigurált (N8N_CALENDAR_SYNC_WEBHOOK hiányzik)")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(N8N_CALENDAR_SYNC_WEBHOOK, json={})
        log.info(f"trigger-sync: n8n WF4 webhook fired, status={resp.status_code} tenant={current_user['tenant_id']}")
        return {"status": "triggered"}
    except Exception as e:
        log.error(f"trigger-sync: n8n webhook failed: {e}")
        raise HTTPException(502, "n8n webhook hívás sikertelen")


# ── Google Calendar Sync (n8n WF4) ───────────────────────────

class SyncEvent(BaseModel):
    google_event_id: str
    title: str
    start_time: datetime
    end_time: datetime
    description: Optional[str] = ""
    attendees: Optional[List[dict]] = []
    status: Optional[str] = "confirmed"


class SyncRequest(BaseModel):
    events: List[SyncEvent]


SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000001"

@router.post("/sync")
async def sync_calendar(req: SyncRequest):
    tenant_id = SYSTEM_TENANT_ID
    """
    Google Calendar → DB upsert. n8n WF4 hívja naponta 07:00-kor.
    google_event_id alapján INSERT or UPDATE.
    source mindig 'google'.
    """
    inserted = 0
    updated  = 0

    errors = 0
    error_details = []
    for ev in req.events:
        if not ev.google_event_id:
            log.warning("Calendar sync: skipping event with empty google_event_id")
            errors += 1
            continue
        data = {
            "google_event_id": ev.google_event_id,
            "title":           ev.title,
            "description":     ev.description or "",
            "start_time":      ev.start_time,
            "end_time":        ev.end_time,
            "attendees":       ev.attendees or [],
            "status":          ev.status or "confirmed",
        }
        try:
            # row = await q.upsert_calendar_event(current_user["tenant_id"], data)
            row = await q.upsert_calendar_event(tenant_id, data)
            if row and row.get("inserted"):
                inserted += 1
            else:
                updated += 1
        except Exception as e:
            log.error(f"Calendar sync upsert error (google_event_id={ev.google_event_id}): {e}")
            errors += 1
            error_details.append({
                "google_event_id": ev.google_event_id,
                "error": str(e)
            })

    from datetime import datetime, timezone
    from routers.integrations import _set_cfg, _get_cfg  # noqa: PLC0415

    now_iso = datetime.now(timezone.utc).isoformat()
    if errors == 0:
        await _set_cfg("integration.calendar_last_sync", now_iso)
        await _set_cfg("integration.calendar_last_error", "")
    else:
        # Record partial error but still update last_sync so UI shows activity
        await _set_cfg("integration.calendar_last_sync", now_iso)
        await _set_cfg(
            "integration.calendar_last_error",
            f"{errors} hiba a legutóbbi szinkronnál ({now_iso[:10]})",
        )

    log.info(
        f"Calendar sync complete: inserted={inserted} updated={updated} "
        f"errors={errors} total={len(req.events)} tenant={tenant_id}"
    )
    return {
        "status":   "ok",
        "synced":   inserted + updated,
        "inserted": inserted,
        "updated":  updated,
        "errors":   errors,
        "error_details": error_details
    }
