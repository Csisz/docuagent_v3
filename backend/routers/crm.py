"""
CRM réteg: Contacts, Cases, Tasks
"""
import logging
import uuid
import re
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import db.database as _db
from core.security import get_current_user

router = APIRouter(prefix="/api/crm", tags=["CRM"])
log = logging.getLogger("docuagent")


# ── Pydantic modellek ─────────────────────────────────────────

class ContactCreate(BaseModel):
    email: str
    full_name: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    tags: list[str] = []


class ContactUpdate(BaseModel):
    full_name: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None


class CaseCreate(BaseModel):
    title: str
    contact_id: Optional[str] = None
    status: str = "open"
    priority: str = "normal"
    category: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    contact_id: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


class LinkEmailRequest(BaseModel):
    email_id: str


class TaskCreate(BaseModel):
    title: str
    case_id: Optional[str] = None
    contact_id: Optional[str] = None
    due_date: Optional[datetime] = None
    assigned_to: Optional[str] = None


# ── Serializer helprek ────────────────────────────────────────

def _contact_dict(r) -> dict:
    return {
        "id":         str(r["id"]),
        "email":      r["email"],
        "full_name":  r["full_name"] or "",
        "company":    r["company"] or "",
        "phone":      r["phone"] or "",
        "notes":      r["notes"] or "",
        "tags":       list(r["tags"] or []),
        "created_at": r["created_at"].isoformat() if r["created_at"] else "",
        "updated_at": r["updated_at"].isoformat() if r["updated_at"] else "",
    }


def _case_dict(r) -> dict:
    return {
        "id":            str(r["id"]),
        "title":         r["title"],
        "contact_id":    str(r["contact_id"]) if r["contact_id"] else None,
        "contact_name":  r.get("contact_name") or "",
        "contact_email": r.get("contact_email") or "",
        "status":        r["status"],
        "priority":      r["priority"],
        "category":      r["category"] or "",
        "assigned_to":   r["assigned_to"] or "",
        "notes":         r["notes"] or "",
        "created_at":    r["created_at"].isoformat() if r["created_at"] else "",
        "updated_at":    r["updated_at"].isoformat() if r["updated_at"] else "",
    }


def _task_dict(r) -> dict:
    return {
        "id":           str(r["id"]),
        "title":        r["title"],
        "case_id":      str(r["case_id"]) if r["case_id"] else None,
        "case_title":   r.get("case_title") or "",
        "contact_id":   str(r["contact_id"]) if r["contact_id"] else None,
        "contact_name": r.get("contact_name") or "",
        "due_date":     r["due_date"].isoformat() if r["due_date"] else None,
        "completed":    r["completed"],
        "assigned_to":  r["assigned_to"] or "",
        "created_at":   r["created_at"].isoformat() if r["created_at"] else "",
    }


# ── Contacts ──────────────────────────────────────────────────

