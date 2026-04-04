-- DocuAgent v3.7 Migration — Calendar bi-directional sync
-- Run: docker exec docuagent_v3-postgres-1 psql -U postgres -d docuagent -f /docker-entrypoint-initdb.d/migrate_v3_7_calendar_sync.sql

-- ── calendar_events tábla létrehozása (ha még nem létezik) ────
CREATE TABLE IF NOT EXISTS calendar_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email_id        UUID REFERENCES emails(id) ON DELETE SET NULL,
    google_event_id TEXT UNIQUE,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    attendees       TEXT DEFAULT '[]',
    status          TEXT DEFAULT 'confirmed',
    source          TEXT NOT NULL DEFAULT 'manual',
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Hiányzó oszlopok hozzáadása (idempotens) ─────────────────
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

-- ── UNIQUE constraint on google_event_id (critical for ON CONFLICT upsert) ──
-- Safe: only add if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_google_event_id'
          AND conrelid = 'calendar_events'::regclass
    ) THEN
        ALTER TABLE calendar_events
            ADD CONSTRAINT unique_google_event_id UNIQUE (google_event_id);
    END IF;
END $$;

-- ── Indexek ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_calendar_tenant    ON calendar_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calendar_start     ON calendar_events(start_time ASC);
CREATE INDEX IF NOT EXISTS idx_calendar_google_id ON calendar_events(google_event_id);

-- ── updated_at auto-trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calendar_events_updated_at ON calendar_events;
CREATE TRIGGER calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
