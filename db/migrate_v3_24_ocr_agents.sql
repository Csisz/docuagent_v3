-- DocuAgent v3.24 Migration — OCR jobs + Agent config extensions + agent_config_id on runs
-- Run: docker exec docuagent_v3-postgres-1 psql -U postgres -d docuagent -f /migrations/migrate_v3_24_ocr_agents.sql

-- ── OCR jobs tábla ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ocr_jobs (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_id        UUID         REFERENCES emails(id) ON DELETE SET NULL,
    status          TEXT         NOT NULL DEFAULT 'pending',
    model           TEXT         NOT NULL DEFAULT 'gpt-4o-mini',
    raw_text        TEXT,
    extracted_json  JSONB,
    confidence      FLOAT,
    cost_usd        FLOAT        DEFAULT 0,
    latency_ms      INT,
    error_message   TEXT,
    input_summary   TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    CONSTRAINT ocr_jobs_status_check CHECK (status IN ('pending', 'running', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_tenant    ON ocr_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_email     ON ocr_jobs(email_id);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status    ON ocr_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_created   ON ocr_jobs(created_at DESC);

-- ── agent_configs — bővítés runtime mezőkkel ─────────────────
-- Megjegyzés: a meglévő 'trigger' oszlop neve marad 'trigger', nem nevezzük át
-- (a kód már erre hivatkozik). Az alábbi oszlopok újak.
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS system_prompt          TEXT;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS model                  TEXT    DEFAULT 'gpt-4o-mini';
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS confidence_threshold   FLOAT   DEFAULT 0.75;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS n8n_webhook_url        TEXT;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS last_activated_at      TIMESTAMPTZ;
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS run_count              INT     DEFAULT 0;

-- ── agent_runs — agent_config hivatkozás ─────────────────────
-- Allows filtering runs per agent config
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS agent_config_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agent_runs_config_id ON agent_runs(agent_config_id);
