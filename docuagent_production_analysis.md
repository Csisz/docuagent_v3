# DocuAgent v3 — Production Readiness Analysis & Claude Code Prompts
# April 2026 | Based on ZIP: docuagent_v3-main__11_.zip

---

## 1. PROJEKT ÖSSZEFOGLALÓ

**Mi ez:** Magyar KKV-knak és könyvelőirodáknak szánt AI-alapú email automatizációs SaaS. Gmail-ből beérkező emaileket osztályoz, RAG-alapú tudástárból választ generál, emberi jóváhagyást kezel, és megtanulja a korrekciókat.

**Stack:** FastAPI + PostgreSQL + Qdrant + Redis/arq + n8n + React/Vite + Docker Compose

**Jelenlegi állapot:** Erős proto-product. A core loop (email → AI → approval → learn) működik. A Phase 1-4 architektúra nagyrészt implementálva, de komoly production gap-ek maradtak.

---

## 2. FUNKCIONALITÁSOK LELTÁRA

### Backend — Agent pipeline
| Funkció | Állapot | Megjegyzés |
|---------|---------|-----------|
| 5-rétegű agent arch (Intake→Knowledge→Drafting→Compliance→Action) | ✅ Kész | classify.py teljes implementáció |
| Tenant-izolált Qdrant (collection-per-tenant) | ✅ Kész | qdrant_service.py, dupla filter |
| Policy engine (BASE_POLICY + DB override) | ✅ Kész | policy_engine.py |
| Feedback learning (tenant-scoped) | ✅ Kész | learning_service.py |
| Entity extraction (Intake layer) | ✅ Kész | intake.py, GPT-4o-mini |
| Structured output + retry (Drafting layer) | ✅ Kész | drafting.py, Pydantic validation |
| Complaint/NAV/tax policy blocking | ✅ Kész | compliance.py |
| Case auto-link (Action layer) | ✅ Kész | action.py |
| Model routing (mini vs smart) | ✅ Kész | openai_service.py |
| agent_runs logging | ⚠️ Részleges | classify-ban van, email-log ingest-ben NINCS |
| Metering increment (emails_processed, ai_calls) | ⚠️ Részleges | classify-ban ✅, email-log-ban manuálisan hozzáadva, tokens/cost HIÁNYZIK |
| Token + cost metering | ❌ Hiányzik | ai_usage_log létezik, de usage_records.tokens_consumed soha nem nő |
| Quota enforcement (429) | ✅ Kész | classify.py check_quota() |
| Quota enforcement email-log ingest-ben | ❌ Hiányzik | email-log nem ellenőrzi a kvótát |

### Backend — Dokumentum pipeline
| Funkció | Állapot | Megjegyzés |
|---------|---------|-----------|
| Async document ingest (arq queue) | ✅ Kész | workers/tasks.py |
| Tag suggestion (rule-based) | ✅ Kész | documents.py suggest-tag endpoint |
| RAG multi-collection search | ✅ Kész | qdrant_service.search_multi() |
| Document status polling | ✅ Kész | GET /api/documents/{doc_id}/status |
| documents_stored metering increment | ❌ Hiányzik | workers/tasks.py nem hívja |
| rag_queries metering increment | ❌ Hiányzik | sehol nem hívják |

### Backend — Invoice workflow
| Funkció | Állapot | Megjegyzés |
|---------|---------|-----------|
| Invoice extraction (GPT-4o-mini) | ✅ Kész | invoice_workflow.py |
| Invoice verify/save | ✅ Kész | PATCH endpoint |
| Billingo API integration | ❌ Placeholder | "Hamarosan" — szándékosan |
| Auto-trigger invoice extract on ingest | ❌ Hiányzik | manuálisan kell hívni |

### Backend — Auth & Security
| Funkció | Állapot | Megjegyzés |
|---------|---------|-----------|
| JWT auth | ✅ Kész | |
| Tenant API key (SHA256 lookup) | ✅ Kész | security.py |
| API key management endpoints | ✅ Kész | api_keys.py |
| JWT_SECRET_KEY production értéke | ❌ KRITIKUS | default "change-me-in-production" |
| ALLOWED_ORIGINS production értéke | ❌ KRITIKUS | default "*" |
| Rate limiting | ❌ Hiányzik | Nincs request rate limit |
| Senior approval enforcement | ⚠️ Részleges | DB-be ír, frontend badge van, de API endpoint hiányzik |

### Backend — Runs & Error center
| Funkció | Állapot | Megjegyzés |
|---------|---------|-----------|
| agent_runs CRUD | ✅ Kész | run_queries.py |
| Failed runs list | ✅ Kész | runs.py |
| Retry logic (doc_ingest, email_classify) | ✅ Kész | runs.py retry endpoint |
| Cost tracking in agent_runs | ❌ Hiányzik | cost_usd mindig 0 |

