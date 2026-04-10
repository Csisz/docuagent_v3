"""
Demo adatok seed + reset logika.
Megosztott modul: seed_demo.py CLI és /api/demo/reset endpoint is használja.
"""
import uuid
import json
import logging
from datetime import datetime, timedelta, timezone

import db.database as db

log = logging.getLogger("docuagent")

DEMO_TENANT_SLUG = "demo"
DEMO_USER_EMAIL  = "demo@agentify.hu"
DEMO_USER_PASS   = "demo1234"

# ── Demo email adatok ─────────────────────────────────────────
_EMAILS = [
    # ── NEEDS_ATTENTION (5) ──────────────────────────────────
    {
        "subject":      "Sürgős! Szerződés megszegése – azonnali intézkedés szükséges",
        "sender":       "kovacs.peter@nagyceg.hu",
        "body":         "Tisztelt Hölgyem/Uram!\n\nA 2024/Q3-A szerződés 8.2§ alapján súlyos szerződésszegés történt. Azonnali intézkedést kérünk, különben kártérítési eljárást indítunk. Határidő: 3 munkanap.\n\nÜdvözlettel,\nKovács Péter\nNagyCég Zrt.",
        "category":     "complaint",
        "status":       "NEEDS_ATTENTION",
        "urgent":       True,
        "urgency_score": 92,
        "sentiment":    "negative",
        "confidence":   0.55,
        "ai_response":  "Köszönjük a jelzést. Ügyét prioritásként kezeljük, és 24 órán belül visszajelzünk az általunk megtett lépésekről.",
        "days_ago":     1,
    },
    {
        "subject":      "Nagyvállalati szoftverlicenc ajánlatkérés – 500 felhasználó",
        "sender":       "beszerzes@globalcorp.hu",
        "body":         "Érdeklődünk a DocuAgent Enterprise csomag kapcsán 500+ felhasználóra vonatkozó ajánlatért. Kérjük küldjék el az éves licencdíjat, SLA feltételeket és referencialistát.",
        "category":     "inquiry",
        "status":       "NEEDS_ATTENTION",
        "urgent":       False,
        "urgency_score": 68,
        "sentiment":    "neutral",
        "confidence":   0.62,
        "ai_response":  "Köszönjük érdeklődését! Az Enterprise csomag részletes ajánlatát hamarosan elküldjük. Sales kollégánk 24 órán belül felveszi Önnel a kapcsolatot.",
        "days_ago":     1,
    },
    {
        "subject":      "Munkajogi kérdés – túlóra elszámolás vitás ügye",
        "sender":       "toth.anita@munkavallalo.hu",
        "body":         "Tisztelt HR Osztály!\n\nAz elmúlt 3 hónapban ledolgozott túlóráim (összesen 47 óra) nem kerültek elszámolásra. A munkáltatói igazolás sem érkezett meg. Kérem a mielőbbi rendezést, különben munkaügyi eljárást indítok.",
        "category":     "complaint",
        "status":       "NEEDS_ATTENTION",
        "urgent":       True,
        "urgency_score": 78,
        "sentiment":    "negative",
        "confidence":   0.58,
        "ai_response":  "Kedves Tóth Anita! Elnézést a kellemetlenségért. HR kollégánk azonnal megvizsgálja az ügyet és 2 munkanapon belül visszajelzünk.",
        "days_ago":     2,
    },
    {
        "subject":      "Kritikus rendszerhiba – termelési környezet leállt",
        "sender":       "ops@partnertech.hu",
        "body":         "KRITIKUS: A partnerség keretében biztosított API integrációnk 2024-01-15 09:30 óta nem elérhető. A termelési folyamat leállt, percenként kb. 200.000 Ft kár keletkezik. Kérjük az azonnali beavatkozást!",
        "category":     "complaint",
        "status":       "NEEDS_ATTENTION",
        "urgent":       True,
        "urgency_score": 99,
        "sentiment":    "negative",
        "confidence":   0.51,
        "ai_response":  "",
        "days_ago":     0,
    },
    {
        "subject":      "Jogi értesítés – GDPR adatkezelési aggály",
        "sender":       "jogi@adatvedelmi-iroda.hu",
        "body":         "Értesítjük, hogy ügyfelünk nevében vizsgálatot folytatunk az Önök adatkezelési gyakorlatával kapcsolatban. Kérjük 15 napon belül megküldeni az adatkezelési tájékoztatót és a hozzájárulási nyilatkozatokat.",
        "category":     "legal_notice",
        "status":       "NEEDS_ATTENTION",
        "urgent":       False,
        "urgency_score": 74,
        "sentiment":    "neutral",
        "confidence":   0.60,
        "ai_response":  "Köszönjük az értesítést. Adatvédelmi tisztviselőnk 5 munkanapon belül felveszi Önnel a kapcsolatot és megküldi a kért dokumentációt.",
        "days_ago":     3,
    },

    # ── AI_ANSWERED (7) ──────────────────────────────────────
    {
        "subject":      "Árajánlat kérés – számviteli szoftver integráció",
        "sender":       "info@kiskonyvelo.hu",
        "body":         "Sziasztok! Érdeklődni szeretnék, hogy a DocuAgent mennyibe kerül egy 10 fős könyvelőirodának. Van-e lehetőség havi előfizetésre?",
        "category":     "inquiry",
        "status":       "AI_ANSWERED",
        "urgent":       False,
        "urgency_score": 20,
        "sentiment":    "positive",
        "confidence":   0.91,
        "ai_response":  "Kedves Érdeklődő!\n\nKöszönjük megkeresését! A DocuAgent Starter csomagja 10 fős irodáknak havi 49.900 Ft + ÁFA, éves előfizetés esetén 20% kedvezménnyel. Részletes árajánlatot sales@agentify.hu címen kérhet.\n\nÜdvözlettel,\nAgentify Support",
        "days_ago":     5,
    },
    {
        "subject":      "Számla kérés – 2024/0342 díjbekérő",
        "sender":       "szamvitel@ugyfel123.hu",
        "body":         "Kedves Ügyfélszolgálat! Kérném a 2024/0342 számú díjbekérőhöz tartozó teljesítésigazolást és a végszámlát PDF formátumban.",
        "category":     "invoice",
        "status":       "AI_ANSWERED",
        "urgent":       False,
        "urgency_score": 30,
        "sentiment":    "neutral",
        "confidence":   0.88,
        "ai_response":  "Kedves Partnerünk!\n\nA kért dokumentumokat az alábbi linkre feltöltöttük: [belső hivatkozás]. Amennyiben bármilyen kérdése merül fel, állunk rendelkezésére.\n\nÜdvözlettel,\nPénzügyi Osztály",
        "days_ago":     4,
    },
    {
        "subject":      "Jelszó visszaállítás kérés",
        "sender":       "nemes.balazs@ugyfel.hu",
        "body":         "Hello! Elfelejtettem a jelszavamat és nem kapom meg a visszaállító emailt. Tudnátok segíteni?",
        "category":     "inquiry",
        "status":       "AI_ANSWERED",
        "urgent":       False,
        "urgency_score": 10,
        "sentiment":    "neutral",
        "confidence":   0.96,
        "ai_response":  "Kedves Nemes Balázs!\n\nJelszó visszaállításhoz kérjük látogasson el a https://app.agentify.hu/reset oldalra. Ha a probléma fennáll, kérjük jelezze support@agentify.hu címen.\n\nÜdvözlettel,\nSupport Team",
        "days_ago":     3,
    },
    {
        "subject":      "Nyitvatartási idők – ügyfélszolgálat",
        "sender":       "info@kispartner.hu",
        "body":         "Sziasztok, mikor lehet elérni az ügyfélszolgálatot telefonon? Van-e hétvégi ügyeleti idő?",
        "category":     "inquiry",
        "status":       "AI_ANSWERED",
        "urgent":       False,
        "urgency_score": 5,
        "sentiment":    "positive",
        "confidence":   0.97,
        "ai_response":  "Kedves Érdeklődő!\n\nÜgyfélszolgálatunk hétköznapokon 8:00-17:00 között érhető el a +36 1 234 5678-as számon. Hétvégén kizárólag e-mailben (support@agentify.hu) válaszolunk, max. 4 órán belül.\n\nÜdvözlettel,\nAgentify Support",
        "days_ago":     6,
    },
    {
        "subject":      "Álláspályázat – Junior adatelemző pozíció",
        "sender":       "cv.beküldes@jeloltek.hu",
        "body":         "Tisztelt HR Osztály! Érdeklődéssel olvastam a Junior Adatelemző álláshirdetést és szeretnék jelentkezni. Mellékelten küldöm önéletrajzom és motivációs levelem.",
        "category":     "application",
        "status":       "AI_ANSWERED",
        "urgent":       False,
        "urgency_score": 15,
        "sentiment":    "positive",
        "confidence":   0.89,
        "ai_response":  "Tisztelt Pályázó!\n\nKöszönjük pályázatát! Anyagait megkaptuk és 5 munkanapon belül visszajelzünk. Az állásinterjúkat február első hetében tartjuk.\n\nÜdvözlettel,\nHR Osztály",
        "days_ago":     7,
    },
    {
        "subject":      "Szabadság kérelem – Március 15-20.",
        "sender":       "varga.eszter@intern.hu",
        "body":         "Kedves HR! Március 15-20. között szabadságot szeretnék kivenni (4 munkanap). Kérem a jóváhagyást.",
        "category":     "internal",
        "status":       "AI_ANSWERED",
        "urgent":       False,
        "urgency_score": 12,
        "sentiment":    "neutral",
        "confidence":   0.93,
        "ai_response":  "Kedves Varga Eszter!\n\nSzabadságkérelmét rögzítettük. Március 15. munkaszüneti nap (nemzeti ünnep), így 4 munkanap helyett 3 munkanapot szükséges kivenni. Kérjük, erősítse meg! Jóváhagyás folyamatban.\n\nÜdvözlettel,\nHR",
        "days_ago":     8,
    },
    {
        "subject":      "Visszaigazolás kérés – rendezvény regisztráció",
        "sender":       "regisztracio@konferencia.hu",
        "body":         "Kérjük erősítse meg, hogy a DocuAgent AI Summit 2024 rendezvényre regisztrált 3 főre vonatkozó részvételt.",
        "category":     "inquiry",
        "status":       "AI_ANSWERED",
        "urgent":       False,
        "urgency_score": 8,
        "sentiment":    "neutral",
        "confidence":   0.94,
        "ai_response":  "Kedves Szervező!\n\nMegerősítjük a DocuAgent AI Summit 2024 rendezvényre 3 fő részvételét (Horváth Viktor, Szabó Anna, Molnár Gábor). A belépőkártyákat e-mailben küldjük 48 órán belül.\n\nÜdvözlettel,\nAgentify Team",
        "days_ago":     10,
    },

    # ── NEW (5) ───────────────────────────────────────────────
    {
        "subject":      "Együttműködési ajánlat – közös értékesítési program",
        "sender":       "partner@reseller.hu",
        "body":         "Tisztelt Cégvezetőség! Egy közös viszonteladói program lehetőségét szeretnénk megvizsgálni. Cégünk 3 éve aktív a B2B SaaS értékesítésben, 200+ ügyfélkörrel. Szeretnénk megbeszélni az együttműködés részleteit.",
        "category":     "inquiry",
        "status":       "NEW",
        "urgent":       False,
        "urgency_score": 35,
        "sentiment":    "positive",
        "confidence":   0.0,
        "ai_response":  "",
        "days_ago":     0,
    },
    {
        "subject":      "Reklamáció – hibás termék kiszállítás (REF: 2024-5532)",
        "sender":       "panasz@webshopvevo.hu",
        "body":         "A 2024-5532 megrendelésszámú rendelésem sérülten érkezett meg. A doboz összetört, a tartalom használhatatlan. Kérem azonnali csere indítását vagy visszatérítést.",
        "category":     "complaint",
        "status":       "NEW",
        "urgent":       True,
        "urgency_score": 65,
        "sentiment":    "negative",
        "confidence":   0.0,
        "ai_response":  "",
        "days_ago":     0,
    },
    {
        "subject":      "Érdeklődés – API dokumentáció hozzáférés",
        "sender":       "developer@startupX.io",
        "body":         "Hello! Fejlesztőként érdeklődöm a DocuAgent API elérhetőségéről. Van-e Swagger/OpenAPI dokumentáció és sandbox tesztelési lehetőség?",
        "category":     "inquiry",
        "status":       "NEW",
        "urgent":       False,
        "urgency_score": 22,
        "sentiment":    "positive",
        "confidence":   0.0,
        "ai_response":  "",
        "days_ago":     0,
    },
    {
        "subject":      "Szerződésmódosítás kérése – 2023/ENG/0088 sz. szerződés",
        "sender":       "jogi@partnervalallat.hu",
        "body":         "Tisztelt Jogi Osztály! Kérjük a 2023/ENG/0088 számú szoftver-felhasználási szerződés 5.§-ának módosítását, tekintettel az új EU AI Act szabályozásra. Mellékletben küldöm a javasolt szövegváltozatot.",
        "category":     "contract",
        "status":       "NEW",
        "urgent":       False,
        "urgency_score": 48,
        "sentiment":    "neutral",
        "confidence":   0.0,
        "ai_response":  "",
        "days_ago":     1,
    },
    {
        "subject":      "Demo bemutató időpontfoglalás – Mór és Fiai Kft.",
        "sender":       "mor.tamas@moriaifiai.hu",
        "body":         "Szia! A LinkedIn bejegyzésetek alapján szeretnék egy 30 perces online demót foglalni a DocuAgent-ről. Lehetséges valami ezen a héten csütörtökön du. 14-17 között?",
        "category":     "inquiry",
        "status":       "NEW",
        "urgent":       False,
        "urgency_score": 30,
        "sentiment":    "positive",
        "confidence":   0.0,
        "ai_response":  "",
        "days_ago":     0,
    },

    # ── CLOSED (3) ────────────────────────────────────────────
    {
        "subject":      "Díjbekérő kiegyenlítve – 2024/INV/0289",
        "sender":       "szamvitel@fizeto-ugyfel.hu",
        "body":         "Értesítjük, hogy a 2024/INV/0289 számú díjbekérőt ma kiegyenlítettük. Utalási összeg: 485.000 Ft. Bank ref: HU12345678.",
        "category":     "invoice",
        "status":       "CLOSED",
        "urgent":       False,
        "urgency_score": 10,
        "sentiment":    "positive",
        "confidence":   0.85,
        "ai_response":  "Köszönjük az átutalást! A fizetést rögzítettük és a számlát lezártuk.",
        "days_ago":     14,
    },
    {
        "subject":      "Technikai probléma megoldódott – köszönet",
        "sender":       "happy.customer@ceg.hu",
        "body":         "Kedves Support! Értesítem, hogy a bejelentett technikai probléma megoldódott. Köszönöm a gyors és professzionális segítséget!",
        "category":     "other",
        "status":       "CLOSED",
        "urgent":       False,
        "urgency_score": 0,
        "sentiment":    "positive",
        "confidence":   0.92,
        "ai_response":  "Köszönjük a visszajelzést! Örülünk, hogy segíthettünk.",
        "days_ago":     20,
    },
    {
        "subject":      "Próbaidőszak lezárás – előfizetés megkötés",
        "sender":       "cfo@ujugyfel.hu",
        "body":         "A 30 napos próbaidőszak alapján úgy döntöttünk, hogy megkötjük az éves előfizetést a Business csomagra (25 felhasználó). Kérjük a szerződés megküldését.",
        "category":     "contract",
        "status":       "CLOSED",
        "urgent":       False,
        "urgency_score": 25,
        "sentiment":    "positive",
        "confidence":   0.87,
        "ai_response":  "Örömmel fogadtuk döntését! A szerződést és a számlát 24 órán belül megküldjük. Üdvözöljük az Agentify Business ügyfelek között!",
        "days_ago":     30,
    },
]

