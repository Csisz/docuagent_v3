"""
arq WorkerSettings - async Redis job queue.
"""
import logging
import os
from arq.connections import RedisSettings
from arq.cron import cron
from workers.tasks import process_document, reindex_tenant_documents, auto_extract_invoice, daily_retention_cleanup

log = logging.getLogger("docuagent")

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")

def _parse_redis_settings(url: str) -> RedisSettings:
    if url.startswith("redis://"):
        url = url[len("redis://"):]
    host_port = url.split("/")[0].split(":")
    host = host_port[0]
    port = int(host_port[1]) if len(host_port) > 1 else 6379
    return RedisSettings(host=host, port=port)

async def startup(ctx):
    import db.database as database
    from workers.tasks import _heartbeat
    await database.init_pool()
    _heartbeat()
    log.info("arq worker: DB pool initialized")

async def shutdown(ctx):
    import db.database as database
    await database.close_pool()
    log.info("arq worker: DB pool closed")

class WorkerSettings:
    functions  = [process_document, reindex_tenant_documents, auto_extract_invoice, daily_retention_cleanup]
    cron_jobs  = [cron(daily_retention_cleanup, hour=2, minute=0)]
    on_startup  = startup
    on_shutdown = shutdown
    redis_settings = _parse_redis_settings(REDIS_URL)
    max_tries   = 3
    retry_delay = 60
    job_timeout = 300
    keep_result = 3600
