-- Migration v3.16 — Extend case_emails with auto-link metadata
-- case_emails already exists from v3.12; we add tracking columns

ALTER TABLE case_emails ADD COLUMN IF NOT EXISTS linked_at  TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE case_emails ADD COLUMN IF NOT EXISTS linked_by  TEXT DEFAULT 'manual';

-- Index for reverse lookup: email → cases
CREATE INDEX IF NOT EXISTS idx_case_emails_email_id ON case_emails(email_id);
