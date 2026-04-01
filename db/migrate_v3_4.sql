-- DocuAgent v3.4 Migration
-- Run: docker exec docuagent_v3-postgres-1 psql -U postgres -d docuagent -f /docker-entrypoint-initdb.d/migrate_v3_4.sql

ALTER TABLE emails
    ADD COLUMN IF NOT EXISTS urgency_score INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sentiment TEXT DEFAULT 'neutral';

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS qdrant_collection TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Ha a tábla neve még system_config, nevezd át config-ra:
-- ALTER TABLE system_config RENAME TO config;

ALTER TABLE emails
    ADD CONSTRAINT IF NOT EXISTS emails_sentiment_check
    CHECK (sentiment IN ('positive','neutral','negative','angry'));
