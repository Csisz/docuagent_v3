-- Migration v3.11 — Audit Log tábla
-- Futtatás: psql $DATABASE_URL -f db/migrate_v3_11_audit_log.sql

CREATE TABLE IF NOT EXISTS audit_log (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID         REFERENCES tenants(id) ON DELETE CASCADE,
    user_id      UUID,
    user_email   TEXT,
    action       TEXT         NOT NULL,
    entity_type  TEXT         NOT NULL,
    entity_id    TEXT,
    details      JSONB        NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id   ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at  ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action      ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log(entity_type);
