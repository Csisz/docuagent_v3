# DocuAgent v3 — Phase Validation Test Protocol v2
# Every test uses either UI steps or exact PowerShell commands.
# No abstract API descriptions.
#
# Tenants in this environment:
#   Tenant A = Agentify Teszt Kft. | UUID: 54cbdd88-ae04-4cfc-92f9-5a21175daaed
#   Tenant B = Demo Kft.           | UUID: 00000000-0000-0000-0000-000000000001
#   Users:
#     admin@agentify-test.hu / agent@agentify-test.hu  → Tenant A
#     admin@demo.hu / demo@agentify.hu                 → Tenant B

---

## BEFORE YOU START — Get JWT tokens (needed for PowerShell tests)

Run once at the start of each test session. Replace passwords with your actual ones.

```powershell
# Tenant A token
$loginA = Invoke-WebRequest -Uri "http://localhost:8000/api/auth/login" `
  -Method POST -UseBasicParsing `
  -ContentType "application/json" `
  -Body '{"email":"admin@agentify-test.hu","password":"YOUR_PASSWORD"}'
$tokenA = ($loginA.Content | ConvertFrom-Json).access_token

# Tenant B token
$loginB = Invoke-WebRequest -Uri "http://localhost:8000/api/auth/login" `
  -Method POST -UseBasicParsing `
  -ContentType "application/json" `
  -Body '{"email":"admin@demo.hu","password":"YOUR_PASSWORD"}'
$tokenB = ($loginB.Content | ConvertFrom-Json).access_token

# Verify both tokens exist
Write-Host "Token A: $($tokenA.Substring(0,20))..."
Write-Host "Token B: $($tokenB.Substring(0,20))..."
```

---

## PHASE 1 — Tenant Isolation & Execution Discipline

**Prerequisites:**
```powershell
# Check agent_runs table exists
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "\dt agent_runs"

# Check all containers running
docker compose ps
```
Expected: agent_runs table listed, all services Up.

---

### Test 1.1 — Qdrant vector isolation (cross-tenant document leak)

**Step 1 — Upload document as Tenant A**

UI:
1. Open http://localhost:3000
2. Login as `admin@agentify-test.hu`
3. Go to Documents page
4. Upload any file — content should include unique text like "Agentify üzleti modell"
5. Wait until document appears in the list with green status

**Step 2 — Verify Tenant A collection exists with tenant_id in payload**

```powershell
# Check collections
Invoke-WebRequest -Uri "http://localhost:6333/collections" -UseBasicParsing | Select-Object -ExpandProperty Content

# Check payload of Tenant A's vectors — look for "tenant_id" field
Invoke-WebRequest -Uri "http://localhost:6333/collections/54cbdd88_general/points/scroll" `
  -Method POST -UseBasicParsing `
  -ContentType "application/json" `
  -Body '{"limit": 1, "with_payload": true}' | Select-Object -ExpandProperty Content
```

**Step 3 — Query as Tenant B**

UI:
1. Logout
2. Login as `admin@demo.hu`
3. Go to Chat page
4. Type: `"Milyen folyamatokat automatizál az Agentify platform?"`
5. Check the answer and the sources panel

**PASS:**
- Collections list contains `54cbdd88_general` and `00000000_general` as separate entries
- Payload contains `"tenant_id": "54cbdd88-ae04-4cfc-92f9-5a21175daaed"`
- Chat response for Demo Kft. does NOT reference Agentify Teszt Kft.'s document in sources

**FAIL:** Chat response cites Tenant A's document as a source while logged in as Tenant B.

---

### Test 1.2 — Feedback learning is tenant-scoped

**Step 1 — Create feedback as Tenant A**

UI:
1. Login as `admin@agentify-test.hu`
2. Go to Emails page
3. Find any email with AI classification
4. Override the decision (approve or reject differently than AI suggested)
5. Submit

**Step 2 — Check feedback is tenant-scoped in DB**

```powershell
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT tenant_id, COUNT(*) FROM feedback GROUP BY tenant_id;"
```

**PASS:** Two separate rows with different tenant_id values. No row with NULL tenant_id.
**FAIL:** Single row with NULL tenant_id, or all feedback under one tenant.

---

### Test 1.3 — agent_runs records every AI execution

**Step 1 — Trigger classification via UI**

UI:
1. Login as `admin@agentify-test.hu`
2. Go to Emails page
3. Find an unprocessed email or use the n8n simulate function to send a test email

**Step 2 — Check agent_runs**

```powershell
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT trigger_type, status, latency_ms, cost_usd, created_at FROM agent_runs WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed' ORDER BY created_at DESC LIMIT 5;"
```

**PASS:** Rows exist with `status='success'`, `latency_ms > 0`, `cost_usd > 0` for AI calls.
**FAIL:** No rows, or `status='running'` stuck, or `cost_usd = 0`.

---

### Test 1.4 — Document ingestion is async (returns immediately)

**Step 1 — Upload and time the response**

```powershell
# Create a test file
"Ez egy teszt dokumentum az async feldolgozás ellenőrzéséhez." | Out-File -FilePath "$env:TEMP\async_test.txt" -Encoding UTF8

