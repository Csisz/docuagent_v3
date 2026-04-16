-- Migration v3.21 — Invoice extractions (Billingo workflow preparation)

CREATE TABLE IF NOT EXISTS invoice_extractions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_id       UUID REFERENCES emails(id),
    document_id    UUID REFERENCES documents(id),
    invoice_number TEXT,
    vendor_name    TEXT,
    amount         FLOAT,
    currency       TEXT DEFAULT 'HUF',
    due_date       DATE,
    issue_date     DATE,
    vat_amount     FLOAT,
    raw_extraction JSONB,
    confidence     FLOAT,
    status         TEXT DEFAULT 'extracted',
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_invoice_status CHECK (status IN ('extracted','verified','rejected','sent_to_billingo'))
);

CREATE INDEX IF NOT EXISTS idx_invoice_extractions_email ON invoice_extractions(email_id);
CREATE INDEX IF NOT EXISTS idx_invoice_extractions_tenant ON invoice_extractions(tenant_id, created_at DESC);
