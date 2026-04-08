-- DocuAgent v3.8 Migration — Onboarding Wizard
-- Run: docker exec docuagent_v3-postgres-1 psql -U postgres -d docuagent -f /docker-entrypoint-initdb.d/migrate_v3_8_onboarding.sql

CREATE TABLE IF NOT EXISTS onboarding_state (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    current_step    INT NOT NULL DEFAULT 1,
    completed_steps INT[] NOT NULL DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}',
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tenant ON onboarding_state(tenant_id);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onboarding_state_updated_at ON onboarding_state;
CREATE TRIGGER onboarding_state_updated_at
    BEFORE UPDATE ON onboarding_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