### Frontend
| Funkció | Állapot | Megjegyzés |
|---------|---------|-----------|
| Email list + filter | ✅ Kész | |
| Approval inbox + source panel | ✅ Kész | |
| Entity panel (Azonosított adatok) | ✅ Kész | |
| Document upload + tag selector modal | ✅ Kész | AI suggest + user override |
| Usage dashboard widget | ✅ Kész | tokens/cost mindig 0 mutat |
| Error center page | ✅ Kész | |
| Invoice extraction UI (Számla adatok card) | ⚠️ Részleges | Card megvan, de nem auto-triggerel |
| Source panel duplikátum szűrés | ⚠️ Részleges | Emailspage-en megvan, ApprovalPage-en részleges |
| Senior approval badge | ✅ Kész | de backend endpoint hiányzik |
| Onboarding wizard (könyvelő-first) | ✅ Kész | |
| Template library (HU accounting) | ✅ Kész | |
| ROI widget | ✅ Kész | |

### Infrastructure
| Funkció | Állapot | Megjegyzés |
|---------|---------|-----------|
| Docker Compose (postgres, qdrant, redis, worker, backend, frontend, n8n) | ✅ Kész | |
| arq worker (document ingest) | ✅ Kész | |
| redis_data volume HIÁNYZIK docker-compose-ból | ❌ Bug | volume deklarálva de nincs mount |
| Health checks | ⚠️ Részleges | postgres ✅, redis ✅, backend ❌, worker ❌ |
| Backup strategy | ❌ Hiányzik | |
| Secrets management | ❌ Hiányzik | .env fájl, nincs vault |

---

## 3. GAP ANALÍZIS (DEMO → PRODUCTION)

### KRITIKUS (production blocker)

**G1 — Token/cost metering nem működik**
- `ai_usage_log` tábla van, `openai_service.chat()` loggol bele
- De `usage_records.tokens_consumed` és `cost_usd` soha nem frissül
- Az `increment_usage("tokens_consumed", tokens)` hívás hiányzik a pipeline-ból
- Impact: billing szimulációra alkalmatlan, nem tudod a valós AI költséget

**G2 — email-log ingest nem megy át a teljes agent pipeline-on**
- Az `/api/email-log` endpoint classify + generate_reply-t hív manuálisan
- De az `agent_runs` logging, quota check, és metering RÉSZLEGES benne
- A classify.py-ban lévő teljes 5-rétegű pipeline NEM fut le az email-log útvonalon
- Impact: az n8n-en keresztül érkező emailek kevesebb adatot produkálnak

**G3 — JWT_SECRET_KEY és ALLOWED_ORIGINS production értékek**
- JWT default: `"change-me-in-production"` — ez security gap
- CORS default: `"*"` — bárki hívhatja az API-t cross-origin

**G4 — documents_stored és rag_queries metering hiányzik**
- A usage dashboard Dokumentumok számlálója mindig 0
- Rag queries számlálója mindig 0

### FONTOS (early customer blocker)

**G5 — Senior approval backend endpoint hiányzik**
- A frontend mutatja a badge-et, de `POST /api/approvals/{id}/senior-approve` nem létezik
- Csak az `emails/{id}/approve` endpoint van, role check nélkül

**G6 — Invoice auto-trigger hiányzik**
- Az invoice extraction manuálisan kell triggerelni (`POST /api/invoice-workflow/extract`)
- Ideálisan: ha az email tartalmaz számla entitásokat (intake.invoice_ids), automatikusan futna

**G7 — Source docs nem kerülnek a rag_logs-ba a classify útvonalon**
- A `/api/classify` endpoint agent pipeline-ja nem loggol rag_logs-t
- Csak a `/api/email-log` ingest loggol (manuálisan hozzáadva)
- Impact: az approval queue-ban sokszor "Nincs dokumentum forrás" látszik

**G8 — rate limiting hiányzik**
- Nincs per-IP vagy per-tenant request rate limit a FastAPI szinten
- A quota check csak email-szintű, nem request-szintű

### KÖZEPES (scale blocker)

**G9 — openai_service.chat() 30s timeout**
- Ha OpenAI lassú, a user 30s-ig vár
- Nincs circuit breaker, nincs graceful degradation

**G10 — Feedback embedding bottleneck**
- `get_feedback_context()` minden egyes feedback sorhoz külön embed()-et hív
- 30 feedback sor = 30 API hívás szekvenciálisan
- Fix: feedback embedding-eket egyszer kell kiszámolni és Qdrant-ban tárolni

**G11 — Upload fájlok nem törlődnek**
- `UPLOAD_DIR` folyamatosan nő, nincs cleanup
- Nagy PDF-eknél ez gyorsan teli lehet