# Measure upload response time
$start = Get-Date
$upload = Invoke-WebRequest -Uri "http://localhost:8000/api/documents" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA" } `
  -Form @{
    file       = Get-Item "$env:TEMP\async_test.txt"
    tag        = "general"
    department = "General"
    access_level = "employee"
  }
$elapsed = (Get-Date) - $start
Write-Host "Response time: $($elapsed.TotalSeconds) seconds"
Write-Host "Response: $($upload.Content)"
```

**Step 2 — Poll for completion**

```powershell
$docId = ($upload.Content | ConvertFrom-Json).doc_id
Start-Sleep -Seconds 15

# Check worker logs
docker logs docuagent_v3-worker-1 --tail 20

# Check document status in DB
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT id, filename, qdrant_ok FROM documents WHERE id = '$docId';"
```

**PASS:** Response time < 2 seconds. Response contains `"status": "processing"`. Within 60 seconds `qdrant_ok = true` in DB.
**FAIL:** Response takes > 5 seconds (blocking). Or `qdrant_ok` stays `false` after 60 seconds.

---

### Test 1.5 — Cross-tenant email isolation

```powershell
# Tenant A emails
$emailsA = Invoke-WebRequest -Uri "http://localhost:8000/api/emails" `
  -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA" }
$emailsA.Content | ConvertFrom-Json | Select-Object -ExpandProperty emails | Select-Object id, subject, tenant_id | Format-Table

# Tenant B emails
$emailsB = Invoke-WebRequest -Uri "http://localhost:8000/api/emails" `
  -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenB" }
$emailsB.Content | ConvertFrom-Json | Select-Object -ExpandProperty emails | Select-Object id, subject, tenant_id | Format-Table
```

**PASS:** No email IDs overlap between the two responses. Each response only contains that tenant's emails.
**FAIL:** Same email ID appears in both responses.

---

**Phase 1 Pass Criteria:** All 5 tests pass. Zero cross-tenant data visible.

---

## PHASE 2 — Agent Runtime: Layers, Policy, Structured Outputs

**Prerequisites:**
```powershell
# Check new tables exist
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "\dt policy_overrides"

docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "\dt email_cases"

# Check agents/ directory exists in backend
docker exec docuagent_v3-backend-1 ls /app/agents/
```

---

### Test 2.1 — Policy blocks NAV emails from auto-approval

```powershell
$navEmail = Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
  -Body '{"subject":"NAV ellenorzos ertesito","body":"Ertesitjuk hogy adoellenorzesre kerul sor vallalkozasanal. Kerem vegye fel velunk a kapcsolatot."}'

$navEmail.Content | ConvertFrom-Json | Select-Object can_answer, status, category, reason | Format-List
```

**PASS:** `can_answer = false`, `status = NEEDS_ATTENTION`. Reason mentions policy or NAV.
**FAIL:** `can_answer = true` — policy engine not working.

---

### Test 2.2 — Policy blocks complaint emails from auto-approval

```powershell
$complaint = Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
  -Body '{"subject":"Elegedetlen vagyok a szolgaltatassal","body":"Mar harmadik alkalommal hibas a szamla amit kuldtek. Ez teljesen elfogadhatatlan."}'

