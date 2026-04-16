-- Migration v3.18 — Usage metering + tenant quotas

CREATE TABLE IF NOT EXISTS usage_records (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_start     DATE NOT NULL,
    period_end       DATE NOT NULL,
    emails_processed INT DEFAULT 0,
    ai_calls_made    INT DEFAULT 0,
    tokens_consumed  BIGINT DEFAULT 0,
    cost_usd         FLOAT DEFAULT 0,
    documents_stored INT DEFAULT 0,
    rag_queries      INT DEFAULT 0,
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, period_start)
);

CREATE TABLE IF NOT EXISTS tenant_quotas (
    tenant_id              UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    plan                   TEXT NOT NULL DEFAULT 'starter',
    max_emails_per_month   INT DEFAULT 500,
    max_documents          INT DEFAULT 50,
    max_ai_calls_per_month INT DEFAULT 1000,
    max_tokens_per_month   BIGINT DEFAULT 500000,
    allow_premium_model    BOOLEAN DEFAULT FALSE,
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_period ON usage_records(tenant_id, period_start DESC);
