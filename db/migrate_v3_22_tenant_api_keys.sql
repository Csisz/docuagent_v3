-- migrate_v3_22_tenant_api_keys.sql
-- Tenant API keys tábla: SHA256-hash alapú kulcstárolás, prefix megjelenítéshez

CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash   TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    label      TEXT,
    is_active  BOOLEAN DEFAULT TRUE,
    last_used  TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_hash   ON tenant_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_tenant ON tenant_api_keys(tenant_id);