$complaint.Content | ConvertFrom-Json | Select-Object can_answer, category, status | Format-List
```

**PASS:** `category = complaint`, `can_answer = false`.
**FAIL:** `can_answer = true`.

---

### Test 2.3 — Entity extraction on invoice email

```powershell
$invoice = Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
  -Body '{"subject":"SZ-2024-0423 szamla beküldve","body":"Mellekelem a 2024. marcius 15-i keltű, 150000 Ft ertekű szamlat szamlaszam SZ-2024-0423. Kerem szives feldolgozasukat."}'

$result = $invoice.Content | ConvertFrom-Json
Write-Host "Category: $($result.category)"
Write-Host "Can answer: $($result.can_answer)"

# Check agent_runs for entity extraction result
Start-Sleep -Seconds 2
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT result_summary FROM agent_runs WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed' ORDER BY created_at DESC LIMIT 1;"
```

**PASS:** `result_summary` contains invoice_ids with "SZ-2024-0423", amounts with "150000", dates with "marcius 15".
**FAIL:** `result_summary` is null or empty.

---

### Test 2.4 — Model routing uses gpt-4o-mini for classification

```powershell
# Classify any email
Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
  -Body '{"subject":"Általános kérdés","body":"Mikor van az ügyfélszolgálat nyitva?"}' | Out-Null

# Check model used
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT trigger_type, ai_model, cost_usd FROM agent_runs WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed' ORDER BY created_at DESC LIMIT 3;"
```

**PASS:** `ai_model = gpt-4o-mini` for classify rows.
**FAIL:** `ai_model = gpt-4o` for classification.

---

### Test 2.5 — Tenant-level policy override works

```powershell
# Set strict confidence threshold for Tenant A
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "INSERT INTO policy_overrides (tenant_id, rule_key, rule_value) VALUES ('54cbdd88-ae04-4cfc-92f9-5a21175daaed', 'min_confidence_for_auto', '0.99') ON CONFLICT (tenant_id, rule_key) DO UPDATE SET rule_value = '0.99';"

# Classify a simple email as Tenant A (should now be blocked by 0.99 threshold)
$strictTest = Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
  -Body '{"subject":"Mikor van nyitva?","body":"Szeretnem tudni hogy mikor van nyitva az iroda."}'
Write-Host "Tenant A result: $(($strictTest.Content | ConvertFrom-Json).can_answer)"

# Same email as Tenant B (default 0.75 threshold — should auto-approve)
$normalTest = Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenB"; "Content-Type" = "application/json" } `
  -Body '{"subject":"Mikor van nyitva?","body":"Szeretnem tudni hogy mikor van nyitva az iroda."}'
Write-Host "Tenant B result: $(($normalTest.Content | ConvertFrom-Json).can_answer)"

# Reset Tenant A threshold
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "DELETE FROM policy_overrides WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed' AND rule_key = 'min_confidence_for_auto';"
```

**PASS:** Tenant A: `can_answer = false`. Tenant B: `can_answer = true` (or at least different result).
**FAIL:** Both return same result regardless of policy override.

---

### Test 2.6 — Case auto-linking for urgent emails

```powershell
# Send urgent email
$urgent = Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
  -Body '{"subject":"SURGOS: Azonnal szukseg van segitsegre","body":"Azonnal kell valaki mert komoly problemank van. ASAP kerem a visszajelzest."}'

$emailId = ($urgent.Content | ConvertFrom-Json).email_id
Write-Host "Email ID: $emailId"

Start-Sleep -Seconds 3

