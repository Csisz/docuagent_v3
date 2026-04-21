-- DocuAgent v3.23 Migration — Integration sync status tracking
-- Uses the existing `config` table (tenant_id IS NULL for global integration state).
-- No new tables needed — all state stored as config key-value pairs.
--
-- Keys written at runtime:
--   integration.gmail_email              — connected Gmail account (set via GMAIL_ACCOUNT_EMAIL env or UI)
--   integration.gmail_connected_at       — ISO timestamp of first connection
--   integration.gmail_token_expires_at   — ISO timestamp when OAuth token expires (from GMAIL_TOKEN_EXPIRES_AT env)
--   integration.gmail_last_test          — ISO timestamp of last successful /api/integrations/gmail/test call
--   integration.calendar_last_sync       — ISO timestamp of last /api/calendar/sync completion
--   integration.calendar_last_error      — plain-text error summary from last sync (empty = no error)
--
-- Run:
--   docker exec docuagent_v3-postgres-1 \
--     psql -U postgres -d docuagent -f /migrations/migrate_v3_23_integration_sync_status.sql

-- Ensure the config table has the index that makes tenant_id IS NULL lookups fast.
CREATE INDEX IF NOT EXISTS idx_config_global ON config(key) WHERE tenant_id IS NULL;

-- Seed Gmail account email from env if known (optional — backend seeds this on first /gmail/status call).
-- No-op if already set.
INSERT INTO config (id, tenant_id, key, value)
  SELECT gen_random_uuid(), NULL, 'integration.gmail_email', ''
  WHERE NOT EXISTS (
    SELECT 1 FROM config WHERE tenant_id IS NULL AND key = 'integration.gmail_email'
  );

INSERT INTO config (id, tenant_id, key, value)
  SELECT gen_random_uuid(), NULL, 'integration.calendar_last_sync', ''
  WHERE NOT EXISTS (
    SELECT 1 FROM config WHERE tenant_id IS NULL AND key = 'integration.calendar_last_sync'
  );

INSERT INTO config (id, tenant_id, key, value)
  SELECT gen_random_uuid(), NULL, 'integration.calendar_last_error', ''
  WHERE NOT EXISTS (
    SELECT 1 FROM config WHERE tenant_id IS NULL AND key = 'integration.calendar_last_error'
  );
