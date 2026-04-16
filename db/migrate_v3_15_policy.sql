-- Migration v3.15 — Tenant policy overrides
-- Allows per-tenant overrides of the BASE_POLICY defaults

CREATE TABLE IF NOT EXISTS policy_overrides (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_key    TEXT NOT NULL,
    rule_value  TEXT NOT NULL,   -- stored as string, cast to bool/int/float at runtime
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_policy_overrides_tenant ON policy_overrides(tenant_id);