# Check case linking
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT * FROM email_cases WHERE email_id = '$emailId';"
```

**PASS:** At least one row in email_cases for this email_id.
**FAIL:** No rows — case linking not working.

---

**Phase 2 Pass Criteria:** All 6 tests pass. Policy controls AI decisions. Entities extracted. Model routing verified.

---

## PHASE 3 — Könyvelő-First Product

**Prerequisites:**
```powershell
# Check accounting templates loaded
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT COUNT(*), category FROM templates GROUP BY category;"
```
Expected: at least 9 templates across 3 categories.

---

### Test 3.1 — Onboarding uses könyvelő language (no tech jargon)

UI — Manual check:
1. Login as `admin@agentify-test.hu`
2. Go to http://localhost:3000/onboarding
3. Read every step heading and body text carefully

```powershell
# Also check page source for forbidden terms
$onboarding = Invoke-WebRequest -Uri "http://localhost:3000/onboarding" -UseBasicParsing
$forbidden = @("RAG", "vector", "embedding", "confidence threshold", "tenant", "collection")
foreach ($term in $forbidden) {
  if ($onboarding.Content -match $term) {
    Write-Host "FAIL: Found forbidden term '$term' in onboarding page"
  } else {
    Write-Host "OK: '$term' not found"
  }
}
```

**PASS:** Zero forbidden technical terms. All text in Hungarian. Policy toggles use business language.
**FAIL:** Any forbidden term found, or English-only UI.

---

### Test 3.2 — Accounting templates exist in Hungarian

```powershell
$templates = Invoke-WebRequest -Uri "http://localhost:8000/api/templates" `
  -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA" }

$templateList = $templates.Content | ConvertFrom-Json
Write-Host "Total templates: $($templateList.Count)"
$templateList | Select-Object title, category | Format-Table
```

**PASS:** At least 9 templates. Hungarian titles. At least 3 distinct categories visible.
**FAIL:** Empty list, or English templates only.

---

### Test 3.3 — Entity panel appears in Approval inbox for invoice email

**Step 1 — Send invoice email through classify**

```powershell
$inv = Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
  -Body '{"subject":"SZ-2024-9999 szamla","body":"Kuldom a 280000 Ft erteku SZ-2024-9999 szamlat. Fizetesi hatarido: 2024. aprilis 30."}'

$emailId = ($inv.Content | ConvertFrom-Json).email_id
Write-Host "Email ID for UI check: $emailId"
```

**Step 2 — Check in UI**

UI:
1. Go to http://localhost:3000/approvals
2. Find the email just classified
3. Open it

**PASS:** "Azonosított adatok" panel visible above reply editor. Shows invoice number SZ-2024-9999, amount 280000, date April 30.
**FAIL:** Panel not shown or empty.

---

### Test 3.4 — Source trust panel shows RAG sources

UI:
1. Go to http://localhost:3000/approvals
2. Open any email that was answered using RAG (sources > 0)
3. Look for "Mire támaszkodott az AI?" section

**PASS:** Section visible and collapsible. At least one document listed with filename and relevance bar.
**FAIL:** Section missing, or empty even when documents were used.

---

### Test 3.5 — ROI widget shows data on Dashboard

UI:
1. Go to http://localhost:3000/dashboard

**PASS:** "Megtakarított idő" widget visible. Shows non-zero minutes if any emails were auto-approved. Values are reasonable (not 500 hours for 5 emails).
**FAIL:** Widget missing or always shows 0.

---

### Test 3.6 — Empty state guides new users

```powershell
# Create a brand new tenant and user for this test
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "INSERT INTO tenants (name, slug) VALUES ('Ures Teszt Kft.', 'ures-teszt') ON CONFLICT DO NOTHING;"

docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT id FROM tenants WHERE slug = 'ures-teszt';"
```

UI:
1. Register or manually create a user for the new tenant
2. Login as that user
3. Go to Dashboard

**PASS:** 3-step checklist visible. "Dokumentum feltöltve (0/1)" unchecked. Each step is a clickable link.
**FAIL:** Blank page, generic "No data", or normal dashboard without guidance.

---

**Phase 3 Pass Criteria:** All 6 tests pass. Non-technical user can navigate without help.

---

## PHASE 4 — Scalable SaaS: Metering, Queue, Enterprise