**G12 — redis_data volume nincs mountolva**
- docker-compose.yml deklarálja de a redis service-nél nincs `volumes:` sor
- Redis restart után az arq job queue elvész

---

## 4. FÁZISOK

### Phase A — Critical fixes (production safety)
Cél: Megakadályozni az adatszivárgást, biztonsági réseket és billing hibákat.

### Phase B — Metering completion
Cél: Token/cost tracking, documents_stored, rag_queries — teljes billing alapot adni.

### Phase C — Pipeline unification
Cél: Az email-log ingest ugyanolyan teljes pipeline-on menjen mint a classify endpoint.

### Phase D — Missing features completion
Cél: Senior approval, invoice auto-trigger, source docs logging.

### Phase E — Resilience & scale
Cél: Rate limiting, timeout handling, feedback embedding cache, file cleanup.

### Phase F — Operations & monitoring
Cél: Health endpoints, structured logging, backup, alerting.

---

## 5. CLAUDE CODE PROMPTOK

---

### PROMPT A — Critical Security & Infrastructure Fixes

```
You are working on DocuAgent v3. Project: D:\Munka\Agentify\docuagent_v3

Read these files completely before making any changes:
- backend/core/config.py
- backend/core/security.py
- docker-compose.yml
- .env.example

## WHAT TO FIX

### Fix A1 — JWT_SECRET_KEY must not have an insecure default

In backend/core/security.py:
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production")

Change to:
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    import sys
    print("FATAL: JWT_SECRET_KEY environment variable is not set", file=sys.stderr)
    sys.exit(1)

### Fix A2 — ALLOWED_ORIGINS must not default to "*" in production

In backend/core/config.py, the current default is "*".
Change to: if ALLOWED_ORIGINS is "*" or empty, log a warning but keep it working for dev.
Add a check: if the value is literally "*" AND there is a PRODUCTION env var set to "true",
raise a startup warning (do NOT crash — just log clearly).

### Fix A3 — redis_data volume not mounted in docker-compose.yml

Current docker-compose.yml declares redis_data in volumes: section but the redis service
has no volumes: entry. Fix by adding:

redis:
  ...
  volumes:
    - redis_data:/data

This ensures arq job queue survives Redis restarts.

### Fix A4 — Add backend health check to docker-compose.yml

The backend service has no healthcheck. Add:
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 20s

Also add a GET /health endpoint to backend/main.py:
@app.get("/health")
async def health():
    return {"status": "ok", "version": "3.2"}

### Fix A5 — Add .env.example security guidance

Add these comments and required vars to .env.example:
# REQUIRED IN PRODUCTION — generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=
DASHBOARD_API_KEY=
# REQUIRED IN PRODUCTION — set to your actual domain, NOT *
ALLOWED_ORIGINS=http://localhost:3000
# REDIS URL for arq worker queue
REDIS_URL=redis://redis:6379

## FILES TO MODIFY
- backend/core/security.py
- backend/core/config.py
- docker-compose.yml
- backend/main.py
- .env.example

## DO NOT TOUCH
- Any router file
- Any frontend file
- Any migration file
- Any service file

## OUTPUT
Complete modified file content for each file.
Then: docker compose up --build -d
```

---

### PROMPT B — Complete Token/Cost Metering

