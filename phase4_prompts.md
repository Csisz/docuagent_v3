# DocuAgent v3 — Claude Code Prompts (Rewritten)
# Based on codebase audit + analysis doc + Viktor's decisions
# April 2026

---

## PHASE 1 — Tenant Isolation & Execution Discipline
**Goal: Fix the two existential production blockers. Nothing else.**

---

```
You are a senior backend architect working on DocuAgent v3, a multi-tenant AI SaaS for Hungarian SMB accounting and legal firms.

You have been given the full codebase. Read and understand it before making changes. The system is built with FastAPI, PostgreSQL (asyncpg), Qdrant, and n8n. Docker Compose is used for all services.

## CONTEXT: WHAT ALREADY EXISTS

The following are already implemented and working. Do NOT rewrite or restructure them:
- auth system (JWT + API key, core/security.py, routers/auth.py)
- email approval flow (routers/emails.py, routers/classify.py)
- document upload + RAG pipeline (routers/documents.py, services/qdrant_service.py)
- onboarding wizard, template library, approval inbox (routers/onboarding.py, routers/templates.py)
- n8n webhook integrations and calendar sync
- all frontend pages

## WHAT IS BROKEN (your job)

### BLOCKER 1 — Qdrant has no tenant isolation

Current state: store_document() in services/qdrant_service.py stores vectors with these payload fields:
  filename, text, tag, collection, department, access_level, uploader, doc_id, chunk_index, total_chunks, upload_time

Missing: tenant_id is NOT in the payload. search() and search_multi() do NOT filter by tenant_id.
This means one tenant's documents can appear in another tenant's RAG results. This is a hard SaaS blocker.

Strategy chosen: collection-per-tenant-per-domain.
Collection naming convention: {tenant_id_short}_{domain}
Where tenant_id_short = first 8 chars of tenant UUID, domain = tag-mapped domain (billing, legal, support, general, hr)

### BLOCKER 2 — Feedback learning is not tenant-scoped

Current state:
- get_recent_feedback(limit=30) in db/queries.py has no WHERE tenant_id = $1
- get_feedback_for_prompt(limit=10) in db/queries.py has no WHERE tenant_id = $1
- get_feedback_context() in services/learning_service.py calls both without tenant_id

This means one accounting firm's human corrections can influence another firm's AI classification.

### PROBLEM 3 — No canonical execution model

There is no agent_runs table or concept. When something fails (webhook, AI call, doc processing), there is no record of what was attempted, what failed, and what the state is.

### PROBLEM 4 — No async separation

OpenAI calls are made inline in the request path (classify.py, chat.py). At small scale this is fine. The interface must be prepared for async without adding Redis/Celery yet.

## YOUR TASKS

### Task 1: Fix Qdrant tenant isolation

Modify: backend/services/qdrant_service.py

Changes:
1. store_document() must accept tenant_id: str parameter and include it in every vector payload
2. Collection name must be generated as: f"{tenant_id[:8]}_{domain}" where domain = tag_to_collection(tag)
3. ensure_collection() must handle the new collection naming
4. search() must accept tenant_id: str and add a Qdrant filter: must match tenant_id in payload
5. search_multi() must pass tenant_id to every search() call and build collection list from tenant prefix
6. delete_by_doc_id() must scope deletion to tenant collections only
7. Add a new function: get_tenant_collections(tenant_id: str) -> list[str] that returns all collection names for a tenant

Update all callers:
- backend/routers/documents.py: pass tenant_id to store_document()
- backend/routers/classify.py: pass tenant_id to all search/search_multi calls in generate_reply
- backend/routers/chat.py: pass tenant_id to all RAG search calls
- Verify backend/routers/documents.py delete endpoint uses tenant-scoped deletion

Do NOT change the COLLECTION_MAP in core/config.py — it maps tags to domain names, which are still used as the suffix. Only the collection name construction changes.

### Task 2: Fix feedback tenant isolation

Modify: backend/db/queries.py

Changes:
1. get_recent_feedback(limit, tenant_id) — add WHERE tenant_id = $2 (or $1 if limit moved)
2. get_feedback_for_prompt(limit, tenant_id) — same
3. insert_feedback() — verify tenant_id is stored (it is in schema, just confirm)

Modify: backend/services/learning_service.py

Changes:
1. get_feedback_context(subject, body, tenant_id) — pass tenant_id to both query functions
2. The embedding matching loop is unchanged in logic, just scoped to tenant rows

Update callers:
- backend/routers/classify.py: extract tenant_id from request context and pass to get_feedback_context()
- The tenant_id must come from the authenticated user's JWT or API key context, NOT from request body

### Task 3: Add agent_runs execution model

Create new migration: db/migrate_v3_14_agent_runs.sql

Schema:
```sql
CREATE TABLE IF NOT EXISTS agent_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    trigger_type    TEXT NOT NULL,  -- 'email_classify', 'reply_generate', 'doc_ingest', 'chat', 'n8n_webhook'
    trigger_ref     UUID,           -- email_id, document_id, or null
    input_summary   TEXT,           -- short description of input (not full body)
    status          TEXT NOT NULL DEFAULT 'running',  -- running, success, failed, timeout
    ai_model        TEXT,
    prompt_tokens   INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    cost_usd        FLOAT DEFAULT 0,
    latency_ms      INT,
    error_message   TEXT,
    result_summary  TEXT,           -- short description of outcome
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    CONSTRAINT agent_runs_status_check CHECK (status IN ('running','success','failed','timeout'))
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_id   ON agent_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status      ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at  ON agent_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_trigger_ref ON agent_runs(trigger_ref);
```

Create: backend/db/run_queries.py

Functions:
- create_run(tenant_id, trigger_type, trigger_ref, input_summary) -> run_id
- finish_run(run_id, status, cost_usd, latency_ms, result_summary, error_message=None)
- get_runs_for_tenant(tenant_id, limit=50) -> list
- get_failed_runs(tenant_id, limit=20) -> list

Instrument these existing flows with agent_runs logging:
- classify endpoint: create_run at start, finish_run at end with token counts from OpenAI response
- generate_reply endpoint: same
- document upload + Qdrant store: create_run('doc_ingest'), finish with ok/fail
- Do NOT instrument chat sessions per message — instrument per session start/end

### Task 4: Prepare async interface without adding Redis

Modify: backend/routers/documents.py

For document ingestion (the PDF/DOCX processing + Qdrant store step):
- Wrap the heavy processing in FastAPI BackgroundTasks
- The endpoint returns immediately with: {"status": "processing", "run_id": "...", "doc_id": "..."}
- The background task calls store_document() and then calls finish_run()
- Add a GET /api/documents/{doc_id}/status endpoint that returns the agent_run status

This is the async interface. Redis/arq will slot in behind this interface in Phase 3 without changing the API contract.

## EXPLICIT FILE LIST

Files to modify:
- backend/services/qdrant_service.py
- backend/services/learning_service.py
- backend/db/queries.py
- backend/routers/documents.py
- backend/routers/classify.py
- backend/routers/chat.py

Files to create:
- db/migrate_v3_14_agent_runs.sql
- backend/db/run_queries.py

Files to NOT touch:
- backend/main.py (no new routers needed in this phase)
- backend/routers/emails.py
- backend/routers/auth.py
- backend/routers/agents.py
- backend/routers/crm.py
- backend/routers/calendar.py
- all frontend files
- docker-compose.yml
- backend/core/config.py (COLLECTION_MAP stays as-is)

## OUTPUT EXPECTED

For each changed file: the complete new file content, not a diff.
For new files: complete content.
After all files: one Docker command block to run the migration:
  docker exec -i docuagent_v3-postgres-1 psql -U $POSTGRES_USER -d $POSTGRES_DB < db/migrate_v3_14_agent_runs.sql

Then one test curl block validating:
1. Upload a document as tenant A
2. Query RAG as tenant B → must return no results from tenant A's docs
3. Classify an email as tenant A → learning context must only contain tenant A's feedback
```