**Prerequisites:**
```powershell
# All Phase 4 tables exist
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "\dt usage_records tenant_quotas prompt_versions invoice_extractions"

# Redis and worker running
docker compose ps | Select-String "worker|redis"
```

---

### Test 4.1 — Usage metering increments per tenant

```powershell
# Process 3 emails as Tenant A
1..3 | ForEach-Object {
  Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
    -Method POST -UseBasicParsing `
    -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
    -Body "{`"subject`":`"Teszt email $_`",`"body`":`"Ez a $_ teszt email tartalma.`"}" | Out-Null
  Write-Host "Processed email $_"
}

Start-Sleep -Seconds 3

# Check metering
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT emails_processed, ai_calls_made, tokens_consumed, cost_usd FROM usage_records WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed' ORDER BY period_start DESC LIMIT 1;"
```

**PASS:** `emails_processed >= 3`, `ai_calls_made >= 3`, `tokens_consumed > 0`, `cost_usd > 0`.
**FAIL:** Any field is 0 or row doesn't exist.

---

### Test 4.2 — Quota enforcement returns 429

```powershell
# Set very low quota for Tenant A
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "INSERT INTO tenant_quotas (tenant_id, max_emails_per_month) VALUES ('54cbdd88-ae04-4cfc-92f9-5a21175daaed', 1) ON CONFLICT (tenant_id) DO UPDATE SET max_emails_per_month = 1;"

# Also set current usage above the limit
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "UPDATE usage_records SET emails_processed = 5 WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed' ORDER BY period_start DESC LIMIT 1;"

# Try to classify — should get 429
try {
  $blocked = Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
    -Method POST -UseBasicParsing `
    -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
    -Body '{"subject":"Quota teszt","body":"Ez nem mehet at."}'
  Write-Host "FAIL: Got HTTP $($blocked.StatusCode) — expected 429"
} catch {
  Write-Host "PASS: Got error response — status: $($_.Exception.Response.StatusCode)"
  Write-Host "Body: $($_.ErrorDetails.Message)"
}

# Reset quota
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "UPDATE tenant_quotas SET max_emails_per_month = 500 WHERE tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed';"
```

**PASS:** Exception caught, status is 429. Body contains "Havi email limit elérve".
**FAIL:** Email processed normally (200 response).

---

### Test 4.3 — Document ingestion runs via arq queue

```powershell
# Upload document and check timing
"Arq queue teszt dokumentum tartalma." | Out-File -FilePath "$env:TEMP\queue_test.txt" -Encoding UTF8

$start = Get-Date
$upload = Invoke-WebRequest -Uri "http://localhost:8000/api/documents" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA" } `
  -Form @{
    file         = Get-Item "$env:TEMP\queue_test.txt"
    tag          = "general"
    department   = "General"
    access_level = "employee"
  }
$elapsed = (Get-Date) - $start

Write-Host "Response time: $($elapsed.TotalSeconds)s"
Write-Host "Response: $($upload.Content)"

# Check worker processed it
Start-Sleep -Seconds 20
docker logs docuagent_v3-worker-1 --tail 15
```

**PASS:** Response < 2 seconds. Worker logs show "process_document" job completed. After 30s, document has `qdrant_ok = true`.
**FAIL:** Response takes > 5 seconds, or worker log shows no activity.

---

### Test 4.4 — Arq queue retries on Qdrant failure

```powershell
# Stop Qdrant
docker stop docuagent_v3-qdrant-1
Write-Host "Qdrant stopped"

# Upload document — job should be queued but fail
"Retry teszt dokumentum." | Out-File -FilePath "$env:TEMP\retry_test.txt" -Encoding UTF8
$retryUpload = Invoke-WebRequest -Uri "http://localhost:8000/api/documents" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA" } `
  -Form @{
    file         = Get-Item "$env:TEMP\retry_test.txt"
    tag          = "general"
    department   = "General"
    access_level = "employee"
  }
Write-Host "Upload response: $($retryUpload.Content)"

# Wait 30 seconds then restore Qdrant
Start-Sleep -Seconds 30
docker start docuagent_v3-qdrant-1
Write-Host "Qdrant restarted"