```
You are working on DocuAgent v3. Project: D:\Munka\Agentify\docuagent_v3

Read these files completely before making any changes:
- backend/services/openai_service.py
- backend/services/metering.py
- backend/routers/classify.py
- backend/workers/tasks.py
- backend/routers/documents.py

## CONTEXT

The system has:
- ai_usage_log table: tracks per-call token usage (openai_service._log_usage writes here)
- usage_records table: per-tenant billing period aggregates
- increment_usage(tenant_id, field, value) function in metering.py

The problem: usage_records.tokens_consumed and cost_usd are NEVER incremented.
The ai_usage_log IS written but nobody reads from it to update usage_records.

## WHAT TO BUILD

### Fix B1 — Increment tokens and cost in openai_service.chat()

After _log_usage() is called in chat(), also call increment_usage for tokens and cost.

Modify backend/services/openai_service.py:

After:
    await _log_usage(chosen, task_type, tokens, tenant_id)

Add:
    if tenant_id:
        try:
            from services.metering import increment_usage
            cost = round(tokens / 1000 * _COST_PER_1K.get(chosen, 0.00015), 6)
            await increment_usage(tenant_id, "tokens_consumed", float(tokens))
            await increment_usage(tenant_id, "cost_usd", cost)
        except Exception:
            pass

This is the single source of truth for token tracking since ALL AI calls go through chat().

### Fix B2 — Increment documents_stored in worker task

In backend/workers/tasks.py, after successful qdrant_ok:

Add:
    if qdrant_ok and tenant_id:
        try:
            from services.metering import increment_usage
            await increment_usage(tenant_id, "documents_stored", 1)
        except Exception:
            pass

### Fix B3 — Increment rag_queries in qdrant_service.search_multi()

In backend/services/qdrant_service.py, in search_multi(), after results are collected:

Add optional tenant_id parameter to search_multi signature (already has it).
After collecting all_results, if tenant_id is provided:
    try:
        from services.metering import increment_usage
        await increment_usage(tenant_id, "rag_queries", 1)
    except Exception:
        pass

### Fix B4 — Increment ai_calls_made in openai_service.chat()

Currently classify.py calls increment_usage("emails_processed") correctly.
But ai_calls_made should increment on EVERY chat() call, not just classify.

In openai_service.chat(), after _log_usage():
    if tenant_id:
        try:
            from services.metering import increment_usage
            await increment_usage(tenant_id, "ai_calls_made", 1)
        except Exception:
            pass

Remove the duplicate increment_usage("ai_calls_made") calls from emails.py
to avoid double-counting.

## FILES TO MODIFY
- backend/services/openai_service.py (B1, B4)
- backend/workers/tasks.py (B2)
- backend/services/qdrant_service.py (B3)
- backend/routers/emails.py (remove duplicate ai_calls_made increment)

## DO NOT TOUCH
- backend/services/metering.py (already correct)
- Any migration files
- Any frontend files
- docker-compose.yml

## OUTPUT
Complete file content for each modified file.
Deployment:
docker cp backend/services/openai_service.py docuagent_v3-backend-1:/app/services/openai_service.py
docker cp backend/services/qdrant_service.py docuagent_v3-backend-1:/app/services/qdrant_service.py
docker cp backend/workers/tasks.py docuagent_v3-worker-1:/app/workers/tasks.py
docker cp backend/routers/emails.py docuagent_v3-backend-1:/app/routers/emails.py
docker restart docuagent_v3-backend-1 docuagent_v3-worker-1
```

---

### PROMPT C — Pipeline Unification (email-log → full agent pipeline)

```
You are working on DocuAgent v3. Project: D:\Munka\Agentify\docuagent_v3

Read these files completely before making any changes:
- backend/routers/emails.py (especially the /api/email-log endpoint)
- backend/routers/classify.py (the full classify_email function)
- backend/services/metering.py

## CONTEXT

Currently two code paths handle emails:
1. Direct classify: POST /api/classify → full 5-layer agent pipeline + agent_runs + metering
2. n8n ingest: POST /api/email-log → manual classify_email() call, partial pipeline

The email-log path is missing:
- quota check before processing
- agent_runs logging (run_id creation and finish)
- proper RAG source logging
- consistent metering

## WHAT TO BUILD

### Fix C1 — Add quota check at top of /api/email-log

Before any processing, check email quota:
```python
if tenant_id and tenant_id != "00000000-0000-0000-0000-000000000001":
    from services.metering import check_quota
    allowed, remaining = await check_quota(tenant_id, "emails")
    if not allowed:
        return {"status": "quota_exceeded", "detail": "Havi email kvóta elérve"}
```

### Fix C2 — Add agent_run to the email-log classify path

In the email-log ingest, when classify_email is called:
- Create a run_id BEFORE calling classify_email
- The classify_email function internally creates its own run — this is OK
- But the email-log ingest should also track the overall ingest as a run:

```python
ingest_run_id = await rq.create_run(
    tenant_id=tenant_id,
    trigger_type="email_ingest",
    trigger_ref=email_id,
    input_summary=f"n8n ingest: {subject[:80]}",
)
```
Then finish it after all processing is done.

### Fix C3 — Log RAG sources to rag_logs with tenant_id

Currently the rag_log insert uses tenant_id but the insert_rag_log function
signature was updated. Verify the call in emails.py passes tenant_id correctly
and that the rag_logs table has tenant_id populated.

Also: ensure that when the email-log generates a reply and gets sources back,
those sources are saved to rag_logs AND to the email's related rag_log record
so the approval queue can show them.

### Fix C4 — Remove hardcoded Demo tenant fallback

Current code:
tenant_id = data.get("tenant_id") or "00000000-0000-0000-0000-000000000001"

This silently assigns emails to Demo Kft. if no tenant_id is found.
Change to: if no tenant_id from API key lookup AND no tenant_id in body, return 400.
But keep backward compat: if DASHBOARD_API_KEY is used (legacy), keep the demo tenant fallback.

```python
api_key = request.headers.get("X-API-Key")
tenant_id = await get_tenant_from_api_key(api_key) if api_key else None
if not tenant_id:
    tenant_id = data.get("tenant_id")
if not tenant_id:
    # Legacy DASHBOARD_API_KEY path
    if api_key and DASHBOARD_API_KEY and api_key == DASHBOARD_API_KEY:
        tenant_id = "00000000-0000-0000-0000-000000000001"
    else:
        return {"status": "error", "detail": "tenant_id nem azonosítható"}
