# DocuAgent v3 — Phase Validation Test Protocol (Rewritten)
# Based on actual codebase + analysis + phase prompt decisions
# April 2026

---

## How to use this document

Each phase has:
- **Prerequisites** — what must be true before testing starts
- **Tests** — specific, verifiable checks with exact API calls or UI steps
- **Pass/Fail criteria** — binary, no ambiguity
- **Rollback note** — what to watch for if something breaks

Run tests in order. Each phase depends on the previous.

---

## Phase 1 — Tenant Isolation & Execution Discipline

**Prerequisites:**
- Migration `migrate_v3_14_agent_runs.sql` has been run
- Two test tenants exist: tenant_A and tenant_B (different UUIDs)
- At least one document uploaded per tenant to different Qdrant collections

---

### Test 1.1 — Qdrant vector isolation

**Steps:**
1. Upload document to tenant_A: `POST /api/documents` (with JWT for tenant_A user)
   - File content: "Az ÁFA bevallás határideje március 31."
   - Tag: "billing"
2. Query RAG as tenant_B: `POST /api/rag/query` (with JWT for tenant_B user)
   - Query: "ÁFA bevallás határideje"

**Pass:** Response returns 0 results or results only from tenant_B's own documents.
**Fail:** Response returns the document uploaded by tenant_A.

**Verify in Qdrant directly:**
```
GET http://localhost:6333/collections
```
Expected: collection names contain tenant_A's UUID prefix (e.g., `a1b2c3d4_billing`). tenant_B's prefix is different.

---

### Test 1.2 — Qdrant payload contains tenant_id

**Steps:**
1. After uploading a document for tenant_A, query Qdrant directly:
```
POST http://localhost:6333/collections/{tenant_a_collection}/points/search
Body: {"vector": [...], "limit": 1, "with_payload": true}
```

**Pass:** Every returned point's payload contains `"tenant_id": "{tenant_a_uuid}"`.
**Fail:** `tenant_id` key is missing from payload.

---

### Test 1.3 — Feedback learning is tenant-scoped

**Steps:**
1. As tenant_A: classify email, then manually override to "complaint" → creates feedback row
2. As tenant_B: classify a similar email

**Pass:** tenant_B's classification prompt context does NOT include tenant_A's feedback corrections.

**Verify via SQL:**
```sql
SELECT tenant_id, COUNT(*) FROM feedback GROUP BY tenant_id;
```
Each tenant's feedback is counted separately. No feedback row has NULL tenant_id.

---

### Test 1.4 — agent_runs records every execution

**Steps:**
1. As tenant_A: POST /api/classify with any email
2. As tenant_A: POST /api/generate-reply for that email
3. As tenant_A: upload a document

**Verify via SQL:**
```sql
SELECT trigger_type, status, latency_ms, cost_usd FROM agent_runs WHERE tenant_id = '{tenant_a_uuid}' ORDER BY created_at DESC LIMIT 5;
```

**Pass:** 3 rows exist (email_classify, reply_generate, doc_ingest). All have status='success'. latency_ms > 0. cost_usd > 0 for AI calls.
**Fail:** Rows missing, or status='running' (never finished), or cost_usd = 0 for AI calls.

---

### Test 1.5 — Document ingestion is async

**Steps:**
1. POST /api/documents with a PDF (any)

**Pass:** Response arrives in < 2 seconds. Response body contains `{"status": "processing", "run_id": "...", "doc_id": "..."}`.
2. Poll GET /api/documents/{doc_id}/status every 5 seconds.
**Pass:** Within 60 seconds, status changes to "success" or "failed" (not stuck on "processing").
**Fail:** Endpoint blocks for > 5 seconds before responding. Or status never updates.

---

### Test 1.6 — Cross-tenant API key does not leak data

**Steps:**
1. Using tenant_A's API key (X-API-Key header): GET /api/emails
2. Using tenant_B's API key: GET /api/emails

