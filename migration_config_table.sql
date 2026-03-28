-- DocuAgent v3.4 — Migration: config tábla (SLA és egyéb beállításokhoz)
-- Futtatás PowerShellből:
-- Get-Content migration_config_table.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent

CREATE TABLE IF NOT EXISTS config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SLA alapértékek (warning: 4 óra, breach: 8 óra)
INSERT INTO config (key, value) VALUES
    ('sla_warning_hours', '4'),
    ('sla_breach_hours',  '8')
ON CONFLICT (key) DO NOTHING;