@router.get("/contacts")
async def list_contacts(
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    base_select = """
        SELECT c.*,
               COUNT(DISTINCT e.id)::INT AS email_count,
               MAX(e.created_at)         AS last_contact
        FROM contacts c
        LEFT JOIN emails e ON e.sender ILIKE '%' || c.email || '%'
                           AND e.tenant_id = c.tenant_id
        WHERE c.tenant_id = $1
    """
    if search:
        rows = await _db.fetch(
            base_select + " AND (c.email ILIKE $2 OR c.full_name ILIKE $2 OR c.company ILIKE $2)"
            " GROUP BY c.id ORDER BY c.created_at DESC LIMIT $3 OFFSET $4",
            tid, f"%{search}%", limit, offset,
        )
    else:
        rows = await _db.fetch(
            base_select + " GROUP BY c.id ORDER BY c.created_at DESC LIMIT $2 OFFSET $3",
            tid, limit, offset,
        )
    total_row = await _db.fetchrow(
        "SELECT COUNT(*)::INT AS cnt FROM contacts WHERE tenant_id = $1", tid
    )
    result = []
    for r in (rows or []):
        d = _contact_dict(r)
        d["email_count"]  = r["email_count"] or 0
        d["last_contact"] = r["last_contact"].isoformat() if r.get("last_contact") else None
        result.append(d)
    return {"contacts": result, "total": (total_row["cnt"] if total_row else 0)}


@router.post("/contacts", status_code=201)
async def create_contact(
    body: ContactCreate,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    cid = uuid.uuid4()
    try:
        row = await _db.fetchrow(
            """INSERT INTO contacts (id, tenant_id, email, full_name, company, phone, notes, tags)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (tenant_id, email) DO UPDATE
                 SET full_name  = COALESCE(EXCLUDED.full_name, contacts.full_name),
                     company    = COALESCE(EXCLUDED.company,   contacts.company),
                     updated_at = NOW()
               RETURNING *""",
            cid, tid, body.email, body.full_name, body.company,
            body.phone, body.notes, body.tags,
        )
    except Exception as e:
        raise HTTPException(400, str(e))
    return _contact_dict(row)


@router.get("/contacts/{contact_id}")
async def get_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    row = await _db.fetchrow(
        "SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2",
        uuid.UUID(contact_id), tid,
    )
    if not row:
        raise HTTPException(404, "Kontakt nem található")
    emails = await _db.fetch(
        """SELECT id, subject, status, created_at FROM emails
           WHERE tenant_id = $1 AND sender ILIKE $2
           ORDER BY created_at DESC LIMIT 20""",
        tid, f"%{row['email']}%",
    )
    d = _contact_dict(row)
    d["emails"] = [
        {
            "id":         str(e["id"]),
            "subject":    e["subject"],
            "status":     e["status"],
            "created_at": e["created_at"].isoformat() if e["created_at"] else "",
        }
        for e in (emails or [])
    ]
    return d


@router.put("/contacts/{contact_id}")
async def update_contact(
    contact_id: str,
    body: ContactUpdate,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    ex = await _db.fetchrow(
        "SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2",
        uuid.UUID(contact_id), tid,
    )
    if not ex:
        raise HTTPException(404, "Kontakt nem található")
    row = await _db.fetchrow(
        """UPDATE contacts
           SET full_name=$3, company=$4, phone=$5, notes=$6, tags=$7, updated_at=NOW()
           WHERE id=$1 AND tenant_id=$2 RETURNING *""",
        uuid.UUID(contact_id), tid,
        body.full_name  if body.full_name  is not None else ex["full_name"],
        body.company    if body.company    is not None else ex["company"],
        body.phone      if body.phone      is not None else ex["phone"],
        body.notes      if body.notes      is not None else ex["notes"],
        body.tags       if body.tags       is not None else list(ex["tags"] or []),
    )
    return _contact_dict(row)


@router.delete("/contacts/{contact_id}")
async def delete_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    row = await _db.fetchrow(
        "SELECT id FROM contacts WHERE id = $1 AND tenant_id = $2",
        uuid.UUID(contact_id), tid,
    )
    if not row:
        raise HTTPException(404, "Kontakt nem található")
    await _db.execute(
        "DELETE FROM contacts WHERE id = $1 AND tenant_id = $2",
        uuid.UUID(contact_id), tid,
    )
    return {"status": "ok", "deleted": contact_id}


# ── Import contacts from emails ───────────────────────────────

@router.post("/contacts/import-from-emails")
async def import_contacts_from_emails(
    current_user: dict = Depends(get_current_user),
):
    """
    Végigmegy az emails táblán és minden egyedi feladóból upsert kontaktot hoz létre.
    Meglévő kontaktokat nem írja felül.
    """
    tid = uuid.UUID(current_user["tenant_id"])
    rows = await _db.fetch(
        "SELECT DISTINCT sender FROM emails WHERE tenant_id = $1 AND sender IS NOT NULL AND sender != ''",
        tid,
    )
    created = 0
    skipped = 0
    for row in (rows or []):
        email_addr, name = _parse_email_addr(row["sender"])
        if not email_addr:
            skipped += 1
            continue
        existing = await _db.fetchrow(
            "SELECT id FROM contacts WHERE tenant_id=$1 AND email=LOWER($2)",
            tid, email_addr,
        )
        if existing:
            skipped += 1
            continue
        await _db.execute(
            """INSERT INTO contacts (id, tenant_id, email, full_name)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (tenant_id, email) DO NOTHING""",
            uuid.uuid4(), tid, email_addr.lower(), name or None,
        )
        created += 1
    log.info(f"import_contacts_from_emails: created={created} skipped={skipped} tenant={tid}")
    return {"created": created, "skipped": skipped}


# ── Cases ─────────────────────────────────────────────────────

@router.get("/cases")
async def list_cases(
    status: Optional[str] = None,
    contact_id: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    filters = ["ca.tenant_id = $1"]
    params: list = [tid]
    p = 2
    if status:
        filters.append(f"ca.status = ${p}"); params.append(status); p += 1
    if contact_id:
        filters.append(f"ca.contact_id = ${p}"); params.append(uuid.UUID(contact_id)); p += 1
    params.append(limit)
    where = " AND ".join(filters)
    rows = await _db.fetch(
        f"""SELECT ca.*, co.full_name AS contact_name, co.email AS contact_email
            FROM cases ca
            LEFT JOIN contacts co ON co.id = ca.contact_id
            WHERE {where}
            ORDER BY ca.created_at DESC LIMIT ${p}""",
        *params,
    )
    return {"cases": [_case_dict(r) for r in (rows or [])]}


@router.post("/cases", status_code=201)
async def create_case(
    body: CaseCreate,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    cid = uuid.uuid4()
    contact_uuid = uuid.UUID(body.contact_id) if body.contact_id else None
    row = await _db.fetchrow(
        """INSERT INTO cases
               (id, tenant_id, contact_id, title, status, priority, category, assigned_to, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *""",
        cid, tid, contact_uuid,
        body.title, body.status, body.priority,
        body.category, body.assigned_to, body.notes,
    )
    return _case_dict(row)


@router.get("/cases/{case_id}")
async def get_case(
    case_id: str,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    row = await _db.fetchrow(
        """SELECT ca.*, co.full_name AS contact_name, co.email AS contact_email
           FROM cases ca
           LEFT JOIN contacts co ON co.id = ca.contact_id
           WHERE ca.id = $1 AND ca.tenant_id = $2""",
        uuid.UUID(case_id), tid,
    )
    if not row:
        raise HTTPException(404, "Ügy nem található")
    d = _case_dict(row)
    emails = await _db.fetch(
        """SELECT e.id, e.subject, e.status, e.sender, e.created_at
           FROM emails e
           JOIN case_emails ce ON ce.email_id = e.id
           WHERE ce.case_id = $1 ORDER BY e.created_at DESC""",
        uuid.UUID(case_id),
    )
    d["emails"] = [
        {
            "id":         str(e["id"]),
            "subject":    e["subject"],
            "status":     e["status"],
            "sender":     e["sender"],
            "created_at": e["created_at"].isoformat() if e["created_at"] else "",
        }
        for e in (emails or [])
    ]
    return d


@router.put("/cases/{case_id}")
async def update_case(
    case_id: str,
    body: CaseUpdate,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    ex = await _db.fetchrow(
        "SELECT * FROM cases WHERE id = $1 AND tenant_id = $2",
        uuid.UUID(case_id), tid,
    )
    if not ex:
        raise HTTPException(404, "Ügy nem található")
    contact_uuid = (
        uuid.UUID(body.contact_id) if body.contact_id is not None
        else ex["contact_id"]
    )
    row = await _db.fetchrow(
        """UPDATE cases
           SET title=$3, contact_id=$4, status=$5, priority=$6,
               category=$7, assigned_to=$8, notes=$9, updated_at=NOW()
           WHERE id=$1 AND tenant_id=$2 RETURNING *""",
        uuid.UUID(case_id), tid,
        body.title       if body.title       is not None else ex["title"],
        contact_uuid,
        body.status      if body.status      is not None else ex["status"],
        body.priority    if body.priority    is not None else ex["priority"],
        body.category    if body.category    is not None else ex["category"],
        body.assigned_to if body.assigned_to is not None else ex["assigned_to"],
        body.notes       if body.notes       is not None else ex["notes"],
    )
    return _case_dict(row)


@router.post("/cases/{case_id}/link-email")
async def link_email_to_case(
    case_id: str,
    body: LinkEmailRequest,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    case_row = await _db.fetchrow(
        "SELECT id FROM cases WHERE id = $1 AND tenant_id = $2",
        uuid.UUID(case_id), tid,
    )
    if not case_row:
        raise HTTPException(404, "Ügy nem található")
    await _db.execute(
        "INSERT INTO case_emails (case_id, email_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        uuid.UUID(case_id), uuid.UUID(body.email_id),
    )
    return {"status": "ok", "case_id": case_id, "email_id": body.email_id}


# ── Tasks ─────────────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(
    completed: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    base = """
        SELECT t.*, ca.title AS case_title, co.full_name AS contact_name
        FROM tasks t
        LEFT JOIN cases    ca ON ca.id = t.case_id
        LEFT JOIN contacts co ON co.id = t.contact_id
        WHERE t.tenant_id = $1
    """
    if completed is None:
        rows = await _db.fetch(
            base + " ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC", tid
        )
    else:
        rows = await _db.fetch(
            base + " AND t.completed = $2 ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC",
            tid, completed,
        )
    return {"tasks": [_task_dict(r) for r in (rows or [])]}


@router.post("/tasks", status_code=201)
async def create_task(
    body: TaskCreate,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    task_id      = uuid.uuid4()
    case_uuid    = uuid.UUID(body.case_id)    if body.case_id    else None
    contact_uuid = uuid.UUID(body.contact_id) if body.contact_id else None
    row = await _db.fetchrow(
        """INSERT INTO tasks (id, tenant_id, case_id, contact_id, title, due_date, assigned_to)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
        task_id, tid, case_uuid, contact_uuid,
        body.title, body.due_date, body.assigned_to,
    )
    return _task_dict(row)


@router.patch("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
):
    tid = uuid.UUID(current_user["tenant_id"])
    row = await _db.fetchrow(
        "SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2",
        uuid.UUID(task_id), tid,
    )
    if not row:
        raise HTTPException(404, "Teendő nem található")
    await _db.execute(
        "UPDATE tasks SET completed = TRUE WHERE id = $1 AND tenant_id = $2",
        uuid.UUID(task_id), tid,
    )
    return {"status": "ok", "task_id": task_id, "completed": True}


# ── Auto contact upsert (emails.py-ból hívható) ───────────────

def _parse_email_addr(sender: str) -> tuple[str, str]:
    """'John Doe <john@example.com>' → ('john@example.com', 'John Doe')"""
    m = re.match(r'^(.+?)\s*<([^>]+)>', sender.strip())
    if m:
        return m.group(2).strip().lower(), m.group(1).strip().strip('"')
    return sender.strip().lower(), ""


async def upsert_contact_from_sender(tenant_id: str, sender: str):
    """Sender email alapján kontaktot hoz létre ha még nem létezik."""
    try:
        email, name = _parse_email_addr(sender)
        if not email or "@" not in email:
            return
        tid = uuid.UUID(tenant_id)
        await _db.execute(
            """INSERT INTO contacts (id, tenant_id, email, full_name)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT (tenant_id, email) DO NOTHING""",
            uuid.uuid4(), tid, email, name or None,
        )
    except Exception as e:
        log.warning(f"upsert_contact_from_sender failed: {e}")
