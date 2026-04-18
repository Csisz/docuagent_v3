# DocuAgent v3 — Go-Live Ellenőrző Script
# Futtatás: PowerShell, D:\Munka\Agentify\docuagent_v3 könyvtárból
# Minden sor elvárt kimenettel van dokumentálva.

$BASE_URL = "http://localhost:8000"
$DEMO_TENANT = "00000000-0000-0000-0000-000000000001"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  DocuAgent v3 — Production Go-Live Check" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Container health ───────────────────────────────────────────
Write-Host "[1] Container státusz..." -ForegroundColor Yellow
docker compose ps
Write-Host "  Elvárt: minden service Up, postgres/redis/qdrant/backend HEALTHY" -ForegroundColor DarkGray
Write-Host ""

# ── 2. Health endpoint ────────────────────────────────────────────
Write-Host "[2] /health endpoint..." -ForegroundColor Yellow
try {
    $h = Invoke-WebRequest -Uri "$BASE_URL/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "  $($h.Content)" -ForegroundColor Green
    Write-Host "  Elvárt: {`"status`":`"ok`",`"version`":`"3.2`"}" -ForegroundColor DarkGray
} catch {
    Write-Host "  HIBA: $_" -ForegroundColor Red
}
Write-Host ""

# ── 3. Metrics endpoint ───────────────────────────────────────────
Write-Host "[3] /api/metrics (postgres + qdrant health)..." -ForegroundColor Yellow
try {
    $m = Invoke-WebRequest -Uri "$BASE_URL/api/metrics" -UseBasicParsing -TimeoutSec 5
    Write-Host "  $($m.Content)" -ForegroundColor Green
    Write-Host "  Elvárt: postgres:ok, qdrant:ok, status:ok" -ForegroundColor DarkGray
} catch {
    Write-Host "  HIBA: $_" -ForegroundColor Red
}
Write-Host ""

# ── 4. Tenant rejection (no auth) ────────────────────────────────
Write-Host "[4] Tenant rejection — unauthenticated email-log..." -ForegroundColor Yellow
$body = @{subject="test"; body="test"; message_id="test-noauth-$(Get-Random)"} | ConvertTo-Json
try {
    $r = Invoke-WebRequest -Uri "$BASE_URL/api/email-log" -Method POST `
        -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 5
    Write-Host "  $($r.Content)" -ForegroundColor Green
    Write-Host "  Elvárt: {`"status`":`"error`",`"detail`":`"tenant_id nem azonosítható...`"}" -ForegroundColor DarkGray
} catch {
    Write-Host "  HTTP $($_.Exception.Response.StatusCode): $_" -ForegroundColor Red
}
Write-Host ""

# ── 5. Redis persistence ──────────────────────────────────────────
Write-Host "[5] Redis volume persistence..." -ForegroundColor Yellow
docker compose restart redis 2>$null
Start-Sleep -Seconds 8
$wlog = docker logs docuagent_v3-worker-1 --tail 5 2>&1
Write-Host "  Worker utolsó sorok redis restart után:" -ForegroundColor DarkGray
Write-Host "  $($wlog -join '; ')" -ForegroundColor Green
Write-Host "  Elvárt: worker NEM crashelt, reconnected" -ForegroundColor DarkGray
Write-Host ""

# ── 6. Worker heartbeat ───────────────────────────────────────────
Write-Host "[6] Worker heartbeat file..." -ForegroundColor Yellow
try {
    $ts = docker exec docuagent_v3-worker-1 cat /tmp/worker_alive 2>&1
    $age = [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) - [int]$ts
    Write-Host "  Timestamp: $ts (${age}s ago)" -ForegroundColor Green
    Write-Host "  Elvárt: $age < 300 (5 perc)" -ForegroundColor DarkGray
} catch {
    Write-Host "  Nem elérhető (még nem futott task)" -ForegroundColor DarkYellow
}
Write-Host ""

# ── 7. Startup banner (JWT/OpenAI status) ────────────────────────
Write-Host "[7] Startup banner a backend logban..." -ForegroundColor Yellow
$logs = docker logs docuagent_v3-backend-1 2>&1 | Select-String "JWT|OPENAI|QDRANT|===|DocuAgent"
Write-Host "  $($logs -join '; ')" -ForegroundColor Green
Write-Host "  Elvárt: JWT_SECRET_KEY: SET, OPENAI_API_KEY: SET" -ForegroundColor DarkGray
Write-Host ""

# ── 8. Metering check ────────────────────────────────────────────
Write-Host "[8] Usage metering a DB-ben..." -ForegroundColor Yellow
docker exec -it docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "
SELECT
  emails_processed,
  ai_calls_made,
  tokens_consumed,
  documents_stored,
  rag_queries
FROM usage_records
ORDER BY period_start DESC
LIMIT 1;" 2>&1
Write-Host "  Elvárt: emails_processed és ai_calls_made > 0 (ha már ment email)" -ForegroundColor DarkGray
Write-Host ""

# ── 9. JWT crash guard ────────────────────────────────────────────
Write-Host "[9] JWT startup crash guard (security.py)..." -ForegroundColor Yellow
$sec = Get-Content "backend\core\security.py" -Raw
if ($sec -match "sys\.exit\(1\)" -and $sec -notmatch "change-me") {
    Write-Host "  OK — sys.exit(1) megvan, change-me nincs" -ForegroundColor Green
} else {
    Write-Host "  HIBA — security.py nem tartalmaz sys.exit(1) vagy change-me maradt benne" -ForegroundColor Red
}
Write-Host ""

# ── 10. Redis volume mount ────────────────────────────────────────
Write-Host "[10] Redis volume mount a docker-compose.yml-ben..." -ForegroundColor Yellow
$dc = Get-Content "docker-compose.yml" -Raw
if ($dc -match "redis_data:/data") {
    Write-Host "  OK — redis_data:/data mount megvan" -ForegroundColor Green
} else {
    Write-Host "  HIBA — redis_data:/data hiányzik" -ForegroundColor Red
}
Write-Host ""

# ── 11. Rate limiter file ─────────────────────────────────────────
Write-Host "[11] Rate limiter (core/limiter.py)..." -ForegroundColor Yellow
if (Test-Path "backend\core\limiter.py") {
    Write-Host "  OK — limiter.py létezik" -ForegroundColor Green
} else {
    Write-Host "  HIBA — limiter.py hiányzik" -ForegroundColor Red
}
Write-Host ""

# ── 12. Retention service ─────────────────────────────────────────
Write-Host "[12] Retention service (services/retention.py)..." -ForegroundColor Yellow
if (Test-Path "backend\services\retention.py") {
    Write-Host "  OK — retention.py létezik" -ForegroundColor Green
} else {
    Write-Host "  HIBA — retention.py hiányzik" -ForegroundColor Red
}
Write-Host ""

# ── Összefoglaló ──────────────────────────────────────────────────
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Ellenőrzés kész. Nézd át a HIBA sorokat." -ForegroundColor Cyan
Write-Host "  Ha minden zöld → élesíthető." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
