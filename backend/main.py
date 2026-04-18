"""
DocuAgent v3.2 — FastAPI Backend
=================================
v3.2 changes:
  - Moduláris struktúra: routers/, services/, db/, models/, core/
  - API key autentikáció (X-API-Key header)
  - CORS env változóból (ALLOWED_ORIGINS)
  - Embedding-alapú feedback matching
  - Többnyelvű válaszgenerálás
  - Típusos Pydantic modellek (enum státuszok, AiDecision)
  - Duplikált route-ok eltávolítva
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.config import PORT, ALLOWED_ORIGINS, UPLOAD_DIR
from core.limiter import limiter
import db.database as database
from routers import auth, classify, emails, documents, dashboard, sla, chat, calendar, onboarding, templates, demo, agents, audit, crm, integrations, gateway, runs, invoice_workflow, metering, api_keys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s"
)
log = logging.getLogger("docuagent")

_BASE = Path(__file__).parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    UPLOAD_DIR.mkdir(exist_ok=True)
    await database.init_pool()
    import os as _os
    log.info("=" * 60)
    log.info("DocuAgent v3 startup")
    log.info(f"  OPENAI_API_KEY  : {'SET' if _os.getenv('OPENAI_API_KEY') else 'MISSING ⚠️'}")
    log.info(f"  QDRANT_URL      : {_os.getenv('QDRANT_URL', 'not set')}")
    log.info(f"  REDIS_URL       : {_os.getenv('REDIS_URL', 'not set')}")
    log.info(f"  JWT_SECRET_KEY  : {'SET' if _os.getenv('JWT_SECRET_KEY') else 'MISSING ⚠️'}")
    log.info(f"  ALLOWED_ORIGINS : {ALLOWED_ORIGINS}")
    log.info("=" * 60)
    yield
    await database.close_pool()


app = FastAPI(title="DocuAgent API", version="3.2", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routerek regisztrálása ────────────────────────────────────
app.include_router(auth.router)
app.include_router(classify.router)
app.include_router(emails.router)
app.include_router(documents.router)
app.include_router(dashboard.router)
app.include_router(sla.router)
app.include_router(chat.router)
app.include_router(chat.widget_router)
app.include_router(chat._widget_config_router)
app.include_router(calendar.router)
app.include_router(onboarding.router)
app.include_router(templates.router)
app.include_router(templates.config_router)
app.include_router(agents.router)
app.include_router(audit.router)
app.include_router(demo.router)
app.include_router(crm.router)
app.include_router(integrations.router)
app.include_router(gateway.router)
app.include_router(runs.router)
app.include_router(invoice_workflow.router)
app.include_router(metering.router)
app.include_router(api_keys.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "3.2"}


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve():
    for p in [_BASE / "dashboard.html", _BASE.parent / "dashboard" / "index.html"]:
        if p.exists():
            return HTMLResponse(p.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>DocuAgent v3.2</h1><p><a href='/docs'>API Docs →</a></p>")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