# Wait for retry and check worker logs
Start-Sleep -Seconds 30
docker logs docuagent_v3-worker-1 --tail 30
```

**PASS:** Worker logs show retry attempts. After Qdrant restarts, job eventually succeeds.
**FAIL:** Worker gives up after first attempt with no retry visible in logs.

---

### Test 4.5 — Role-based senior approval enforcement

**Step 1 — Set up senior review policy**

```powershell
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "INSERT INTO policy_overrides (tenant_id, rule_key, rule_value) VALUES ('54cbdd88-ae04-4cfc-92f9-5a21175daaed', 'senior_review_categories', '[\"legal\",\"tax\"]') ON CONFLICT (tenant_id, rule_key) DO UPDATE SET rule_value = '[\"legal\",\"tax\"]';"
```

**Step 2 — Send a tax/legal email and check UI as agent role**

UI:
1. Send a NAV/tax email through classify (use Test 2.1 payload)
2. Logout from admin
3. Login as `agent@agentify-test.hu`
4. Go to Approvals inbox
5. Find the NAV email

**PASS:** "Senior jóváhagyás szükséges" badge visible. Approve button disabled.

**Step 3 — Verify API enforcement**

```powershell
# Get agent token
$loginAgent = Invoke-WebRequest -Uri "http://localhost:8000/api/auth/login" `
  -Method POST -UseBasicParsing `
  -ContentType "application/json" `
  -Body '{"email":"agent@agentify-test.hu","password":"YOUR_PASSWORD"}'
$tokenAgent = ($loginAgent.Content | ConvertFrom-Json).access_token

# Get the email ID from approvals
$approvals = Invoke-WebRequest -Uri "http://localhost:8000/api/emails?status=NEEDS_ATTENTION" `
  -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenAgent" }
$emailId = ($approvals.Content | ConvertFrom-Json).emails[0].id

# Try to senior-approve as agent — should fail with 403
try {
  Invoke-WebRequest -Uri "http://localhost:8000/api/approvals/$emailId/senior-approve" `
    -Method POST -UseBasicParsing `
    -Headers @{ "Authorization" = "Bearer $tokenAgent" } | Out-Null
  Write-Host "FAIL: Agent was able to senior-approve"
} catch {
  Write-Host "PASS: Agent blocked — $($_.Exception.Response.StatusCode)"
}
```

**PASS:** Agent gets 403. Admin can approve successfully.
**FAIL:** Agent can approve senior-required emails.

---

### Test 4.6 — Invoice extraction produces structured data

```powershell
# First classify an invoice email to get email_id
$inv = Invoke-WebRequest -Uri "http://localhost:8000/api/classify" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
  -Body '{"subject":"INV-2024-0555 számla","body":"Csatolom az INV-2024-0555 számlát. Összeg: 450000 HUF. Kiállítás: 2024.04.01. Fizetési határidő: 2024.04.30. Szállító: Minta Bt."}'

$emailId = ($inv.Content | ConvertFrom-Json).email_id
Write-Host "Email ID: $emailId"

# Trigger invoice extraction
$extraction = Invoke-WebRequest -Uri "http://localhost:8000/api/invoice-workflow/extract" `
  -Method POST -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA"; "Content-Type" = "application/json" } `
  -Body "{`"email_id`":`"$emailId`"}"

Write-Host "Extraction result:"
$extraction.Content | ConvertFrom-Json | Format-List

# Verify in DB
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT invoice_number, vendor_name, amount, currency, due_date FROM invoice_extractions WHERE email_id = '$emailId';"
```

**PASS:** Response and DB row contain `invoice_number = INV-2024-0555`, `amount = 450000`, `currency = HUF`, `due_date = 2024-04-30`.
**FAIL:** All fields null, endpoint 404, or 500 error.

---

### Test 4.7 — Invoice extraction visible in Approval inbox UI

UI:
1. Go to http://localhost:3000/approvals
2. Open the invoice email from Test 4.6

**PASS:** "Számla adatok" card visible with INV-2024-0555, 450000 HUF, due date. "Mentés" button present. "Küldés Billingo-ba" button visible but disabled with tooltip.
**FAIL:** Card not shown.

---

### Test 4.8 — Failed runs appear in Error Center

```powershell
# Temporarily break OpenAI key
docker exec docuagent_v3-backend-1 sh -c 'export OPENAI_API_KEY=invalid_key_test'

