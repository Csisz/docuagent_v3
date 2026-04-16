-- Migration v3.19 — Role-based approval chain extensions

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_approve_auto BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_senior_approval_for TEXT[] DEFAULT '{}';

-- Add senior_required flag to emails so approval UI can display badge
ALTER TABLE emails ADD COLUMN IF NOT EXISTS senior_required BOOLEAN DEFAULT FALSE;

-- Index for pending-senior query
CREATE INDEX IF NOT EXISTS idx_emails_senior_required ON emails(tenant_id, senior_required)
  WHERE senior_required = TRUE AND status = 'NEEDS_ATTENTION';