_DOCUMENTS = [
    {
        "filename": "agentify_szolgaltatasi_feltetelek_2024.pdf",
        "uploader": "Demo Admin",
        "uploader_email": DEMO_USER_EMAIL,
        "tag": "legal",
        "department": "Jogi",
        "collection": "general",
        "size_kb": 284,
        "lang": "HU",
    },
    {
        "filename": "ugyfelkezeles_folyamat_leiras.docx",
        "uploader": "Demo Admin",
        "uploader_email": DEMO_USER_EMAIL,
        "tag": "process",
        "department": "Operations",
        "collection": "general",
        "size_kb": 96,
        "lang": "HU",
    },
    {
        "filename": "arjegyzek_2024_Q1.xlsx",
        "uploader": "Demo Admin",
        "uploader_email": DEMO_USER_EMAIL,
        "tag": "finance",
        "department": "Értékesítés",
        "collection": "general",
        "size_kb": 52,
        "lang": "HU",
    },
]

_CALENDAR_EVENTS = [
    {
        "title":       "Heti csapatmegbeszélés",
        "description": "Heti szinkronizáció az operatív csapattal — prioritások, blokkolók, sprint review.",
        "start_offset_days": 1,
        "start_hour": 10,
        "duration_h": 1,
        "status": "confirmed",
        "source": "manual",
    },
    {
        "title":       "Demo bemutató – Mór és Fiai Kft.",
        "description": "30 perces online demo a DocuAgent funkcióiról. Zoom link: https://zoom.us/demo",
        "start_offset_days": 2,
        "start_hour": 14,
        "duration_h": 1,
        "status": "confirmed",
        "source": "manual",
    },
    {
        "title":       "Szerződés-tárgyalás – GlobalCorp",
        "description": "Enterprise licenc feltételek egyeztetése a GlobalCorp beszerzési csapatával.",
        "start_offset_days": 3,
        "start_hour": 11,
        "duration_h": 2,
        "status": "confirmed",
        "source": "manual",
    },
    {
        "title":       "AI Summit 2024 – céges részvétel",
        "description": "3 fő vesz részt a DocuAgent AI Summit konferencián. Budapest, Corinthia Hotel.",
        "start_offset_days": 7,
        "start_hour": 9,
        "duration_h": 8,
        "status": "confirmed",
        "source": "manual",
    },
    {
        "title":       "Q1 Pénzügyi zárás – könyvelői egyeztetés",
        "description": "Negyedéves pénzügyi zárás egyeztetése a könyvelővel. Kiszámlázás, túlórák, jutalékok.",
        "start_offset_days": 10,
        "start_hour": 13,
        "duration_h": 2,
        "status": "tentative",
        "source": "manual",
    },
]