---

## PHASE 2 — Real Agent Runtime: Layers, Policy Engine, Structured Outputs
**Goal: Turn the current endpoint-driven system into a layered agent architecture.**

---

```
You are a senior AI agent architect working on DocuAgent v3.

You have the full codebase. Phase 1 is complete: Qdrant is tenant-isolated, feedback is tenant-scoped, agent_runs exists.

Read the codebase before making changes. Understand the existing classify.py and chat.py before touching them.

## CONTEXT: WHAT ALREADY EXISTS

Working and stable (do not restructure):
- All Phase 1 changes (tenant-isolated Qdrant, tenant-scoped feedback, agent_runs)
- Email classification and reply generation (routers/classify.py)
- Approval inbox and approval workflow (routers/emails.py)
- Template system (routers/templates.py)
- CRM and case entities (routers/crm.py)
- n8n webhook integrations

## WHAT THIS PHASE ADDS

DocuAgent currently handles AI tasks through direct endpoint calls. There is no concept of:
- which agent layer is responsible for what
- what policy governs AI decisions
- how structured outputs are enforced consistently
- how cases link to emails and documents

This phase introduces those concepts.

## AGENT LAYER MODEL

Define these 5 layers. Each is a Python module, not a separate microservice:

**Layer 1 — Intake**
Responsibility: receive input (email, document, chat message), normalize it, enrich with metadata.
Lives in: backend/agents/intake.py
Produces: IntakeContext dataclass with tenant_id, input_type, raw_content, detected_language, extracted_entities (invoice IDs, dates, amounts, names)

**Layer 2 — Knowledge**
Responsibility: RAG retrieval, feedback context, correction memory.
Lives in: backend/agents/knowledge.py
Produces: KnowledgeContext dataclass with rag_results, feedback_hint, forced_override, confidence_from_memory

**Layer 3 — Drafting**
Responsibility: AI classification and reply generation, using Intake + Knowledge context.
Lives in: backend/agents/drafting.py
Produces: DraftResult dataclass with category, confidence, ai_reply, reasoning, model_used, token_counts

**Layer 4 — Compliance**
Responsibility: evaluate DraftResult against policy rules. Decide: auto-approve, require_approval, or block.
Lives in: backend/agents/compliance.py
Produces: ComplianceDecision dataclass with action (auto|review|block), reason, applied_rules

**Layer 5 — Action**
Responsibility: execute the decision — update DB, trigger n8n webhook, log agent_run.
Lives in: backend/agents/action.py
Produces: ActionResult dataclass with status, email_status_set, n8n_triggered, run_id

## YOUR TASKS

### Task 1: Policy Engine

Strategy chosen: code-based base policy with DB-level tenant overrides.

Create: backend/services/policy_engine.py

Base policy rules (Python, hardcoded defaults):
```python
BASE_POLICY = {
    "min_confidence_for_auto": 0.75,
    "complaints_always_review": True,
    "legal_category_always_review": True,
    "tax_keywords_always_review": True,   # NAV, KATA, ÁFA, adó, etc.
    "invoice_keywords_always_review": True, # számla, fizetés, díj, etc.
    "attachment_present_review": True,
    "max_auto_reply_per_hour": 50,
    "low_urgency_max_auto_confidence": 0.85,
    "high_urgency_always_review": True,   # urgency_score >= 75
}
```

DB table: policy_overrides
Create migration: db/migrate_v3_15_policy.sql
```sql
CREATE TABLE IF NOT EXISTS policy_overrides (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_key    TEXT NOT NULL,
    rule_value  TEXT NOT NULL,  -- stored as string, cast at runtime
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, rule_key)
);
```

policy_engine.py functions:
- get_policy(tenant_id) -> dict  (merges BASE_POLICY with tenant DB overrides)
- evaluate(draft_result, intake_context, policy) -> ComplianceDecision
- The evaluate function checks ALL policy conditions and returns the strictest action

TAX and INVOICE keyword lists must cover Hungarian terms:
- Tax keywords: NAV, KATA, ÁFA, SZJA, adó, bevallás, adóhatóság, iparűzési
- Invoice keywords: számla, díjbekérő, fizetés, tartozás, kiegyenlítés, számlakorrekció

### Task 2: Structured output enforcement

Modify: backend/agents/drafting.py (new file)
Modify: backend/routers/classify.py to delegate to the agent layers

The classification JSON schema must be validated with Pydantic before use. Define:

```python
class ClassificationOutput(BaseModel):
    can_answer: bool
    confidence: float = Field(ge=0.0, le=1.0)
    category: Literal["complaint", "inquiry", "appointment", "other"]
    reason: str
    urgency_score: int = Field(ge=0, le=100)
    sentiment: Literal["positive", "neutral", "negative", "angry"]
    booking_intent: bool
    detected_entities: list[str] = []  # NEW: invoice IDs, dates, names found