**Pass:** Each returns only their own tenant's emails. No overlap.
**Fail:** Any email from tenant_A appears in tenant_B's response or vice versa.

---

**Phase 1 Pass Criteria:** All 6 tests pass. Zero cross-tenant data leaks in any test.

---

## Phase 2 — Agent Runtime: Layers, Policy, Structured Outputs

**Prerequisites:**
- Phase 1 all tests pass
- Migrations `migrate_v3_15_policy.sql` and `migrate_v3_16_email_cases.sql` run
- `backend/agents/` directory exists with all 5 layer files

---

### Test 2.1 — Policy engine blocks NAV-related emails from auto-approval

**Steps:**
1. POST /api/classify with this body:
```json
{
  "subject": "NAV ellenőrzés értesítő",
  "body": "Értesítjük, hogy adóellenőrzésre kerül sor vállalkozásánál. Kérem vegye fel velünk a kapcsolatot."
}
```

**Pass:** Response contains `"can_answer": false` and `"status": "NEEDS_ATTENTION"` regardless of AI confidence. The `reason` field mentions policy or NAV keyword block.
**Fail:** Email is auto-approved.

---

### Test 2.2 — Policy engine blocks complaint emails from auto-approval

**Steps:**
1. POST /api/classify with:
```json
{
  "subject": "Elégedetlen vagyok a szolgáltatással",
  "body": "Már harmadik alkalommal hibás a számla amit küldtek. Ez teljesen elfogadhatatlan."
}
```

**Pass:** `"category": "complaint"` and `"can_answer": false`. Policy rule `complaints_always_review: True` was applied.
**Fail:** Auto-approved or category is wrong.

---

### Test 2.3 — Structured output validation catches malformed AI response

**Steps:**
1. Temporarily inject a mock that returns invalid JSON from OpenAI (e.g., `{"confidence": "high"}` missing required fields)
2. Call POST /api/classify

**Pass:** System retries once, then returns a safe fallback: `{"can_answer": false, "confidence": 0.0, "status": "NEEDS_ATTENTION"}`. An agent_run row with `status='failed'` and `error_message` set is created.
**Fail:** System crashes with 500, or returns malformed data to caller, or swallows the error silently.

---

### Test 2.4 — Entity extraction works on invoice-like email

**Steps:**
1. POST /api/classify with:
```json
{
  "subject": "SZ-2024-0423 számla beküldve",
  "body": "Mellékelem a 2024. március 15-i keltű, 150.000 Ft értékű számlát (számlaszám: SZ-2024-0423). Kérem szíves feldolgozásukat."
}
```

**Pass:** agent_run row for this classification contains `result_summary` with JSON including: invoice_ids containing "SZ-2024-0423", amounts containing "150.000 Ft", dates containing "március 15" or "2024.03.15".
**Fail:** result_summary is empty, or entities not extracted.

---

### Test 2.5 — Model routing uses cheap model for classification

**Steps:**
1. POST /api/classify (any email)
2. Check agent_runs row: `ai_model` column value

**Pass:** `ai_model` = "gpt-4o-mini" for classification.
**Fail:** `ai_model` = "gpt-4o" (expensive model used unnecessarily).

---

### Test 2.6 — Case auto-linking for high-urgency emails

**Steps:**
1. POST /api/classify with `urgency_score`-inducing content (explicit urgency keywords: "sürgős", "azonnal")
2. Check email_cases table:
```sql
SELECT * FROM email_cases WHERE email_id = '{new_email_id}';
```

**Pass:** A case was created and linked, OR an existing case was found and linked. email_cases row exists.
**Fail:** No case linked, email has no case relationship.

---

### Test 2.7 — Policy override works at tenant level

**Steps:**
1. Insert a policy override for tenant_A:
```sql
INSERT INTO policy_overrides (tenant_id, rule_key, rule_value) VALUES ('{tenant_a_uuid}', 'min_confidence_for_auto', '0.90');
```
2. POST /api/classify with a medium-confidence (0.78) email as tenant_A
3. POST the same email as tenant_B (no override)

