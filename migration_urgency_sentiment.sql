-- DocuAgent v3.4 — Migration: urgency_score + sentiment
-- Futtatás: psql -U postgres -d docuagent -f migration_urgency_sentiment.sql
-- Vagy Docker-ben: docker exec -i db psql -U postgres -d docuagent < migration_urgency_sentiment.sql

ALTER TABLE emails
    ADD COLUMN IF NOT EXISTS urgency_score  INT     DEFAULT 0
        CHECK (urgency_score >= 0 AND urgency_score <= 100),
    ADD COLUMN IF NOT EXISTS sentiment      TEXT    DEFAULT 'neutral'
        CHECK (sentiment IN ('positive', 'neutral', 'negative', 'angry'));

-- Index a sürgősség szerinti rendezéshez
CREATE INDEX IF NOT EXISTS idx_emails_urgency_score ON emails(urgency_score DESC);
CREATE INDEX IF NOT EXISTS idx_emails_sentiment     ON emails(sentiment);

-- Megjegyzés: a meglévő sorok urgency_score=0, sentiment='neutral' alapértékeket kapnak.
-- A jövőbeli emailek az AI classify hívásnál töltik fel ezeket a mezőket.
