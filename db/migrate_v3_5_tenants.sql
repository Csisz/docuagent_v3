-- DocuAgent v3.5 Migration — Multi-tenancy
-- Run: docker exec docuagent_v3-postgres-1 psql -U postgres -d docuagent -f /docker-entrypoint-initdb.d/migrate_v3_5_tenants.sql

-- ── Tenants tábla létrehozása ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,
    plan            TEXT NOT NULL DEFAULT 'free',
    email_limit     INT DEFAULT 500,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Users tábla létrehozása ───────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    full_name       TEXT,
    role            TEXT NOT NULL DEFAULT 'agent',
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email),
    CONSTRAINT users_role_check CHECK (role IN ('admin','agent','viewer'))
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);

-- ── tenant_id hozzáadása meglévő táblákhoz (NULL-able, visszafelé kompatibilis) ──
ALTER TABLE emails    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE feedback  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE rag_logs  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- config tábla átalakítása (ha még régi single-key formátumban van)
-- Ha a config táblának még TEXT PRIMARY KEY-je van a key-n, futtasd:
-- ALTER TABLE config DROP CONSTRAINT config_pkey;
-- ALTER TABLE config ADD COLUMN id UUID DEFAULT uuid_generate_v4();
-- ALTER TABLE config ADD COLUMN tenant_id UUID REFERENCES tenants(id);
-- ALTER TABLE config ADD PRIMARY KEY (id);
-- ALTER TABLE config ADD CONSTRAINT config_tenant_key_unique UNIQUE (tenant_id, key);

CREATE INDEX IF NOT EXISTS idx_emails_tenant_id    ON emails(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);

-- ── Demo tenant és admin user (development) ───────────────────
INSERT INTO tenants (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Kft.', 'demo', 'pro')
ON CONFLICT DO NOTHING;

-- Tenants updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