```

If OpenAI returns malformed JSON: retry once with a stricter prompt. If still invalid: return a safe fallback with can_answer=False, confidence=0.0, status=NEEDS_ATTENTION, and log the failure in agent_runs.

### Task 3: Entity extraction in Intake layer

The Intake layer must extract structured entities from email bodies using a lightweight extraction prompt (use GPT-4o-mini for this, NOT GPT-4o).

Entities to extract:
- invoice_ids: list of strings matching patterns like SZ-2024-001, #12345, INV-xxx
- dates: list of date strings (Hungarian: "március 15", "2024.03.15", "holnap")
- amounts: list of amount strings ("150.000 Ft", "1200 EUR")
- company_names: list of detected company names
- urgency_signals: list of urgent Hungarian/English keywords found

Store extracted entities in the agent_run result_summary as JSON.

### Task 4: Case linking

The existing CRM has cases (routers/crm.py). Emails should auto-link to cases.

Add to backend/agents/action.py:
- After processing an email, attempt to find a matching open case for the same sender domain
- If found: link the email to the case via a new email_cases junction table
- If not found and urgency_score >= 50: create a new case automatically

Create migration: db/migrate_v3_16_email_cases.sql
```sql
CREATE TABLE IF NOT EXISTS email_cases (
    email_id    UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    linked_at   TIMESTAMPTZ DEFAULT NOW(),
    linked_by   TEXT DEFAULT 'auto',
    PRIMARY KEY (email_id, case_id)
);
```

### Task 5: Wire the layers into existing endpoints

Modify: backend/routers/classify.py

The /api/classify and /api/generate-reply endpoints must now call the agent layers in sequence:
1. intake.process(email_data, tenant_id) -> IntakeContext
2. knowledge.retrieve(intake_context) -> KnowledgeContext
3. drafting.run(intake_context, knowledge_context, policy) -> DraftResult
4. compliance.evaluate(draft_result, intake_context, policy) -> ComplianceDecision
5. action.execute(draft_result, compliance_decision, intake_context) -> ActionResult

The endpoint response schema stays the same (backward compatible). The layering is internal.

### Task 6: Model routing optimization

Modify: backend/services/openai_service.py

Add a model_router function:
```python
def select_model(task: str, confidence_needed: float, tenant_policy: dict) -> str:
    """
    task options: 'classify', 'extract_entities', 'draft_reply', 'chat'
    Returns the appropriate model string.
    """