**Pass:** tenant_A: NEEDS_ATTENTION (confidence below their 0.90 threshold). tenant_B: potentially auto-approved at default 0.75 threshold.
**Fail:** Policy override has no effect.

---

**Phase 2 Pass Criteria:** All 7 tests pass. Policy engine is provably controlling AI decisions. Entities are extracted. Model routing is verifiable.

---

## Phase 3 — Könyvelő-First Product

**Prerequisites:**
- Phase 2 all tests pass
- Migration `migrate_v3_17_accounting_templates.sql` run
- At least one fresh user account (no prior data) for onboarding test

---

### Test 3.1 — New user reaches first working automation in < 10 minutes

**Manual test — time it with a stopwatch:**

1. Login as a brand new könyvelő user (no prior setup)
2. Navigate to Onboarding wizard
3. Complete all steps
4. Upload one document (a real or dummy "GYIK" document)
5. Send a test email to the connected Gmail (or use the simulate endpoint)
6. Check: email appears in Approval inbox with an AI draft

**Pass:** All steps completed in < 10 minutes. No step required technical knowledge (no JSON, no API keys visible, no "confidence threshold" mentioned in UI).
**Fail:** More than 10 minutes. Or any step shows technical terminology to the user.

---

### Test 3.2 — Onboarding wizard uses könyvelő language throughout

**Steps:**
1. Open OnboardingPage
2. Read every step heading and description

**Pass:** Zero occurrences of: "RAG", "vector", "embedding", "confidence threshold", "tenant", "collection", "API". All text is in Hungarian (or optionally English, but no tech jargon). Policy toggles use business language like "Számla levelek mindig emberi jóváhagyást kapnak".
**Fail:** Any technical term visible to user.

---

### Test 3.3 — Accounting template library has Hungarian content

**Steps:**
1. GET /api/templates (as a könyvelőiroda tenant)

**Pass:** At least 9 templates returned. All templates have Hungarian body text. At least 3 categories present: general replies, invoice/finance, NAV/tax.
**Fail:** Empty template list, English templates only, or fewer than 9 templates.

---

### Test 3.4 — Entity panel appears in Approval inbox for invoice emails

**Steps:**
1. Process an email containing invoice data (SZ-xxxx, amount in HUF)
2. Open the email in Approval inbox (ApprovalPage)

**Pass:** "Azonosított adatok" panel is visible above the reply editor. Shows invoice ID, amount, and any dates detected. If tax keywords present, "NAV vagy adó tartalom észlelve" badge is visible.
**Fail:** Panel not shown, or shows for all emails regardless of content.

---

### Test 3.5 — Source trust panel shows RAG sources

**Steps:**
1. Process an email that triggers RAG retrieval (query should match uploaded document)
2. Open in Approval inbox

**Pass:** "Mire támaszkodott az AI?" section is visible and collapsible. Shows at least one document name with a relevance score bar. Score bar is visually proportional to the score value.
**Fail:** Section not visible, or "General knowledge" shown even when documents were used.

---

### Test 3.6 — ROI widget shows meaningful data after 5+ auto-approved emails

**Steps:**
1. Process and auto-approve 5 emails (status → CLOSED without human edit)
2. Open Dashboard

**Pass:** "Megtakarított idő" widget shows X > 0 minutes saved. Shows correct count of auto-approved emails. Week comparison bar renders.
**Fail:** Widget shows 0 when it should not. Calculation clearly wrong (e.g., 500 hours for 5 emails).

---

### Test 3.7 — Empty state guides new tenant

**Steps:**
1. Login as brand new tenant (0 emails, 0 documents)
2. Open Dashboard

**Pass:** 3-step checklist visible with correct status indicators. "Dokumentum feltöltve (0/1)" shows unchecked. Clicking each step navigates to the correct action. No generic "No data" message.
**Fail:** Blank dashboard or generic empty state without guidance.

