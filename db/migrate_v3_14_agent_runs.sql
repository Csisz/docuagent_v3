-- Migration v3.14 — Agent Runs execution log
-- Records every AI pipeline execution: classify, reply, doc_ingest, chat, webhook

CREATE TABLE IF NOT EXISTS agent_runs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    trigger_type      TEXT NOT NULL,      -- 'email_classify', 'reply_generate', 'doc_ingest', 'chat', 'n8n_webhook'
    trigger_ref       UUID,               -- email_id, document_id, or null
    input_summary     TEXT,               -- short description of input (not full body)
    status            TEXT NOT NULL DEFAULT 'running',  -- running, success, failed, timeout
    ai_model          TEXT,
    prompt_tokens     INT  DEFAULT 0,
    completion_tokens INT  DEFAULT 0,
    cost_usd          FLOAT DEFAULT 0,
    latency_ms        INT,
    error_message     TEXT,
    result_summary    TEXT,               -- short description of outcome
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    finished_at       TIMESTAMPTZ,
    CONSTRAINT agent_runs_status_check CHECK (status IN ('running', 'success', 'failed', 'timeout'))
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_id   ON agent_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status      ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at  ON agent_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_trigger_ref ON agent_runs(trigger_ref);