# This won't persist — use env override approach instead:
# Just check if any failed runs already exist from previous tests
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT trigger_type, status, error_message, created_at FROM agent_runs WHERE status = 'failed' AND tenant_id = '54cbdd88-ae04-4cfc-92f9-5a21175daaed' ORDER BY created_at DESC LIMIT 5;"

# Check Error Center via API
$failed = Invoke-WebRequest -Uri "http://localhost:8000/api/runs/failed" `
  -UseBasicParsing `
  -Headers @{ "Authorization" = "Bearer $tokenA" }
Write-Host "Failed runs: $($failed.Content)"
```

UI:
1. Go to Error Center page (check Sidebar for "Hibák" link)
2. Verify failed runs appear with trigger type, error message, timestamp, and Retry button

**PASS:** Failed runs visible in both API response and UI. Retry button present.
**FAIL:** Error Center empty despite DB showing failed runs. Or endpoint 404.

---

### Test 4.9 — Usage dashboard shows data to admin only

UI:
1. Login as `admin@agentify-test.hu`
2. Go to Dashboard
3. Scroll to "Használat és korlátok" section

**PASS:** 3 progress bars visible (emails, AI calls, documents). Cost estimate shown. Plan name shown.

4. Logout → Login as `agent@agentify-test.hu`
5. Go to Dashboard

**PASS:** "Használat és korlátok" section NOT visible for agent role.
**FAIL:** Section missing for admin, or visible for agent.

---

**Phase 4 Pass Criteria:** All 9 tests pass. Metering accurate. Queue retries. Roles enforced.

---

## Cross-Phase Regression Check

Run after all phases complete:

```powershell
Write-Host "=== REGRESSION CHECK ==="

# 1. Cross-tenant Qdrant isolation still holds
$collections = (Invoke-WebRequest -Uri "http://localhost:6333/collections" -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json).result.collections.name
Write-Host "Collections: $($collections -join ', ')"
if ($collections -contains "54cbdd88_general" -and $collections -contains "00000000_general") {
  Write-Host "✅ Tenant collections exist"
} else { Write-Host "❌ Tenant collections missing" }

# 2. agent_runs has rows from all phases
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT trigger_type, COUNT(*) FROM agent_runs GROUP BY trigger_type ORDER BY count DESC;"

# 3. Templates loaded
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT COUNT(*) as template_count FROM templates;"

# 4. Worker running
$workerStatus = docker compose ps | Select-String "worker"
Write-Host "Worker: $workerStatus"

# 5. No NULL tenant_id in critical tables
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c `
  "SELECT 'emails' as tbl, COUNT(*) as null_tenant FROM emails WHERE tenant_id IS NULL UNION ALL SELECT 'documents', COUNT(*) FROM documents WHERE tenant_id IS NULL UNION ALL SELECT 'feedback', COUNT(*) FROM feedback WHERE tenant_id IS NULL;"
```

**PASS:** All counts for null_tenant = 0. Worker Up. Templates > 9. Tenant collections present.

---

## Migration commands (PowerShell)

```powershell
# Phase 1
Get-Content db\migrate_v3_14_agent_runs.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent

# Phase 2
Get-Content db\migrate_v3_15_policy.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent
Get-Content db\migrate_v3_16_email_cases.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent

# Phase 3
Get-Content db\migrate_v3_17_accounting_templates.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent

# Phase 4
Get-Content db\migrate_v3_18_metering.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent
Get-Content db\migrate_v3_19_roles.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent
Get-Content db\migrate_v3_20_prompts.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent
Get-Content db\migrate_v3_21_invoice_extractions.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent

# Rebuild all containers after Phase 4
docker compose up --build -d
```