---

**Phase 3 Pass Criteria:** All 7 tests pass. A non-technical Hungarian accountant can use the product without help.

---

## Phase 4 — Scalable SaaS: Metering, Queue, Enterprise

**Prerequisites:**
- Phase 3 all tests pass
- Redis and worker containers running (`docker compose ps` shows worker as healthy)
- All 4 Phase 4 migrations run

---

### Test 4.1 — Usage metering increments per tenant

**Steps:**
1. Process 3 emails for tenant_A via POST /api/classify
2. Check metering:
```sql
SELECT emails_processed, ai_calls_made, tokens_consumed, cost_usd FROM usage_records WHERE tenant_id = '{tenant_a_uuid}' AND period_start = CURRENT_DATE - INTERVAL '1 day' * EXTRACT(DOW FROM CURRENT_DATE)::int;
```

**Pass:** emails_processed = 3. ai_calls_made >= 3. tokens_consumed > 0. cost_usd > 0.
**Fail:** Any field is 0 or the row doesn't exist.

---

### Test 4.2 — Quota enforcement returns 429

**Steps:**
1. Set tenant_A's quota to 5 emails:
```sql
UPDATE tenant_quotas SET max_emails_per_month = 5 WHERE tenant_id = '{tenant_a_uuid}';
```
2. Process 5 emails (fills quota)
3. POST /api/classify with a 6th email

**Pass:** Response is HTTP 429. Body contains Hungarian message: "Havi email limit elérve".
**Fail:** 6th email is processed. Or 429 but wrong message. Or 500 error.

---

### Test 4.3 — Document ingestion runs via arq queue

**Steps:**
1. Upload a document: POST /api/documents
2. Immediately check: response has `{"status": "processing"}` — endpoint returned fast (< 1 second)
3. Check arq worker logs: `docker logs docuagent_v3-worker-1 --tail 20`

**Pass:** Worker log shows job received and processed. agent_run for this doc_id shows status='success'. Document appears in GET /api/documents within 60 seconds.
**Fail:** Worker log shows no activity. Document never appears. Or endpoint blocks on ingestion.

---

### Test 4.4 — Arq queue retries on failure

**Steps:**
1. Temporarily break Qdrant (stop container): `docker stop docuagent_v3-qdrant-1`
2. Upload a document → job enqueued
3. Restart Qdrant after 30 seconds: `docker start docuagent_v3-qdrant-1`

**Pass:** Worker retries the job automatically. Job eventually succeeds after Qdrant recovers. Max 3 retries visible in worker logs.
**Fail:** Job fails permanently after first attempt. No retry visible in logs.

---

### Test 4.5 — Role-based approval enforcement

**Steps:**
1. Add "tax" to senior_review_categories for tenant_A's policy
2. Process an email with category="tax" (or NAV keywords)
3. Login as agent-role user → navigate to Approval inbox → try to approve the email

**Pass:** Approve button is disabled. "Senior jóváhagyás szükséges" badge visible. Hovering button shows tooltip explaining why.
4. Login as admin-role user → navigate to same email
**Pass:** POST /api/approvals/{id}/senior-approve succeeds for admin. Fails with 403 for agent.
**Fail:** Agent can approve a senior-required email. Badge not shown.

---

### Test 4.6 — Invoice extraction produces structured data

**Steps:**
1. Process an email with invoice content
2. POST /api/invoice-workflow/extract with the email_id

**Pass:** Response contains: invoice_number, vendor_name, amount, currency (HUF), due_date. All fields populated (not null). Row exists in invoice_extractions table.
**Fail:** All fields null. Or 500 error. Or endpoint not found.

---

### Test 4.7 — Invoice extraction visible in Approval inbox

**Steps:**
1. Process an invoice-containing email to approval inbox
2. Open in ApprovalPage

**Pass:** "Számla adatok" card visible with extracted fields. "Mentés" button saves verified data. "Küldés Billingo-ba" button is visible but disabled with "Hamarosan elérhető" tooltip.
**Fail:** Card not shown. Buttons missing.

