-- DocuAgent v3.4 — PostgreSQL Schema
-- Run: psql -U postgres -d docuagent -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── tenants — bérlők (cégek) ──────────────────────────────────
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

-- ── users — felhasználók ──────────────────────────────────────
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

-- ── emails ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emails (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
    message_id    TEXT UNIQUE,
    subject       TEXT NOT NULL,
    sender        TEXT NOT NULL,
    body          TEXT,
    category      TEXT,
    status        TEXT NOT NULL DEFAULT 'NEW',
    urgent        BOOLEAN DEFAULT FALSE,
    urgency_score INT DEFAULT 0,
    sentiment     TEXT DEFAULT 'neutral',
    ai_decision   JSONB,
    ai_response   TEXT,
    confidence    FLOAT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE emails
    ADD CONSTRAINT IF NOT EXISTS emails_status_check
    CHECK (status IN ('NEW','AI_ANSWERED','NEEDS_ATTENTION','CLOSED'));

ALTER TABLE emails
    ADD CONSTRAINT IF NOT EXISTS emails_sentiment_check
    CHECK (sentiment IN ('positive','neutral','negative','angry'));

CREATE INDEX IF NOT EXISTS idx_emails_tenant_id  ON emails(tenant_id);
CREATE INDEX IF NOT EXISTS idx_emails_status     ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);

-- ── feedback ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email_id       UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    ai_decision    TEXT,
    user_decision  TEXT NOT NULL,
    note           TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_email_id   ON feedback(email_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- ── documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID REFERENCES tenants(id) ON DELETE CASCADE,
    filename          TEXT NOT NULL,
    uploader          TEXT,
    uploader_email    TEXT,
    tag               TEXT DEFAULT 'general',
    department        TEXT DEFAULT 'General',
    access_level      TEXT DEFAULT 'employee',
    collection        TEXT DEFAULT 'general',   -- v3.3: Qdrant collection neve
    qdrant_collection TEXT,
    size_kb           INT DEFAULT 0,
    lang              TEXT DEFAULT 'HU',
    qdrant_ok         BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_id  ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);

-- ── rag_logs — RAG lekérdezés napló (v3.3 új) ────────────────
-- Minden /rag/query és /generate-reply hívás naplózódik ide.
-- Alapja a visszamérésnek, auditnak és a tanuló rendszernek.
CREATE TABLE IF NOT EXISTS rag_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email_id        UUID REFERENCES emails(id) ON DELETE SET NULL,
    query           TEXT NOT NULL,               -- a kérdés / email subject+body
    answer          TEXT,                        -- AI válasz
    fallback_used   BOOLEAN DEFAULT FALSE,       -- sablon válasz ment-e ki
    confidence      FLOAT,                       -- osztályozás confidence
    sources_count   INT DEFAULT 0,               -- hány dokumentumból dolgozott
    source_docs     JSONB,                       -- [{filename, score, collection}]
    collection      TEXT DEFAULT 'general',      -- melyik Qdrant collection
    lang            TEXT DEFAULT 'HU',
    latency_ms      INT,                         -- válaszidő ms-ben
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_logs_email_id   ON rag_logs(email_id);
CREATE INDEX IF NOT EXISTS idx_rag_logs_created_at ON rag_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_logs_fallback   ON rag_logs(fallback_used);

-- ── config — kulcs-érték konfiguráció (v3.4) ─────────────────
-- SLA határok, értesítési beállítások, stb.
-- tenant_id NULL = globális alapértelmezett
CREATE TABLE IF NOT EXISTS config (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, key)
);

-- Globális alapértelmezett SLA értékek (tenant_id = NULL)
INSERT INTO config (tenant_id, key, value) VALUES
    (NULL, 'sla_warning_hours', '4'),
    (NULL, 'sla_breach_hours',  '24')
ON CONFLICT (tenant_id, key) DO NOTHING;

-- ── chat_sessions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    title       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── chat_messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    sources     JSONB,
    confidence  FLOAT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session  ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant   ON chat_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated  ON chat_sessions(updated_at DESC);

-- ── auto-update updated_at trigger ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER emails_updated_at
    BEFORE UPDATE ON emails
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER config_updated_at
    BEFORE UPDATE ON config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── views ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW email_stats AS
SELECT
    status,
    COUNT(*)                             AS count,
    COUNT(*) FILTER (WHERE urgent)       AS urgent_count,
    AVG(confidence)                      AS avg_confidence,
    MAX(created_at)                      AS latest
FROM emails
GROUP BY status;

CREATE OR REPLACE VIEW feedback_summary AS
SELECT
    ai_decision,
    user_decision,
    COUNT(*) AS count,
    MAX(created_at) AS latest
FROM feedback
GROUP BY ai_decision, user_decision
ORDER BY count DESC;

-- rag_logs összesítő nézet
CREATE OR REPLACE VIEW rag_stats AS
SELECT
    DATE(created_at)                              AS day,
    COUNT(*)                                      AS total_queries,
    COUNT(*) FILTER (WHERE fallback_used)         AS fallback_count,
    ROUND(AVG(confidence)::numeric, 2)            AS avg_confidence,
    ROUND(AVG(latency_ms)::numeric)               AS avg_latency_ms,
    COUNT(DISTINCT collection)                    AS collections_used
FROM rag_logs
GROUP BY day
ORDER BY day DESC;
