-- ── migrate_v3_9_templates.sql ──────────────────────────────────
-- Agent Template Library — sablonok iparág-specifikus konfigurációkhoz

CREATE TABLE IF NOT EXISTS agent_templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,           -- 'accounting', 'legal', 'sales', 'hr'
    description TEXT,
    config      JSONB NOT NULL DEFAULT '{}',
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: 4 alap sablon
INSERT INTO agent_templates (id, name, category, description, config, is_default) VALUES
(
    'a0000001-0000-0000-0000-000000000001',
    'Könyvelői Asszisztens',
    'accounting',
    'Számlák, adóbevallások, pénzügyi egyenlegek és könyvelési kérdések automatikus kezelésére.',
    '{
        "email_categories": ["invoice", "inquiry", "complaint"],
        "confidence_threshold": 0.75,
        "reply_style": "formal",
        "language": "hu",
        "keywords": ["számla", "fizetés", "adó", "mérleg", "könyvelés", "bevallás", "ÁFA"],
        "auto_answer_categories": ["inquiry"],
        "escalate_categories": ["complaint"],
        "features": ["Automatikus számlafeldolgozás", "Adókérdések azonosítása", "Ügyfél-egyenleg lekérések kezelése", "Sürgős fizetési emlékeztetők prioritása"]
    }',
    FALSE
),
(
    'a0000002-0000-0000-0000-000000000002',
    'Ügyvédi Asszisztens',
    'legal',
    'Szerződések, jogi kérdések, határidők és ügyféltájékoztatók kezelésére ügyvédi irodáknak.',
    '{
        "email_categories": ["contract", "inquiry", "legal_notice", "complaint"],
        "confidence_threshold": 0.85,
        "reply_style": "very_formal",
        "language": "hu",
        "keywords": ["szerződés", "peres", "határidő", "megbízás", "képviselet", "jogi", "felmondás"],
        "auto_answer_categories": ["inquiry"],
        "escalate_categories": ["legal_notice", "complaint", "contract"],
        "features": ["Szerződéses megkeresések priorizálása", "Határidős ügyek kiemelése", "Nagyon formális válaszstílus", "Automatikus ügyfél-azonosítás"]
    }',
    FALSE
),
(
    'a0000003-0000-0000-0000-000000000003',
    'Sales Asszisztens',
    'sales',
    'Érdeklődők, ajánlatkérések és ügyfélkapcsolatok kezelésére értékesítési csapatoknak.',
    '{
        "email_categories": ["inquiry", "offer_request", "follow_up", "complaint"],
        "confidence_threshold": 0.65,
        "reply_style": "friendly",
        "language": "hu",
        "keywords": ["ajánlat", "ár", "demo", "próba", "érdeklődés", "megrendelés", "vásárlás"],
        "auto_answer_categories": ["inquiry", "follow_up"],
        "escalate_categories": ["complaint"],
        "features": ["Gyors válasz érdeklődőknek", "Ajánlatkérések automatikus kategorizálása", "Barátságos hangvételű válaszok", "CRM-integrációra kész"]
    }',
    FALSE
),
(
    'a0000004-0000-0000-0000-000000000004',
    'HR Asszisztens',
    'hr',
    'Álláspályázatok, bérügyek, szabadságkérelmek és HR adminisztráció automatizálásához.',
    '{
        "email_categories": ["application", "inquiry", "complaint", "internal"],
        "confidence_threshold": 0.70,
        "reply_style": "professional",
        "language": "hu",
        "keywords": ["pályázat", "állás", "fizetés", "szabadság", "felmondás", "HR", "munkaszerződés"],
        "auto_answer_categories": ["inquiry", "internal"],
        "escalate_categories": ["complaint", "application"],
        "features": ["Pályázatok automatikus fogadása", "Szabadság- és bérügyek kategorizálása", "Belső HR körlevél kezelés", "GDPR-tudatos adatkezelés"]
    }',
    FALSE
)
ON CONFLICT (id) DO NOTHING;