```

Routing rules:
- 'classify': always gpt-4o-mini (fast, cheap, sufficient for JSON classification)
- 'extract_entities': always gpt-4o-mini
- 'draft_reply': gpt-4o if confidence_needed > 0.8 or policy says premium_replies=True, else gpt-4o-mini
- 'chat': gpt-4o-mini by default, gpt-4o if tenant plan is 'enterprise'

Log model used in agent_runs.ai_model column.

## EXPLICIT FILE LIST

Files to create:
- backend/agents/__init__.py
- backend/agents/intake.py
- backend/agents/knowledge.py
- backend/agents/drafting.py
- backend/agents/compliance.py
- backend/agents/action.py
- backend/services/policy_engine.py
- db/migrate_v3_15_policy.sql
- db/migrate_v3_16_email_cases.sql

Files to modify:
- backend/routers/classify.py (wire to agent layers)
- backend/services/openai_service.py (add model_router)
- backend/db/queries.py (add policy_overrides queries)

Files to NOT touch:
- backend/routers/emails.py
- backend/routers/documents.py
- backend/routers/chat.py
- backend/routers/crm.py
- backend/routers/auth.py
- all frontend files
- docker-compose.yml
- backend/db/run_queries.py

## OUTPUT EXPECTED

Complete file content for every file created or modified.
Two migration run commands.
One end-to-end test scenario:
  POST /api/classify with a Hungarian tax inquiry email
  → show that: intake extracted entities, policy correctly required review, agent_run was logged with model and cost
```

---

## PHASE 3 — Könyvelő-First Sellable Product
**Goal: Make DocuAgent the obvious choice for a Hungarian accounting firm in one session.**

---

