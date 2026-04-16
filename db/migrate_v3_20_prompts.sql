-- Migration v3.20 — Prompt version registry

CREATE TABLE IF NOT EXISTS prompt_versions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    version     INT NOT NULL,
    content     TEXT NOT NULL,
    model_hint  TEXT,
    is_active   BOOLEAN DEFAULT FALSE,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_name_active ON prompt_versions(name, is_active);

-- Add prompt tracking columns to agent_runs
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS prompt_name    TEXT;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS prompt_version INT;