---

### Test 4.8 — Failed runs appear in Error Center

**Steps:**
1. Trigger a classification failure (e.g., temporarily set OPENAI_API_KEY to invalid value, process one email)
2. Restore OPENAI_API_KEY
3. Navigate to Error Center page (or error tab)

**Pass:** Failed run appears with: trigger_type, error_message, timestamp. Retry button is present.
4. Click Retry → run re-queued or re-executed.
**Pass:** After retry, run status changes to 'success' (if OpenAI key restored).
**Fail:** Error Center empty despite known failures. Retry button missing or does nothing.

---

### Test 4.9 — Prompt versioning tracks which prompt produced which output

**Steps:**
1. Check that agent_runs rows contain non-null prompt_version column after any classification
2. Insert a new prompt version for 'classify_system', activate it:
```sql
INSERT INTO prompt_versions (name, version, content, is_active) VALUES ('classify_system', 2, '...updated prompt text...', TRUE);
UPDATE prompt_versions SET is_active = FALSE WHERE name = 'classify_system' AND version = 1;
```
3. Process another email
4. Check agent_runs: new row should reference version=2

**Pass:** agent_runs.prompt_version = 2 for the new row. Old rows still show version=1.
**Fail:** prompt_version column null on any rows.

---

### Test 4.10 — Usage dashboard shows correct data to admin

**Steps:**
1. Login as admin-role user for tenant_A
2. Open Dashboard → scroll to "Használat és korlátok" section

**Pass:** 3 progress bars visible (emails, AI calls, documents). Values match SQL query to usage_records. Estimated cost shown as "$X.XX". Plan name visible.
3. Login as agent-role user for tenant_A
**Pass:** "Használat és korlátok" section NOT visible (admin-only).
**Fail:** Section missing for admin. Or visible for non-admin.

---

**Phase 4 Pass Criteria:** All 10 tests pass. System operates without manual intervention. Metering is accurate. Queue handles failures gracefully.

---

## Cross-Phase Regression Check

Run after Phase 4 is complete, to ensure earlier features still work:

| Check | Expected |
|-------|----------|
| Tenant A cannot see Tenant B's emails | ✓ |
| Tenant A cannot see Tenant B's Qdrant vectors | ✓ |
| New könyvelő user can complete onboarding | ✓ |
| Approval inbox shows entity panel for invoice emails | ✓ |
| NAV-keyword email goes to NEEDS_ATTENTION | ✓ |
| agent_runs row created for every AI call | ✓ |
| Accounting templates available after template page load | ✓ |
| Calendar sync still operational (n8n WF5) | ✓ |

Each row should be verified manually or via automated curl sequence.

---

## Deployment order (PowerShell)

After each phase, in order:

```powershell
# Phase 1
Get-Content db/migrate_v3_14_agent_runs.sql | docker exec -i docuagent_v3-postgres-1 psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB

# Phase 2
Get-Content db/migrate_v3_15_policy.sql | docker exec -i docuagent_v3-postgres-1 psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB
Get-Content db/migrate_v3_16_email_cases.sql | docker exec -i docuagent_v3-postgres-1 psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB

# Phase 3
Get-Content db/migrate_v3_17_accounting_templates.sql | docker exec -i docuagent_v3-postgres-1 psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB

# Phase 4
Get-Content db/migrate_v3_18_metering.sql | docker exec -i docuagent_v3-postgres-1 psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB
Get-Content db/migrate_v3_19_roles.sql | docker exec -i docuagent_v3-postgres-1 psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB
Get-Content db/migrate_v3_20_prompts.sql | docker exec -i docuagent_v3-postgres-1 psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB
Get-Content db/migrate_v3_21_invoice_extractions.sql | docker exec -i docuagent_v3-postgres-1 psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB

# After Phase 4: rebuild with worker + redis
docker compose up --build -d
```
