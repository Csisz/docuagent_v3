# DocuAgent v3 — Production System

> **Status: v3.4 — in development**

## Architecture

```
Gmail → n8n WF1 → POST /classify (FastAPI) → decision
                 ↓                          ↓
            confidence > 0.7          confidence < 0.7
                 ↓                          ↓
        POST /generate-reply        status = NEEDS_ATTENTION
                 ↓                          ↓
          Gmail reply sent          Dashboard alert
                 ↓                          ↓
        status = AI_ANSWERED       Human reviews in dashboard
                                           ↓
                                   PATCH /emails/{id}/status
                                           ↓
                                   feedback table → learning
```

## Stack

| Layer       | Technology          |
|-------------|---------------------|
| Orchestration | n8n               |
| AI + API    | FastAPI (Python)    |
| Database    | PostgreSQL          |
| Vector DB   | Qdrant              |
| AI Model    | OpenAI GPT-4o-mini  |
| Dashboard   | HTML/CSS/JS         |

## Quick Start

### 1. Environment setup
```bash
cp .env.example .env
# Töltsd ki: OPENAI_API_KEY, POSTGRES_*, stb.
```

### 2. Indítás
```bash
docker compose up --build -d
```

### 3. Migration futtatása (első indítás vagy frissítés után)
```bash
docker exec docuagent_v3-postgres-1 psql -U postgres -d docuagent -f /docker-entrypoint-initdb.d/migrate_v3_4.sql
```

### 4. Open dashboard
```
http://localhost:8000
```

### 5. API key beállítása a dashboardon

A dashboardon a **Settings** → **API Key** menüpont alatt add meg az OpenAI API kulcsot,
vagy állítsd be a `.env` fájlban az `OPENAI_API_KEY` értékét.

### 6. n8n workflow import

1. Nyisd meg az n8n UI-t: `http://localhost:5678`
2. **Import** → válaszd ki az `n8n/` mappában lévő `.json` workflow fájlokat
3. Állítsd be a Gmail és webhook credential-öket
4. Aktiváld a workflow-kat

### 7. Configure n8n WF1
See `n8n/WF1_INTEGRATION.md`

## Email Status Flow

```
NEW → AI_ANSWERED (auto, confidence > 0.7)
NEW → NEEDS_ATTENTION (auto, confidence < 0.7)
NEEDS_ATTENTION → CLOSED (human, via dashboard)
AI_ANSWERED → NEEDS_ATTENTION (human override)
any → CLOSED (human)
```

Every manual status change → stored in `feedback` table → injected
into next classify prompt → system learns from corrections.

## Project Structure

```
/
├── backend/
│   ├── main.py          # FastAPI app (all endpoints)
│   ├── requirements.txt
│   └── uploads/         # uploaded documents
├── dashboard/
│   └── index.html       # full dashboard UI
├── db/
│   └── schema.sql       # PostgreSQL schema
├── n8n/
│   └── WF1_INTEGRATION.md
├── docker-compose.yml   # postgres + n8n + qdrant
└── .env.example
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/classify` | AI email classification |
| POST | `/generate-reply` | AI reply generation |
| POST | `/feedback` | Human correction |
| POST | `/email-log` | n8n email ingestion |
| GET  | `/api/dashboard` | KPI + chart data |
| GET  | `/api/emails` | Email list |
| PATCH | `/api/emails/{id}/status` | Status update |
| POST | `/api/upload` | Document upload |
| GET  | `/api/health` | System health |

## Files removed from v2

| File | Reason |
|------|--------|
| `dashboard/server.py` | Replaced by `backend/main.py` with PostgreSQL |
| `dashboard/dashboard_themed.html` | Replaced by `dashboard/index.html` |
| `_bakups/*` | Old dashboard versions, superseded |
| `dashboard/dashboard.bak` | Backup file, no value |
| `dashboard/deshboard_demo.zip` | Nested archive |
| `python/doc_ingestor.py` | v1, superseded by v2 (kept in repo for reference) |
| `dashboard/logs/*.jsonl` | JSONL flat files replaced by PostgreSQL |