```
You are a SaaS product architect and frontend engineer working on DocuAgent v3.

Phase 1 and Phase 2 are complete. The backend is tenant-isolated, layered, and policy-driven.

Your job now is to make this product sellable to Hungarian accounting firms (könyvelőirodák). A firm owner must be able to connect their Gmail, upload 2-3 documents, and receive their first approval-ready AI draft within 10 minutes — without any technical knowledge.

## CONTEXT: WHAT ALREADY EXISTS

Working features to build on, do NOT restructure:
- Onboarding wizard (routers/onboarding.py, pages/OnboardingPage.jsx) — exists but needs könyvelő content
- Template library (routers/templates.py, pages/TemplatePage.jsx) — exists but needs accounting templates
- Approval inbox (pages/ApprovalPage.jsx) — exists, confidence scoring works
- Gmail integration (n8n workflow, integrations router)
- Document upload (routers/documents.py) — works, now with tenant isolation

## WHAT THIS PHASE ADDS

### 1. Accounting-specific onboarding wizard

The existing OnboardingPage.jsx must be updated to use könyvelő-specific language and flow.

Steps (keep the wizard structure, change the content):
1. **Üdvözlés** — "Csináljunk rendet a könyvelőiroda emailjeiben" — not generic AI assistant language
2. **Gmail kapcsolás** — connect Gmail with clear explanation: "Az AI olvassa és kategorizálja az ügyfélleveleket"
3. **Cég adatai** — company name, industry (könyvelőiroda pre-selected), preferred language (HU default)
4. **Szabályok beállítása** — simple language policy toggles, pre-set to accounting defaults:
   - "Számla- és pénzügyi levelek mindig emberi jóváhagyást kapnak" (ON, locked)
   - "NAV-os levelek mindig emberi jóváhagyást kapnak" (ON, locked)
   - "Általános kérdések auto-válasza" (ON, configurable threshold)
5. **Első dokumentum feltöltése** — "Töltsd fel a GYIK-et vagy a Szolgáltatási Feltételeket"
6. **Kész** — show a preview of what happens when the first email arrives

All step descriptions must be in Hungarian. No technical terms (no "RAG", no "confidence threshold", no "vector", no "tenant").

### 2. Accounting template pack

The existing template system supports template categories. Add a complete Hungarian accounting template pack.

Create/update: backend/routers/templates.py — add seed endpoint or migration data
Create: db/migrate_v3_17_accounting_templates.sql

Templates to seed (in Hungarian, realistic könyvelőiroda content):

Category: Általános válaszok
- "Dokumentum beérkezett" — visszaigazolás hogy megkaptuk az ügyfél dokumentumát
- "Hiányos dokumentáció" — értesítés hogy hiányoznak dokumentumok, lista a szükségesekről
- "Határidő emlékeztető" — ÁFA bevallás / SZJA / iparűzési adó határidő közeledik

Category: Számla és pénzügy
- "Számla beérkezett" — visszaigazolás és következő lépések
- "Számlakorrekció szükséges" — értesítés problémáról
- "Díjbekérő válasz" — standard válasz díjbekérő kérdésekre

Category: NAV és adóhatóság
- "NAV levél átadva" — jelzés hogy NAV levelet kaptunk, könyvelő vizsgálja
- "Adóbevallás státusz" — általános státuszválasz
- "Adatigénylés visszaigazolás" — standard adatigénylés válasz

Each template must have: title (HU), body (HU, professional könyvelő tone), category, tags, confidence_threshold.

### 3. Invoice and document entity detection UI

The agent layer (Phase 2) extracts entities. Now surface them in the UI.

Modify: frontend/src/pages/ApprovalPage.jsx

When displaying an email pending approval, if the email has detected entities (invoice_ids, amounts, dates), show an "Azonosított adatok" panel above the reply editor:
- Invoice IDs detected: shown as tags
- Amounts: shown with HUF/EUR label
- Dates: shown with Hungarian date format
- "NAV vagy adó tartalom észlelve" badge if tax keywords were found

This panel is read-only in Phase 3. It is the foundation for Phase 4's structured extraction workflow.

### 4. Source trust panel

Modify: frontend/src/pages/ApprovalPage.jsx

When an AI draft is shown, display the RAG sources that were used:
- Show a collapsible "Mire támaszkodott az AI?" section
- List each source document with: filename, relevance score as a visual bar (0–100%), collection/tag label
- If no sources: show "Általános tudás alapján" message
- If confidence < 0.6: show a yellow warning "Alacsony bizonyossági szint — ajánlott emberi felülvizsgálat"

### 5. ROI dashboard widget

Modify: frontend/src/pages/DashboardPage.jsx

Add a "Megtakarított idő" widget at the top of the dashboard. Calculation:
- Count auto-approved emails this month (status went from AI_ANSWERED to CLOSED without human edit)
- Multiply by 8 minutes (estimated time per manual reply)
- Show: "~X perc megtakarított idő ezen a héten" and "~Y óra ezen a hónapban"
- Show: "Z email ment ki emberi jóváhagyás nélkül" and "W email ment emberi felülvizsgálatra"
- Add a simple bar comparing this week vs last week auto-approval rate

The calculation is approximate and shown with a "~" prefix. No false precision.

### 6. First-run experience

If a tenant has 0 emails and 0 documents, the main dashboard must show an empty state that guides them:
- Not a generic "No data" message
- A 3-step checklist: "1. Gmail összekapcsolt ✓ / 2. Dokumentum feltöltve (0/1) / 3. Első email megérkezett"
- Each step is a link/button to the relevant action

## EXPLICIT FILE LIST

Files to modify:
- frontend/src/pages/OnboardingPage.jsx (könyvelő content + Hungarian copy)
- frontend/src/pages/ApprovalPage.jsx (entity panel + source trust panel)
- frontend/src/pages/DashboardPage.jsx (ROI widget + empty state)
- backend/routers/templates.py (add accounting template seeding)

Files to create:
- db/migrate_v3_17_accounting_templates.sql (with full Hungarian template content)

Files to NOT touch:
- backend/agents/* (Phase 2 output)
- backend/services/qdrant_service.py
- backend/services/policy_engine.py
- backend/routers/classify.py
- backend/routers/documents.py
- backend/routers/auth.py
- docker-compose.yml

## Billingo/Számlázz.hu note

Invoice API integration (actual API calls to Billingo/Számlázz.hu) is NOT part of this phase.
This phase only surfaces detected invoice data (entities) in the UI.
The actual integration is Phase 4.

## OUTPUT EXPECTED

Complete file content for every modified file.
Migration SQL with all 9 accounting templates fully written in Hungarian.
One user journey test: simulate a new könyvelő user from login → onboarding → first document → approval inbox — describe what they see at each step.
```

