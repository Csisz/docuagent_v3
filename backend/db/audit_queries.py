"""
Audit log DB lekérdezések.
"""
import json
import logging
from typing import Optional
import db.database as db

log = logging.getLogger("docuagent")


async def insert_audit_log(
    tenant_id:   Optional[str],
    user_id:     Optional[str],
    user_email:  Optional[str],
    action:      str,
    entity_type: str,
    entity_id:   Optional[str] = None,
    details:     dict = None,
) -> None:
    """Audit bejegyzés mentése — fire-and-forget, soha nem dob kivételt."""
    try:
        await db.execute(
            """INSERT INTO audit_log
               (tenant_id, user_id, user_email, action, entity_type, entity_id, details)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            tenant_id,
            user_id,
            user_email,
            action,
            entity_type,
            entity_id,
            json.dumps(details or {}),
        )
    except Exception as e:
        log.warning(f"audit_log insert failed (non-critical): {e}")


async def list_audit_logs(
    tenant_id:   Optional[str] = None,
    limit:       int = 50,
    offset:      int = 0,
    entity_type: Optional[str] = None,
    action:      Optional[str] = None,
    user_email:  Optional[str] = None,
):
    """Audit napló listázása szűrőkkel, legújabb először."""
    conditions = []
    args: list = []

    if tenant_id:
        args.append(tenant_id)
        conditions.append(f"tenant_id=${len(args)}")
    if entity_type:
        args.append(entity_type)
        conditions.append(f"entity_type=${len(args)}")
    if action:
        args.append(action)
        conditions.append(f"action=${len(args)}")
    if user_email:
        args.append(f"%{user_email}%")
        conditions.append(f"user_email ILIKE ${len(args)}")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    args.append(limit)
    args.append(offset)

    rows = await db.fetch(
        f"""SELECT id, tenant_id, user_id, user_email, action,
                   entity_type, entity_id, details, created_at
            FROM audit_log
            {where}
            ORDER BY created_at DESC
            LIMIT ${len(args)-1} OFFSET ${len(args)}""",
        *args
    )

    count_args = args[:-2]
    total_row = await db.fetchrow(
        f"SELECT COUNT(*) FROM audit_log {where}", *count_args
    )

    return rows or [], int(total_row["count"]) if total_row else 0
