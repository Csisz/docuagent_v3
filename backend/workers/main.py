"""
arq WorkerSettings — async Redis job queue.

Start with: python -m arq backend.workers.main.WorkerSettings
Or via docker-compose: command: python -m arq backend.workers.main.WorkerSettings
"""
import logging
import os

from arq.connections import RedisSettings

from workers.tasks import process_document, reindex_tenant_documents

log = logging.getLogger("docuagent")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


async def startup(ctx):
    """Initialize DB pool on worker startup."""
    import db.database as database
    await database.init_pool()
    log.info("arq worker: DB pool initialized")


async def shutdown(ctx):
    """Close DB pool on worker shutdown."""
    import db.database as database
    await database.close_pool()
    log.info("arq worker: DB pool closed")


class WorkerSettings:
    functions = [process_document, reindex_tenant_documents]
    on_startup  = startup
    on_shutdown = shutdown
    max_tries   = 3
    retry_delay = 60  # seconds between retries
    job_timeout = 300  # 5 min max per job
    keep_result = 3600  # keep results 1h

    @classmethod
    def redis_settings(cls) -> RedisSettings:
        # Parse redis://host:port/db
        url = REDIS_URL
        if url.startswith("redis://"):
            url = url[len("redis://"):]
        host_port = url.split("/")[0].split(":")
        host = host_port[0]
        port = int(host_port[1]) if len(host_port) > 1 else 6379
        return RedisSettings(host=host, port=port)
