# DocuAgent v3 — Production System

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

### 1. Start infrastructure
```bash
cp .env.example .env
# Fill in OPENAI_API_KEY and other values
docker compose up -d
```

### 2. Install backend
```bash
cd backend
pip install -r requirements.txt
```

### 3. Start backend
```bash
python main.py
# → http://localhost:8000
# → http://localhost:8000/docs (API docs)
```

### 4. Open dashboard
```
http://localhost:8000
```

### 5. Configure n8n WF1
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
