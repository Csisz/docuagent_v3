-- Migration v3.10 — Agent Configs tábla
-- Futtatás: psql $DATABASE_URL -f db/migrate_v3_10_agent_configs.sql

CREATE TABLE IF NOT EXISTS agent_configs (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID         REFERENCES tenants(id) ON DELETE CASCADE,
    name          TEXT         NOT NULL,
    trigger       TEXT         NOT NULL DEFAULT 'email',
    filters       JSONB        NOT NULL DEFAULT '{}',
    actions       JSONB        NOT NULL DEFAULT '[]',
    approval_mode TEXT         NOT NULL DEFAULT 'auto',
    style         JSONB        NOT NULL DEFAULT '{}',
    is_active     BOOLEAN      DEFAULT true,
    created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_tenant_id  ON agent_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_is_active  ON agent_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_configs_created_at ON agent_configs(created_at DESC);
