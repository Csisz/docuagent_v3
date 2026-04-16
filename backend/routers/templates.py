"""
Template Library — iparág-specifikus AI ügynök sablonok.
"""
import json
import logging
from fastapi import APIRouter, HTTPException, Depends

import db.database as db
import db.audit_queries as alog
from core.security import get_current_user

router        = APIRouter(prefix="/api/templates", tags=["Templates"])
config_router = APIRouter(prefix="/api/config",    tags=["Config"])
log = logging.getLogger("docuagent")


def _serialize(row) -> dict:
    cfg = row["config"]
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except Exception:
            cfg = {}
    return {
        "id":          str(row["id"]),
        "name":        row["name"],
        "category":    row["category"],
        "description": row["description"] or "",
        "config":      cfg,
        "is_default":  row["is_default"],
        "created_at":  row["created_at"].isoformat() if row["created_at"] else "",
    }


@router.get("")
async def list_templates():
    """Összes elérhető sablon visszaadása."""
    rows = await db.fetch(
        "SELECT * FROM agent_templates ORDER BY created_at ASC"
    )
    return {"templates": [_serialize(r) for r in (rows or [])]}


@router.post("/{template_id}/apply")
async def apply_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Sablon alkalmazása a tenant konfigurációjára.
    Elmenti az agent.template_id, agent.reply_style, agent.confidence_threshold
    értékeket a config táblába a tenant_id-vel.
    """
    row = await db.fetchrow(
        "SELECT * FROM agent_templates WHERE id=$1", template_id
    )
    if not row:
        raise HTTPException(404, "Sablon nem található")

    tenant_id = current_user.get("tenant_id")
    cfg = row["config"]
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except Exception:
            cfg = {}

    # Config értékek mentése a config táblába (tenant scope)
    entries = {
        "agent.template_id":           template_id,
        "agent.template_name":         row["name"],
        "agent.template_category":     row["category"],
        "agent.reply_style":           cfg.get("reply_style", "formal"),
        "agent.confidence_threshold":  str(cfg.get("confidence_threshold", 0.75)),
        "agent.language":              cfg.get("language", "hu"),
    }

    for key, value in entries.items():
        await db.execute(
            """INSERT INTO config (tenant_id, key, value)
               VALUES ($1, $2, $3)
               ON CONFLICT (tenant_id, key) DO UPDATE SET value=$3, updated_at=NOW()""",
            tenant_id, key, value
        )

    log.info(f"Template applied: {row['name']} ({template_id}) by tenant={tenant_id}")
    await alog.insert_audit_log(
        tenant_id=tenant_id, user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="apply_template", entity_type="template",
        entity_id=template_id, details={"template_name": row["name"], "category": row["category"]},
    )
    return {
        "status":      "ok",
        "template_id": template_id,
        "name":        row["name"],
        "category":    row["category"],
        "applied":     list(entries.keys()),
    }


@router.post("/seed-accounting")
async def seed_accounting_templates(current_user: dict = Depends(get_current_user)):
    """
    Seeds the 9 Hungarian accounting firm (könyvelőiroda) templates.
    Idempotent — skips existing ones by name + category.
    """
    import uuid as _uuid

    templates = [
        ("Dokumentum beérkezett", "accounting",
         "Visszaigazolás, hogy megkaptuk az ügyfél dokumentumát.",
         {"reply_style":"formal","language":"hu","confidence_threshold":0.72,
          "tags":["általános","visszaigazolás","dokumentum"],
          "body":"Tisztelt Ügyfelünk!\n\nKöszönjük, hogy eljuttatta hozzánk a dokumentumot. Rögzítettük a beérkező iratot, és munkatársunk hamarosan feldolgozza.\n\nAmint az ügyintézés megtörtént, értesítjük Önt az eredményről. Kérdés esetén állunk rendelkezésére.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"}),
        ("Hiányos dokumentáció", "accounting",
         "Értesítés, hogy hiányoznak dokumentumok.",
         {"reply_style":"formal","language":"hu","confidence_threshold":0.72,
          "tags":["általános","hiányos","dokumentum"],
          "body":"Tisztelt Ügyfelünk!\n\nKöszönjük megkeresését. Megvizsgálva az Ön által beküldött anyagokat, sajnálattal tájékoztatjuk, hogy az ügyintézés megkezdéséhez az alábbi dokumentumok még szükségesek:\n\n• [ --- kérem töltse ki a hiányzó dokumentumok listáját --- ]\n\nKérjük, az említett iratokat mielőbb juttassa el irodánkba.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"}),
        ("Határidő emlékeztető", "accounting",
         "Közeledő adóbevallási határidőről szóló emlékeztető.",
         {"reply_style":"formal","language":"hu","confidence_threshold":0.72,
          "tags":["általános","határidő","adó","emlékeztető"],
          "body":"Tisztelt Ügyfelünk!\n\nEzúton szeretnénk felhívni figyelmét, hogy közeledik az {adónem} bevallásának benyújtási határideje: {határidő}.\n\nKérjük, hogy a szükséges bizonylatokat legkésőbb {dokumentum_határidő}-ig juttassa el irodánkba.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"}),
        ("Számla beérkezett", "accounting",
         "Visszaigazolás számla beérkezéséről, következő lépések.",
         {"reply_style":"formal","language":"hu","confidence_threshold":0.72,
          "tags":["számla","pénzügy","visszaigazolás"],
          "body":"Tisztelt Ügyfelünk!\n\nKöszönjük, hogy megküldte a számlát. Irodánk rögzítette a beérkező dokumentumot és az alábbi lépéseket tesszük:\n\n1. Ellenőrizzük a számla adatainak helyességét\n2. Rögzítjük a főkönyvi rendszerbe\n3. Szükség esetén jelezzük, ha korrekció szükséges\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"}),
        ("Számlakorrekció szükséges", "accounting",
         "Értesítés problémáról a beküldött számlán.",
         {"reply_style":"formal","language":"hu","confidence_threshold":0.72,
          "tags":["számla","korrekció","hiba"],
          "body":"Tisztelt Ügyfelünk!\n\nMegvizsgálva az Ön által megküldött számlát, az alábbi eltérést azonosítottuk:\n\n{problema_leirasa}\n\nKérjük, intézkedjen a szükséges korrekció elvégzéséről.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"}),
        ("Díjbekérő válasz", "accounting",
         "Standard válasz díjbekérőre vonatkozó kérdésekre.",
         {"reply_style":"formal","language":"hu","confidence_threshold":0.72,
          "tags":["számla","díjbekérő","fizetés"],
          "body":"Tisztelt Ügyfelünk!\n\nKöszönjük megkeresését a díjbekérővel kapcsolatban.\n\nFizetési lehetőségek:\n• Banki átutalás: {bankszamla_szam}\n• Fizetési határidő: {fizetesi_hatarido} nap\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"}),
        ("NAV levél átadva", "accounting",
         "Jelzés hogy NAV levelet kaptunk, könyvelő vizsgálja.",
         {"reply_style":"formal","language":"hu","confidence_threshold":0.72,
          "tags":["NAV","adóhatóság","értesítés"],
          "body":"Tisztelt Ügyfelünk!\n\nTájékoztatjuk, hogy irodánkhoz NAV megkeresés érkezett az Ön vállalkozásával kapcsolatban.\n\nA levelet átadtuk illetékes könyvelőjének, aki megvizsgálja és hamarosan felveszi Önnel a kapcsolatot.\n\nFontos: NAV-os levelekre határidőn belül kell reagálni.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"}),
        ("Adóbevallás státusz", "accounting",
         "Általános státuszválasz az adóbevallás elkészítéséről.",
         {"reply_style":"formal","language":"hu","confidence_threshold":0.72,
          "tags":["adóbevallás","státusz","NAV"],
          "body":"Tisztelt Ügyfelünk!\n\nKöszönjük érdeklődését az adóbevallással kapcsolatban.\n\nTájékoztatjuk, hogy az Ön {adoev}. évi {adonem} bevallásának státusza: {status}.\n\nKérdés esetén kollégáink rendelkezésére állnak.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"}),
        ("Adatigénylés visszaigazolás", "accounting",
         "Standard visszaigazolás adatigénylési kérésre.",
         {"reply_style":"formal","language":"hu","confidence_threshold":0.72,
          "tags":["adatigénylés","visszaigazolás","GDPR"],
          "body":"Tisztelt Ügyfelünk!\n\nKöszönjük adatigénylési kérelmét, amelyet {datum}-án vettünk nyilvántartásba.\n\nFeldolgozási idő: legfeljebb 30 nap (GDPR előírások szerint).\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"}),
    ]

    created = 0
    skipped = 0
    tenant_id = current_user.get("tenant_id")

    for name, category, description, config in templates:
        existing = await db.fetchrow(
            "SELECT id FROM agent_templates WHERE name=$1 AND category=$2", name, category
        )
        if existing:
            skipped += 1
            continue
        await db.execute(
            """INSERT INTO agent_templates (id, name, category, description, config, is_default)
               VALUES ($1, $2, $3, $4, $5, false)""",
            _uuid.uuid4(), name, category, description, json.dumps(config)
        )
        created += 1

    await alog.insert_audit_log(
        tenant_id=tenant_id, user_id=current_user.get("user_id"),
        user_email=current_user.get("email"), action="seed_templates", entity_type="template",
        entity_id=None, details={"created": created, "skipped": skipped, "pack": "accounting"},
    )
    log.info(f"Accounting templates seeded: created={created} skipped={skipped}")
    return {"status": "ok", "created": created, "skipped": skipped, "pack": "accounting"}


@config_router.get("/agent")
async def get_agent_config(current_user: dict = Depends(get_current_user)):
    """
    Visszaadja a tenant agent konfigurációját a config táblából.
    Tartalmazza: agent.template_id, agent.template_name, stb.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        return {}

    rows = await db.fetch(
        "SELECT key, value FROM config WHERE tenant_id=$1 AND key LIKE 'agent.%'",
        tenant_id
    )
    return {row["key"].removeprefix("agent."): row["value"] for row in (rows or [])}
