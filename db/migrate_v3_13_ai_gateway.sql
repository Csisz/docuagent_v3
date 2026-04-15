-- DocuAgent v3.13 — AI Gateway usage log

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    model       TEXT NOT NULL,
    task_type   TEXT NOT NULL,
    tokens_used INT  DEFAULT 0,
    cost_usd    FLOAT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_tenant    ON ai_usage_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_model     ON ai_usage_log(model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created   ON ai_usage_log(created_at DESC);