```

## FILES TO MODIFY
- backend/routers/emails.py

## DO NOT TOUCH
- backend/routers/classify.py
- Any agent layer file
- Any frontend file
- Any migration file

## OUTPUT
Complete emails.py file content.
Deployment:
docker cp backend/routers/emails.py docuagent_v3-backend-1:/app/routers/emails.py
docker restart docuagent_v3-backend-1
```

---

### PROMPT D — Missing Features: Senior Approval + Invoice Auto-trigger + Source Logging

```
You are working on DocuAgent v3. Project: D:\Munka\Agentify\docuagent_v3

Read these files completely before making any changes:
- backend/routers/emails.py
- backend/routers/invoice_workflow.py
- backend/routers/classify.py
- backend/agents/compliance.py
- frontend/src/pages/ApprovalPage.jsx

## WHAT TO BUILD

### Fix D1 — Senior approval API endpoint

Add to backend/routers/emails.py:

```python
@router.post("/approvals/{email_id}/senior-approve")
async def senior_approve(
    email_id: str,
    body: StatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Only admin role can senior-approve flagged emails."""
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Csak admin végezhet senior jóváhagyást")
    
    tenant_id = current_user.get("tenant_id")
    email = await q.get_email_by_id(email_id)
    if not email or str(email.get("tenant_id")) != tenant_id:
        raise HTTPException(404, "Email nem található")
    
    await q.update_email_status(email_id, "AI_ANSWERED")
    # Also clear senior_required flag
    await _db.execute(
        "UPDATE emails SET senior_required=FALSE WHERE id=$1", email_id
    )
    return {"status": "ok", "email_id": email_id, "approved_by": current_user.get("email")}
```

Also add GET /api/emails/pending-senior endpoint:
Returns emails where senior_required=TRUE for this tenant.

```python
@router.get("/emails/pending-senior")
async def pending_senior_approvals(
    current_user: dict = Depends(get_current_user),
):
    tenant_id = current_user.get("tenant_id")
    rows = await _db.fetch(
        "SELECT id, subject, sender, created_at FROM emails WHERE tenant_id=$1 AND senior_required=TRUE AND status='NEEDS_ATTENTION' ORDER BY created_at DESC LIMIT 50",
        tenant_id,
    )
    return {"emails": [dict(r) for r in (rows or [])], "count": len(rows or [])}
```

### Fix D2 — Invoice auto-trigger on email ingest

In backend/routers/emails.py, in the email-log ingest function,
AFTER classify + reply generation, if intake entities contain invoice_ids:

```python
# Auto-trigger invoice extraction if invoice entities detected
if ai_reply and status == "AI_ANSWERED":
    pass  # only extract for emails that need attention (invoice review)

# For NEEDS_ATTENTION emails with invoice signals, auto-extract
invoice_keywords = ["számla", "szamla", "számla", "invoice", "SZ-", "INV-", "fizetési határidő"]
body_text = (body or "").lower()
if any(kw.lower() in body_text for kw in invoice_keywords):
    try:
        from routers.invoice_workflow import extract_invoice
        from models.schemas import ExtractRequest as InvoiceExtractRequest
        # Fire and forget - don't await, use background task
        import asyncio
        asyncio.create_task(
            _auto_extract_invoice(email_id, tenant_id)
        )
    except Exception as inv_err:
        log.debug(f"Invoice auto-extract skipped: {inv_err}")

async def _auto_extract_invoice(email_id: str, tenant_id: str):
    try:
        import db.database as _db2
        from services import openai_service as oai
        email = await _db2.fetchrow("SELECT * FROM emails WHERE id=$1", email_id)
        if not email:
            return
        # Simplified extraction without going through the full endpoint auth
        from routers.invoice_workflow import _EXTRACT_SYSTEM
        import json, uuid
        text = f"Subject: {email['subject']}\n\n{email['body'] or ''}"
        raw = await oai.chat(
            [{"role": "system", "content": _EXTRACT_SYSTEM},
             {"role": "user", "content": text[:4000]}],
            max_tokens=400, json_mode=True,
            task_type="extract_entities", model=oai.MODEL_MINI, tenant_id=tenant_id,
        )
        parsed = json.loads(raw)
        if float(parsed.get("confidence", 0)) > 0.4:
            extraction_id = str(uuid.uuid4())
            await _db2.execute(
                """INSERT INTO invoice_extractions
                   (id, tenant_id, email_id, invoice_number, vendor_name, amount, currency,
                    due_date, issue_date, vat_amount, raw_extraction, confidence, status)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'extracted')
                   ON CONFLICT DO NOTHING""",
                extraction_id, tenant_id, email_id,
                parsed.get("invoice_number"), parsed.get("vendor_name"),
                parsed.get("amount"), parsed.get("currency", "HUF"),
                None, None, parsed.get("vat_amount"),
                json.dumps(parsed), float(parsed.get("confidence", 0)),
            )
    except Exception as e:
        log.debug(f"Auto invoice extract failed: {e}")
```

### Fix D3 — Source docs logging in classify path

In backend/routers/classify.py, the classify_email function uses the knowledge layer
which retrieves RAG results. But these sources are NOT saved to rag_logs.

After the agent pipeline completes (after action_layer.execute), add:

```python
# Log RAG sources to rag_logs if we have them
if knowledge_ctx.sources and req.email_id and tenant_id:
    try:
        await q.insert_rag_log(
            email_id=req.email_id,
            query=f"{req.subject}\n\n{(req.body or '')[:500]}",
            answer=None,  # No reply yet at classify stage
            fallback_used=knowledge_ctx.top_score < 0.35,
            confidence=out.confidence,
            source_docs=knowledge_ctx.sources,
            collection="classify",
            lang="HU",
            latency_ms=latency_ms,
            tenant_id=tenant_id,
        )
    except Exception as e:
        log.debug(f"rag_log insert failed: {e}")
```

## FILES TO MODIFY
- backend/routers/emails.py (D1 endpoints, D2 auto-trigger)
- backend/routers/classify.py (D3 source logging)

## DO NOT TOUCH
- Any agent layer file
- backend/services/qdrant_service.py
- Any frontend file (senior badge already exists)
- Any migration file

## OUTPUT
Complete file content for both modified files.
Deployment:
docker cp backend/routers/emails.py docuagent_v3-backend-1:/app/routers/emails.py
docker cp backend/routers/classify.py docuagent_v3-backend-1:/app/routers/classify.py
docker restart docuagent_v3-backend-1
```

---

### PROMPT E — Resilience, Rate Limiting & File Cleanup

```
You are working on DocuAgent v3. Project: D:\Munka\Agentify\docuagent_v3

Read these files completely before making any changes:
- backend/main.py
- backend/services/openai_service.py
- backend/workers/tasks.py
- backend/routers/documents.py

## WHAT TO BUILD

### Fix E1 — Request rate limiting (per-tenant, not per-IP)

Add slowapi rate limiting to FastAPI.

Add to backend/requirements.txt:
slowapi>=0.1.9

In backend/main.py, add:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

Apply to the classify endpoint (the most expensive):
In backend/routers/classify.py:
```python
from main import limiter
@router.post("/classify", response_model=ClassifyResponse)
@limiter.limit("30/minute")
async def classify_email(req: ClassifyRequest, request: Request):
```

Apply to email-log:
```python
@router.post("/email-log")
@limiter.limit("60/minute")
async def ingest_email(request: Request):
```

### Fix E2 — OpenAI timeout + retry with exponential backoff

In backend/services/openai_service.py, wrap the httpx call with retry:

```python
import asyncio

async def chat(...) -> str:
    chosen = model or select_model(task_type, confidence_required)
    
    last_error = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(CHAT_URL, headers=_auth_headers(), json=body)
                r.raise_for_status()
                # ... rest of processing
                return content
        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            last_error = e
            if attempt < 2:
                wait = 2 ** attempt  # 1s, 2s
                log.warning(f"OpenAI attempt {attempt+1} failed: {e}, retrying in {wait}s")
                await asyncio.sleep(wait)
    
    raise RuntimeError(f"OpenAI failed after 3 attempts: {last_error}")
```

### Fix E3 — Upload file cleanup after Qdrant ingest

In backend/workers/tasks.py, after successful qdrant ingest:

```python
# Cleanup uploaded file after successful indexing
if qdrant_ok:
    try:
        dest.unlink(missing_ok=True)
        log.info(f"[arq] cleaned up: {dest}")
    except Exception as e:
        log.warning(f"[arq] file cleanup failed: {e}")
```

Note: Only delete if qdrant_ok=True. Keep failed files for debugging/retry.

### Fix E4 — Add structured startup logging

In backend/main.py lifespan function, after database.init_pool():

```python
log.info("=" * 50)
log.info("DocuAgent v3 starting")
log.info(f"OPENAI_API_KEY: {'SET' if OPENAI_API_KEY else 'MISSING'}")
log.info(f"QDRANT_URL: {os.getenv('QDRANT_URL', 'not set')}")
log.info(f"REDIS_URL: {os.getenv('REDIS_URL', 'not set')}")
log.info(f"ALLOWED_ORIGINS: {ALLOWED_ORIGINS}")
log.info(f"JWT_SECRET_KEY: {'SET' if SECRET_KEY else 'MISSING — STARTUP BLOCKED'}")
log.info("=" * 50)
```

## FILES TO MODIFY
- backend/requirements.txt (add slowapi)
- backend/main.py (limiter setup, startup logging)
- backend/routers/classify.py (rate limit decorator)
- backend/routers/emails.py (rate limit decorator)
- backend/services/openai_service.py (retry logic)
- backend/workers/tasks.py (file cleanup)

## DO NOT TOUCH
- Any agent layer file
- Any frontend file
- Any migration file
- docker-compose.yml

## OUTPUT
Complete file content for each modified file.
Deployment: docker compose up --build -d
```

---

### PROMPT F — Operations, Monitoring & Production Readiness

```
You are working on DocuAgent v3. Project: D:\Munka\Agentify\docuagent_v3

Read these files completely before making any changes:
- backend/main.py
- backend/routers/dashboard.py
- docker-compose.yml

## WHAT TO BUILD

### Fix F1 — Structured JSON logging for production

In backend/main.py, replace basicConfig with:

```python
import json
import logging

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "time": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj, ensure_ascii=False)

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.root.handlers = [handler]
logging.root.setLevel(logging.INFO)
```

### Fix F2 — Expose metrics endpoint for monitoring

Add to backend/routers/dashboard.py or a new backend/routers/metrics.py:

```python
@router.get("/api/metrics")
async def metrics():
    """Simple metrics for uptime monitoring. No auth required."""
    try:
        # Quick DB ping
        await _db.fetchrow("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    
    try:
        # Quick Qdrant ping
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{QDRANT_URL}/healthz")
            qdrant_ok = r.status_code == 200
    except Exception:
        qdrant_ok = False
    
    return {
        "status": "ok" if db_ok and qdrant_ok else "degraded",
        "db": db_ok,
        "qdrant": qdrant_ok,
        "version": "3.2",
    }
```

### Fix F3 — Add worker health file

In backend/workers/tasks.py, update process_document to write a heartbeat file:

```python
# At start of process_document:
import time
from pathlib import Path
Path("/tmp/worker_alive").write_text(str(time.time()))
```

Update docker-compose.yml worker healthcheck:
```yaml
worker:
  healthcheck:
    test: ["CMD", "python", "-c", "import time,os; t=float(open('/tmp/worker_alive').read()); assert time.time()-t < 120"]
    interval: 60s
    timeout: 10s
    retries: 3
    start_period: 30s
```

### Fix F4 — Add n8n DOCUAGENT_TENANT_ID env variable support

In .env.example, add:
# Tenant ID for n8n workflows — set this to your tenant UUID
# Get it from: SELECT id FROM tenants WHERE slug='your-slug';
DOCUAGENT_TENANT_ID=

In docker-compose.yml n8n service environment, add:
- DOCUAGENT_TENANT_ID=${DOCUAGENT_TENANT_ID}

This allows n8n to use $env.DOCUAGENT_TENANT_ID instead of hardcoded UUIDs.

## FILES TO MODIFY
- backend/main.py (structured logging)
- backend/routers/dashboard.py OR new backend/routers/metrics.py (metrics endpoint)
- backend/workers/tasks.py (heartbeat)
- docker-compose.yml (worker healthcheck, n8n env)
- .env.example (DOCUAGENT_TENANT_ID)

## OUTPUT
Complete file content for each modified file.
Deployment: docker compose up --build -d
```

---

## 6. TESZTELÉSI TERV MINDEN FÁZISHOZ

### Phase A tesztek

```powershell
# A1 — JWT startup check (hibás key esetén crash)
# Átmenetileg töröld a JWT_SECRET_KEY-t az .env-ből, indítsd újra
docker compose restart backend
docker logs docuagent_v3-backend-1 --tail 5
# Elvárt: FATAL: JWT_SECRET_KEY environment variable is not set

# A3 — Redis volume
docker compose stop redis
docker compose start redis
docker logs docuagent_v3-worker-1 --tail 5
# Elvárt: worker újracsatlakozik, nem crashel

# A4 — Health endpoint
Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing | Select-Object Content
# Elvárt: {"status":"ok","version":"3.2"}
```

### Phase B tesztek

```powershell
# B1 — Token tracking
# Küldj egy emailt, majd:
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "
SELECT tokens_consumed, cost_usd FROM usage_records
WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed'
ORDER BY period_start DESC LIMIT 1;"
# Elvárt: tokens_consumed > 0, cost_usd > 0

# B2 — Document metering
# Tölts fel egy dokumentumot, majd:
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "
SELECT documents_stored FROM usage_records
WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed'
ORDER BY period_start DESC LIMIT 1;"
# Elvárt: documents_stored >= 1

# B3 — RAG queries metering
# Kérdezz rá valamire a Chat oldalon, majd:
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "
SELECT rag_queries FROM usage_records
WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed'
ORDER BY period_start DESC LIMIT 1;"
# Elvárt: rag_queries >= 1
```

### Phase C tesztek

```powershell
# C1 — Quota check on email-log
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "
UPDATE tenant_quotas SET max_emails_per_month = 0
WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed';"

# Küldj egy emailt az n8n-en keresztül
# Elvárt: email-log visszaad {"status":"quota_exceeded"}

# Visszaállítás:
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "
UPDATE tenant_quotas SET max_emails_per_month = 500
WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed';"

# C4 — No hardcoded tenant fallback
# Küldd el az email-log-ot API key nélkül, tenant_id nélkül
$body = @{subject="test"; body="test"; message_id="test-999"} | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:8000/api/email-log" -Method POST `
  -ContentType "application/json" -Body $body -UseBasicParsing
# Elvárt: {"status":"error","detail":"tenant_id nem azonosítható"}
```

### Phase D tesztek

```powershell
# D1 — Senior approve endpoint
$tokenA = (Invoke-WebRequest -Uri "http://localhost:8000/api/auth/login" `
  -Method POST -UseBasicParsing -ContentType "application/json" `
  -Body '{"email":"admin@agentify-test.hu","password":"TestAdmin2024!"}' | 
  ConvertFrom-Json -InputObject {$_.Content}).access_token

# Get a NEEDS_ATTENTION email
$emails = Invoke-WebRequest -Uri "http://localhost:8000/api/emails?status=NEEDS_ATTENTION" `
  -Headers @{Authorization="Bearer $tokenA"} -UseBasicParsing
$emailId = ($emails.Content | ConvertFrom-Json).emails[0].id

# Senior approve as admin — should succeed
Invoke-WebRequest -Uri "http://localhost:8000/api/approvals/$emailId/senior-approve" `
  -Method POST -Headers @{Authorization="Bearer $tokenA"} `
  -ContentType "application/json" -Body '{}' -UseBasicParsing

# D2 — Invoice auto-trigger
# Küldj számlás emailt: "Mellékelem az SZ-2024-1234 számlát, 150000 Ft"
# Várj 30 másodpercet, majd:
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "
SELECT invoice_number, amount, confidence FROM invoice_extractions
WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed'
ORDER BY created_at DESC LIMIT 3;"
# Elvárt: sor létezik invoice_number-rel

# D3 — Source docs in classify path
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "
SELECT sources_count, source_docs FROM rag_logs
WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed'
AND collection = 'classify'
ORDER BY created_at DESC LIMIT 3;"
# Elvárt: sources_count > 0, source_docs tartalmaz fájlneveket
```

---

## 7. VÉGSŐ PRODUCTION READINESS CHECKLIST

### Biztonság
- [ ] JWT_SECRET_KEY beállítva erős véletlen értékre
- [ ] DASHBOARD_API_KEY beállítva
- [ ] ALLOWED_ORIGINS szűkítve a valós domainre
- [ ] Tenant API key generálva minden n8n workflow-hoz
- [ ] Hardcoded tenant UUID eltávolítva az n8n workflow-kból

### Adatvédelem
- [ ] Qdrant tenant izoláció aktív (collection-per-tenant)
- [ ] Feedback learning tenant-scoped
- [ ] Cross-tenant adatszivárgás ellenőrizve (Test 1.1)
- [ ] GDPR: adat törlési endpoint dokumentálva

### Megbízhatóság
- [ ] Redis volume mountolva (arq job queue perzisztens)
- [ ] Worker healthcheck aktív
- [ ] Backend healthcheck aktív
- [ ] OpenAI retry logika aktív (3 kísérlet)
- [ ] Quota enforcement aktív (429 visszatérési kód)

### Megfigyelhetőség
- [ ] agent_runs minden AI híváshoz logol
- [ ] Token és cost metering aktív
- [ ] Documents stored metering aktív
- [ ] Structured JSON logging aktív
- [ ] /api/metrics endpoint elérhető

### Skálázhatóság
- [ ] Dokumentum ingest async (arq queue)
- [ ] Rate limiting aktív (slowapi)
- [ ] Upload fájlok tisztítása indexelés után
- [ ] Feedback embedding cache (Phase F+)

### Deployolhatóság
- [ ] .env.example teljes és dokumentált
- [ ] docker-compose.yml production-ready
- [ ] Migrációk sorban futtathatók (v3_4 → v3_22)
- [ ] Worker image builds és indul
- [ ] Frontend build reprodukálható

### Magyar piac specifikus
- [ ] NAV/adó policy blokkolás aktív
- [ ] Könyvelőiroda sablonok betöltve (migrate_v3_17)
- [ ] Magyar UTF-8 kezelés Qdrant-ban
- [ ] HU/EN/DE language detection aktív
- [ ] Invoice extraction HUF-aware