async def _clear_demo_data(tenant_id: str):
    """Törli az összes demo tenant adatot (emailek, dokuk, naptár, feedback, rag_logs)."""
    # Sorrend: FK constraints miatt
    await db.execute("DELETE FROM rag_logs    WHERE tenant_id=$1", tenant_id)
    await db.execute("DELETE FROM feedback    WHERE tenant_id=$1", tenant_id)
    await db.execute("DELETE FROM calendar_events WHERE tenant_id=$1", tenant_id)
    await db.execute("DELETE FROM emails      WHERE tenant_id=$1", tenant_id)
    await db.execute("DELETE FROM documents   WHERE tenant_id=$1", tenant_id)


async def _insert_demo_data(tenant_id: str):
    """Beilleszt 20 email + 3 doc + 5 naptár eseményt + RAG logokat a demo tenant-hoz."""
    now = datetime.now(timezone.utc)
    email_ids = []

    for i, e in enumerate(_EMAILS):
        eid = str(uuid.uuid4())
        email_ids.append(eid)
        created = now - timedelta(days=e["days_ago"], hours=i % 8)
        msg_id  = f"demo-msg-{i:03d}-{eid[:8]}@agentify.demo"

        ai_decision = json.dumps({
            "category":   e["category"],
            "status":     e["status"],
            "confidence": e["confidence"],
            "urgent":     e["urgent"],
        }) if e["confidence"] > 0 else None

        await db.execute(
            """INSERT INTO emails
               (id, tenant_id, message_id, subject, sender, body, category,
                status, urgent, ai_response, ai_decision, confidence,
                urgency_score, sentiment, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)""",
            eid, tenant_id, msg_id,
            e["subject"], e["sender"], e["body"], e["category"],
            e["status"], e["urgent"],
            e["ai_response"] or None, ai_decision,
            e["confidence"], e["urgency_score"], e["sentiment"],
            created,
        )

        # RAG log bejegyzés — minden NEEDS_ATTENTION és AI_ANSWERED emailhez
        if e["status"] in ("AI_ANSWERED", "NEEDS_ATTENTION"):
            conf = e["confidence"] if e["confidence"] > 0 else 0.60
            # NEEDS_ATTENTION emailekhez 2 forrás, AI_ANSWERED-hez 1
            if e["status"] == "NEEDS_ATTENTION":
                sources = [
                    {"filename": "agentify_szolgaltatasi_feltetelek_2024.pdf",
                     "score": 0.87, "collection": "general"},
                    {"filename": "ugyfelkezeles_folyamat_leiras.docx",
                     "score": 0.74, "collection": "general"},
                ]
            else:
                sources = [
                    {"filename": "agentify_szolgaltatasi_feltetelek_2024.pdf",
                     "score": 0.87, "collection": "general"},
                ]
            await db.execute(
                """INSERT INTO rag_logs
                   (tenant_id, email_id, query, answer, confidence,
                    sources_count, source_docs, fallback_used, lang, latency_ms, created_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
                tenant_id, eid,
                e["subject"] + "\n" + e["body"][:200],
                e["ai_response"] or None,
                conf,
                len(sources),
                json.dumps(sources),
                e["status"] == "NEEDS_ATTENTION", "HU",
                int(800 + i * 120),
                created + timedelta(seconds=2),
            )

        # Feedback a NEEDS_ATTENTION emailekhez
        if e["status"] == "NEEDS_ATTENTION" and e["ai_response"]:
            await db.execute(
                """INSERT INTO feedback (tenant_id, email_id, ai_decision, user_decision, note, created_at)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                tenant_id, eid,
                e["category"], e["status"],
                "Demo: awaiting human review",
                created + timedelta(minutes=5),
            )

    # Dokumentumok
    for doc in _DOCUMENTS:
        did = str(uuid.uuid4())
        await db.execute(
            """INSERT INTO documents
               (id, tenant_id, filename, uploader, uploader_email, tag,
                department, collection, size_kb, lang, qdrant_ok, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
            did, tenant_id,
            doc["filename"], doc["uploader"], doc["uploader_email"],
            doc["tag"], doc["department"], doc["collection"],
            doc["size_kb"], doc["lang"], True,
            now - timedelta(days=30),
        )

    # Naptár események
    for ev in _CALENDAR_EVENTS:
        start = now.replace(hour=ev["start_hour"], minute=0, second=0, microsecond=0) \
                + timedelta(days=ev["start_offset_days"])
        end   = start + timedelta(hours=ev["duration_h"])
        await db.execute(
            """INSERT INTO calendar_events
               (id, tenant_id, title, description, start_time, end_time,
                attendees, status, source, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
            str(uuid.uuid4()), tenant_id,
            ev["title"], ev["description"],
            start, end,
            json.dumps([DEMO_USER_EMAIL]),
            ev["status"], ev["source"],
            now, now,
        )


async def reset_demo_data(tenant_id: str) -> dict:
    """Törli és újra betölti a demo adatokat. Visszaadja az összesítőt."""
    await _clear_demo_data(tenant_id)
    await _insert_demo_data(tenant_id)
    log.info(f"Demo data reset for tenant_id={tenant_id}")
    return {
        "emails":   len(_EMAILS),
        "documents": len(_DOCUMENTS),
        "calendar_events": len(_CALENDAR_EVENTS),
    }


async def seed():
    """CLI seed: demo tenant + user + adatok létrehozása."""
    from db.database import init_pool, close_pool
    import db.auth_queries as aq

    await init_pool()
    try:
        # Tenant
        tenant = await aq.get_tenant_by_slug(DEMO_TENANT_SLUG)
        if not tenant:
            tenant = await aq.create_tenant("Demo Kft.", DEMO_TENANT_SLUG, "pro")
            print(f"[+] Tenant létrehozva: {tenant['id']}")
        else:
            print(f"[=] Tenant létezik: {tenant['id']}")

        tenant_id = str(tenant["id"])

        # Admin user
        admin = await aq.get_user_by_email("admin@demo.hu", tenant_id)
        if not admin:
            admin = await aq.create_user(tenant_id, "admin@demo.hu", "Admin1234!", "Demo Admin", "admin")
            print(f"[+] Admin user: {admin['email']}")
        else:
            print(f"[=] Admin user létezik: {admin['email']}")

        # Demo user
        demo_user = await aq.get_user_by_email(DEMO_USER_EMAIL, tenant_id)
        if not demo_user:
            demo_user = await aq.create_user(tenant_id, DEMO_USER_EMAIL, DEMO_USER_PASS, "Demo Felhasználó", "agent")
            print(f"[+] Demo user: {demo_user['email']}")
        else:
            print(f"[=] Demo user létezik: {demo_user['email']}")

        # Onboarding: demo tenant-nál kész
        try:
            existing_ob = await db.fetchrow(
                "SELECT id FROM onboarding_state WHERE tenant_id=$1", tenant_id
            )
            if not existing_ob:
                await db.execute(
                    """INSERT INTO onboarding_state
                       (tenant_id, current_step, completed_steps, metadata, completed_at)
                       VALUES ($1, 5, ARRAY[1,2,3,4,5], $2, NOW())""",
                    tenant_id,
                    json.dumps({"step_1": {"company_name": "Demo Kft.", "industry": "tech"}}),
                )
                print("[+] Onboarding state: kész")
        except Exception as e:
            print(f"[!] Onboarding state hiba (nem kritikus): {e}")

        # Demo adatok reset
        stats = await reset_demo_data(tenant_id)
        print(f"[+] Demo adatok betöltve: {stats}")

    finally:
        await close_pool()
