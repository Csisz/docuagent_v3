"""
Agent runs — execution log queries.

Every AI pipeline step (classify, reply, doc_ingest, chat) creates a run record
at start and closes it with status/latency at the end.
"""
import uuid
import logging
from typing import Optional
import db.database as db

log = logging.getLogger("docuagent")


async def create_run(
    tenant_id: str,
    trigger_type: str,
    trigger_ref: Optional[str] = None,
    input_summary: Optional[str] = None,
) -> str:
    """Insert a new 'running' agent_run record. Returns the run_id string."""
    run_id = str(uuid.uuid4())
    try:
        tid = uuid.UUID(tenant_id)
        tref = uuid.UUID(trigger_ref) if trigger_ref else None
        await db.execute(
            """INSERT INTO agent_runs
               (id, tenant_id, trigger_type, trigger_ref, input_summary, status)
               VALUES ($1, $2, $3, $4, $5, 'running')""",
            uuid.UUID(run_id), tid, trigger_type, tref, input_summary,
        )
    except Exception as e:
        log.warning(f"create_run failed (non-fatal): {e}")
    return run_id


async def finish_run(
    run_id: str,
    status: str,                          # 'success' | 'failed' | 'timeout'
    cost_usd: float = 0.0,
    latency_ms: Optional[int] = None,
    result_summary: Optional[str] = None,
    error_message: Optional[str] = None,
    ai_model: Optional[str] = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> None:
    """Close an agent_run with final status, latency, and optional cost/error."""
    try:
        await db.execute(
            """UPDATE agent_runs
               SET status=$2, cost_usd=$3, latency_ms=$4,
                   result_summary=$5, error_message=$6,
                   ai_model=$7, prompt_tokens=$8, completion_tokens=$9,
                   finished_at=NOW()
               WHERE id=$1""",
            uuid.UUID(run_id), status, cost_usd, latency_ms,
            result_summary, error_message,
            ai_model, prompt_tokens, completion_tokens,
        )
    except Exception as e:
        log.warning(f"finish_run({run_id}) failed (non-fatal): {e}")


async def get_runs_for_tenant(tenant_id: str, limit: int = 50) -> list:
    """Returns recent agent_runs for a tenant, newest first."""
    try:
        rows = await db.fetch(
            """SELECT id, trigger_type, trigger_ref, input_summary, status,
                      ai_model, prompt_tokens, completion_tokens, cost_usd,
                      latency_ms, error_message, result_summary, created_at, finished_at
               FROM agent_runs
               WHERE tenant_id = $1
               ORDER BY created_at DESC LIMIT $2""",
            uuid.UUID(tenant_id), limit,
        )
        return [dict(r) for r in (rows or [])]
    except Exception as e:
        log.warning(f"get_runs_for_tenant failed: {e}")
        return []


async def get_failed_runs(tenant_id: str, limit: int = 20) -> list:
    """Returns recent failed agent_runs for a tenant."""
    try:
        rows = await db.fetch(
            """SELECT id, trigger_type, trigger_ref, input_summary, status,
                      error_message, created_at, finished_at
               FROM agent_runs
               WHERE tenant_id = $1 AND status = 'failed'
               ORDER BY created_at DESC LIMIT $2""",
            uuid.UUID(tenant_id), limit,
        )
        return [dict(r) for r in (rows or [])]
    except Exception as e:
        log.warning(f"get_failed_runs failed: {e}")
        return []
