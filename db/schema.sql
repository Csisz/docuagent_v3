-- DocuAgent v3 — PostgreSQL Schema
-- Run: psql -U postgres -d docuagent -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── emails ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emails (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id    TEXT UNIQUE,              -- Gmail message-id (deduplicate)
    subject       TEXT NOT NULL,
    sender        TEXT NOT NULL,
    body          TEXT,
    category      TEXT,                     -- complaint | inquiry | other
    status        TEXT NOT NULL DEFAULT 'NEW',  -- NEW | AI_ANSWERED | NEEDS_ATTENTION | CLOSED
    urgent        BOOLEAN DEFAULT FALSE,
    ai_decision   JSONB,                    -- {can_answer, confidence, reason}
    ai_response   TEXT,
    confidence    FLOAT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Status constraint
ALTER TABLE emails
    ADD CONSTRAINT emails_status_check
    CHECK (status IN ('NEW','AI_ANSWERED','NEEDS_ATTENTION','CLOSED'));

-- Index for fast status filtering
CREATE INDEX IF NOT EXISTS idx_emails_status     ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);

-- ── feedback ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id       UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    ai_decision    TEXT,                    -- what AI decided
    user_decision  TEXT NOT NULL,           -- what human changed it to
    note           TEXT,                    -- optional human note
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_email_id  ON feedback(email_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- ── documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename      TEXT NOT NULL,
    uploader      TEXT,
    uploader_email TEXT,
    tag           TEXT DEFAULT 'general',
    department    TEXT DEFAULT 'General',
    access_level  TEXT DEFAULT 'employee',
    size_kb       INT DEFAULT 0,
    lang          TEXT DEFAULT 'HU',
    qdrant_ok     BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- ── auto-update updated_at trigger ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER emails_updated_at
    BEFORE UPDATE ON emails
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── useful views ──────────────────────────────────────────────
CREATE OR REPLACE VIEW email_stats AS
SELECT
    status,
    COUNT(*)                                          AS count,
    COUNT(*) FILTER (WHERE urgent)                    AS urgent_count,
    AVG(confidence)                                   AS avg_confidence,
    MAX(created_at)                                   AS latest
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