---

## PHASE 4 — Scalable SaaS: Metering, Queue, Enterprise Features, Market Leader
**Goal: Make DocuAgent operate reliably at 100+ tenants and start the Hungarian market-leader features.**

---

```
You are a SaaS systems architect working on DocuAgent v3.

Phases 1, 2, and 3 are complete. The system is tenant-safe, layered, and has a könyvelő-focused product UI.

This phase makes the system commercially operable: metering, billing signals, proper async queue, role-based access, and the first features that create a Hungarian-specific moat.

## CONTEXT: WHAT ALREADY EXISTS

Do NOT restructure these:
- agent_runs table and logging (Phase 1)
- policy engine with DB overrides (Phase 2)
- accounting templates (Phase 3)
- all approval and email flows
- tenant/user/role tables in schema

## WHAT THIS PHASE ADDS

### 1. Usage metering per tenant

Create: backend/services/metering.py

Track per tenant per billing period:
- emails_processed (count)
- ai_calls_made (count)
- tokens_consumed (total prompt + completion)
- estimated_cost_usd (sum from agent_runs)
- documents_stored (count)
- rag_queries_made (count)

Create migration: db/migrate_v3_18_metering.sql
```sql
CREATE TABLE IF NOT EXISTS usage_records (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    emails_processed INT DEFAULT 0,
    ai_calls_made   INT DEFAULT 0,
    tokens_consumed BIGINT DEFAULT 0,
    cost_usd        FLOAT DEFAULT 0,
    documents_stored INT DEFAULT 0,
    rag_queries     INT DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, period_start)
);

