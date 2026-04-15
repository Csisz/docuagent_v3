-- DocuAgent v3.12 — CRM réteg migráció
-- Táblák: contacts, cases, case_emails, tasks

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Contacts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    full_name  TEXT,
    company    TEXT,
    phone      TEXT,
    notes      TEXT,
    tags       TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- ── Cases ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    status      TEXT DEFAULT 'open',      -- open, in_progress, resolved, closed
    priority    TEXT DEFAULT 'normal',    -- low, normal, high, urgent
    category    TEXT,
    assigned_to TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Case ↔ Email kapcsolótábla ────────────────────────────────
CREATE TABLE IF NOT EXISTS case_emails (
    case_id  UUID REFERENCES cases(id)  ON DELETE CASCADE,
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
    PRIMARY KEY (case_id, email_id)
);

-- ── Tasks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID REFERENCES tenants(id)   ON DELETE CASCADE,
    case_id     UUID REFERENCES cases(id)     ON DELETE SET NULL,
    contact_id  UUID REFERENCES contacts(id)  ON DELETE SET NULL,
    title       TEXT NOT NULL,
    due_date    TIMESTAMPTZ,
    completed   BOOLEAN DEFAULT FALSE,
    assigned_to TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'contacts_updated_at'
  ) THEN
    CREATE TRIGGER contacts_updated_at
      BEFORE UPDATE ON contacts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'cases_updated_at'
  ) THEN
    CREATE TRIGGER cases_updated_at
      BEFORE UPDATE ON cases
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── Indexek ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_tenant    ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email     ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_cases_tenant       ON cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cases_status       ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_contact      ON cases(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant       ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed    ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_case_emails_case   ON case_emails(case_id);
CREATE INDEX IF NOT EXISTS idx_case_emails_email  ON case_emails(email_id);