CREATE TABLE IF NOT EXISTS tenant_quotas (
    tenant_id               UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    plan                    TEXT NOT NULL DEFAULT 'starter',
    max_emails_per_month    INT DEFAULT 500,
    max_documents           INT DEFAULT 50,
    max_ai_calls_per_month  INT DEFAULT 1000,
    max_tokens_per_month    BIGINT DEFAULT 500000,
    allow_premium_model     BOOLEAN DEFAULT FALSE,
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

Metering functions:
- increment_usage(tenant_id, field, value) — called from action.py after each agent run
- get_usage_summary(tenant_id, period) -> dict
- check_quota(tenant_id, resource) -> (allowed: bool, remaining: int)

Quota enforcement:
- If emails_processed >= max_emails_per_month: return 429 with message "Havi email limit elérve"
- If ai_calls >= max_ai_calls: return 429 with message "Havi AI hívás limit elérve"
- Add quota check in classify endpoint BEFORE the agent layers run
- Do NOT enforce in document upload — just log

### 2. Async job queue (replace BackgroundTasks)

The Phase 1 document ingestion used FastAPI BackgroundTasks as a placeholder. Now replace it with arq (async Redis queue).

Add to docker-compose.yml:
```yaml
redis:
  image: redis:7-alpine
  restart: unless-stopped
  ports:
    - "6379:6379"
  networks:
    - docuagent

worker:
  build:
    context: ./backend
    dockerfile: Dockerfile
  command: python -m arq backend.workers.main.WorkerSettings
  restart: unless-stopped
  env_file: .env
  environment:
    - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    - QDRANT_URL=http://qdrant:6333
    - REDIS_URL=redis://redis:6379
  networks:
    - docuagent
  depends_on:
    - postgres
    - redis
    - qdrant
```

Add to backend/requirements.txt:
- arq>=0.25.0
- redis>=5.0.0

Create: backend/workers/main.py
- WorkerSettings class with functions list
- Retry settings: max_tries=3, retry_delay=60s

Create: backend/workers/tasks.py
- async def process_document(ctx, doc_id, tenant_id, file_path, filename, tag, department, access_level, uploader)
  → calls qdrant_service.store_document() and finish_run()
- async def reindex_tenant_documents(ctx, tenant_id)
  → re-embeds all documents for a tenant (for future model upgrades)

Modify: backend/routers/documents.py
- Replace BackgroundTasks with arq job enqueue
- The endpoint response is unchanged: {"status": "processing", "run_id": "...", "doc_id": "..."}

### 3. Role-based approval chains

The current role system has: admin, agent, viewer.

Extend with approval logic:

Modify: db/schema.sql (or create migration db/migrate_v3_19_roles.sql)
Add to users table:
- can_approve_auto: BOOLEAN DEFAULT TRUE (agents can approve normal emails)
- requires_senior_approval_for: TEXT[] DEFAULT '{}' (list of categories like 'legal','tax')

Add to policy_overrides:
- senior_review_categories: JSON list of categories that require admin-level approval

Modify: backend/agents/compliance.py

Add senior_required flag to ComplianceDecision:
- If category is in tenant's senior_review_categories AND approving user role is 'agent': block approval, require admin
- Add endpoint: GET /api/approvals/pending-senior — returns emails that need admin/senior approval
- Add endpoint: POST /api/approvals/{id}/senior-approve — only admin role can call this

Modify: frontend/src/pages/ApprovalPage.jsx
- If email has senior_required=True, show a "Senior jóváhagyás szükséges" badge
- Non-admin users see the email but the approve button is disabled with tooltip

### 4. Prompt versioning

Create: backend/services/prompt_registry.py

A prompt version is: name + version + content + metadata (model, created_at, performance_notes).

Store in DB:
Create: db/migrate_v3_20_prompts.sql
```sql
CREATE TABLE IF NOT EXISTS prompt_versions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,  -- 'classify_system', 'reply_system', 'entity_extract'
    version     INT NOT NULL,
    content     TEXT NOT NULL,
    model_hint  TEXT,
    is_active   BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, version)
);
```

prompt_registry.py functions:
- get_active_prompt(name) -> str
- activate_prompt(name, version)
- list_versions(name) -> list

agent_runs must log: prompt_name + prompt_version used (add columns to agent_runs if needed).

This allows: "which prompt version produced better approval rates?" analysis.

### 5. Billingo invoice extraction workflow (Hungarian moat feature)

This is the first Hungarian-specific integration. It does NOT call the Billingo API yet — it prepares the full extraction + UI pipeline.

Create: backend/routers/invoice_workflow.py

Endpoint: POST /api/invoice-workflow/extract
Input: email_id
Process:
1. Load the email body and any attached document text
2. Call GPT-4o-mini with an invoice extraction prompt
3. Extract structured invoice data: {invoice_number, vendor_name, amount, currency, due_date, vat_amount, issue_date}
4. Store result in a new invoice_extractions table
5. Log agent_run

Create migration: db/migrate_v3_21_invoice_extractions.sql
```sql
CREATE TABLE IF NOT EXISTS invoice_extractions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_id        UUID REFERENCES emails(id),
    document_id     UUID REFERENCES documents(id),
    invoice_number  TEXT,
    vendor_name     TEXT,
    amount          FLOAT,
    currency        TEXT DEFAULT 'HUF',
    due_date        DATE,
    issue_date      DATE,
    vat_amount      FLOAT,
    raw_extraction  JSONB,
    confidence      FLOAT,
    status          TEXT DEFAULT 'extracted',  -- extracted, verified, rejected, sent_to_billingo
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

Modify: frontend/src/pages/ApprovalPage.jsx
- If invoice data is extracted, show "Számla adatok" card with the extracted fields
- Add "Mentés" button that saves verified invoice data
- Add placeholder "Küldés Billingo-ba" button (disabled, tooltip: "Hamarosan elérhető")

### 6. Error center / retry UI

Create: frontend/src/pages/ErrorCenterPage.jsx (or add as tab to existing page)

Shows:
- List of failed agent_runs for the tenant (from GET /api/runs/failed)
- For each: trigger_type, error_message, created_at, retry button
- Retry button calls: POST /api/runs/{run_id}/retry
  → re-enqueues the job in arq if async, or re-runs synchronously if sync

Create: backend/routers/runs.py
- GET /api/runs — list recent runs for tenant (paginated)
- GET /api/runs/failed — failed runs only
- POST /api/runs/{run_id}/retry — re-trigger

Add to frontend Sidebar: "Hibák" link if there are any failed runs (badge with count)

### 7. Usage dashboard for tenant admins

Modify: frontend/src/pages/DashboardPage.jsx

Add "Használat és korlátok" section (visible to admin role only):
- Progress bars: emails this month (X / limit), AI calls (X / limit), documents (X / limit)
- Estimated cost this month: "~$X.XX"
- Plan name and upgrade CTA (placeholder link for now)
- Link to download usage report as CSV

## EXPLICIT FILE LIST

Files to create:
- backend/services/metering.py
- backend/services/prompt_registry.py
- backend/workers/__init__.py
- backend/workers/main.py
- backend/workers/tasks.py
- backend/routers/invoice_workflow.py
- backend/routers/runs.py
- frontend/src/pages/ErrorCenterPage.jsx
- db/migrate_v3_18_metering.sql
- db/migrate_v3_19_roles.sql
- db/migrate_v3_20_prompts.sql
- db/migrate_v3_21_invoice_extractions.sql

Files to modify:
- docker-compose.yml (add redis + worker services)
- backend/requirements.txt (add arq, redis)
- backend/main.py (register new routers: invoice_workflow, runs)
- backend/routers/documents.py (switch BackgroundTasks → arq)
- backend/routers/classify.py (add quota check)
- backend/agents/compliance.py (senior approval logic)
- frontend/src/pages/ApprovalPage.jsx (senior badge + invoice card)
- frontend/src/pages/DashboardPage.jsx (usage section)
- frontend/src/components/layout/Sidebar.jsx (error badge)
- frontend/src/App.jsx (add ErrorCenterPage route)

Files to NOT touch:
- backend/agents/intake.py, knowledge.py, drafting.py, action.py (Phase 2 output)
- backend/services/qdrant_service.py
- backend/services/policy_engine.py
- backend/services/learning_service.py
- backend/routers/emails.py
- backend/routers/auth.py
- backend/routers/templates.py
- backend/routers/onboarding.py

## OUTPUT EXPECTED

Complete file content for all created and modified files.
All 4 migration files with complete SQL.
Updated docker-compose.yml.
One operational readiness test: 
  - Start the full stack including redis and worker
  - Process 3 emails for tenant A (verify metering increments)
  - Trigger a document ingest via queue (verify arq job succeeds)
  - Simulate quota breach (verify 429 response)
  - Check failed runs appear in ErrorCenter
```
