-- Migration v3.17 — Hungarian accounting firm (könyvelőiroda) template pack
-- Inserts 9 professional Hungarian templates into agent_templates
-- Safe to run multiple times (ON CONFLICT DO NOTHING)

INSERT INTO agent_templates (id, name, category, description, config, is_default)
VALUES

-- ═══════════════════════════════════════════════════════════════
-- Category: Általános válaszok
-- ═══════════════════════════════════════════════════════════════

(
  uuid_generate_v4(),
  'Dokumentum beérkezett',
  'accounting',
  'Visszaigazolás, hogy megkaptuk az ügyfél dokumentumát. Rövid, barátságos, professzionális.',
  '{
    "reply_style": "formal",
    "language": "hu",
    "confidence_threshold": 0.72,
    "tags": ["általános", "visszaigazolás", "dokumentum"],
    "body": "Tisztelt Ügyfelünk!\n\nKöszönjük, hogy eljuttatta hozzánk a dokumentumot. Rögzítettük a beérkező iratot, és munkatársunk hamarosan feldolgozza.\n\nAmint az ügyintézés megtörtént, értesítjük Önt az eredményről. Kérdés esetén állunk rendelkezésére.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"
  }',
  false
),

(
  uuid_generate_v4(),
  'Hiányos dokumentáció',
  'accounting',
  'Értesítés, hogy hiányoznak dokumentumok. Tartalmaz egy listát a szükséges iratokról.',
  '{
    "reply_style": "formal",
    "language": "hu",
    "confidence_threshold": 0.72,
    "tags": ["általános", "hiányos", "dokumentum"],
    "body": "Tisztelt Ügyfelünk!\n\nKöszönjük megkeresését. Megvizsgálva az Ön által beküldött anyagokat, sajnálattal tájékoztatjuk, hogy az ügyintézés megkezdéséhez az alábbi dokumentumok még szükségesek:\n\n• [ --- kérem töltse ki a hiányzó dokumentumok listáját --- ]\n\nKérjük, az említett iratokat mielőbb juttassa el irodánkba, hogy folytatni tudjuk az ügyintézést. A határidőre való tekintettel a minél előbbi cselekvést javasoljuk.\n\nKérdés esetén készséggel állunk rendelkezésére.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"
  }',
  false
),

(
  uuid_generate_v4(),
  'Határidő emlékeztető',
  'accounting',
  'Közeledő adóbevallási határidőről (ÁFA, SZJA, iparűzési adó) szóló emlékeztető.',
  '{
    "reply_style": "formal",
    "language": "hu",
    "confidence_threshold": 0.72,
    "tags": ["általános", "határidő", "adó", "emlékeztető"],
    "body": "Tisztelt Ügyfelünk!\n\nEzúton szeretnénk felhívni figyelmét, hogy közeledik az {adónem} bevallásának benyújtási határideje: {határidő}.\n\nKérjük, hogy a szükséges bizonylatokat és dokumentumokat legkésőbb {dokumentum_határidő}-ig juttassa el irodánkba, hogy elegendő idő álljon rendelkezésünkre a bevallás elkészítéséhez és ellenőrzéséhez.\n\nAz időben benyújtott dokumentáció segít elkerülni az esetleges késedelmi bírságokat.\n\nKérdés esetén állunk rendelkezésére.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"
  }',
  false
),

-- ═══════════════════════════════════════════════════════════════
-- Category: Számla és pénzügy
-- ═══════════════════════════════════════════════════════════════

(
  uuid_generate_v4(),
  'Számla beérkezett',
  'accounting',
  'Visszaigazolás számla beérkezéséről, tájékoztatás a következő lépésekről.',
  '{
    "reply_style": "formal",
    "language": "hu",
    "confidence_threshold": 0.72,
    "tags": ["számla", "pénzügy", "visszaigazolás"],
    "body": "Tisztelt Ügyfelünk!\n\nKöszönjük, hogy megküldte a számlát. Irodánk rögzítette a beérkező dokumentumot, és az alábbi lépéseket tesszük:\n\n1. Ellenőrizzük a számla adatainak helyességét (összeg, dátum, befizető adatai)\n2. Rögzítjük a főkönyvi rendszerbe\n3. Szükség esetén jelezzük, ha korrekció szükséges\n\nA feldolgozás várható ideje: {feldolgozasi_ido} munkanap. Amennyiben bármilyen kérdés vagy eltérés merül fel, haladéktalanul értesítjük.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"
  }',
  false
),

(
  uuid_generate_v4(),
  'Számlakorrekció szükséges',
  'accounting',
  'Értesítés arról, hogy a beküldött számlán probléma található és korrekció szükséges.',
  '{
    "reply_style": "formal",
    "language": "hu",
    "confidence_threshold": 0.72,
    "tags": ["számla", "korrekció", "hiba"],
    "body": "Tisztelt Ügyfelünk!\n\nMegvizsgálva az Ön által megküldött számlát, az alábbi eltérést/hiányosságot azonosítottuk:\n\n{problema_leirasa}\n\nKérjük, intézkedjen a szükséges korrekció elvégzéséről, illetve küldje meg a helyesbített számlát vagy a szükséges igazolást.\n\nFelhívjuk figyelmét, hogy a hibás számla nem könyvelhető el, és a kötelező bevallásban sem szerepeltethetjük, amíg a javítás meg nem érkezik.\n\nKérdés esetén kollégáink készséggel segítenek.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"
  }',
  false
),

(
  uuid_generate_v4(),
  'Díjbekérő válasz',
  'accounting',
  'Standard válasz díjbekérőre vonatkozó kérdésekre, fizetési tudnivalókkal.',
  '{
    "reply_style": "formal",
    "language": "hu",
    "confidence_threshold": 0.72,
    "tags": ["számla", "díjbekérő", "fizetés"],
    "body": "Tisztelt Ügyfelünk!\n\nKöszönjük megkeresését a díjbekérővel kapcsolatban.\n\nTájékoztatjuk, hogy irodánk az alábbi fizetési lehetőségeket biztosítja:\n• Banki átutalás: {bankszamla_szam} (utalási közlemény: {referencia_szam})\n• Fizetési határidő: a díjbekérő keltétől számított {fizetesi_hatarido} nap\n\nAmennyiben a fizetést teljesítette, kérjük, a terhelési értesítőt vagy az átutalás visszaigazolását juttassa el hozzánk a gyorsabb feldolgozás érdekében.\n\nKérdés esetén állunk rendelkezésére.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"
  }',
  false
),

-- ═══════════════════════════════════════════════════════════════
-- Category: NAV és adóhatóság
-- ═══════════════════════════════════════════════════════════════

(
  uuid_generate_v4(),
  'NAV levél átadva',
  'accounting',
  'Jelzés az ügyfélnek, hogy NAV levelet kaptunk, amelyet a könyvelő vizsgál.',
  '{
    "reply_style": "formal",
    "language": "hu",
    "confidence_threshold": 0.72,
    "tags": ["NAV", "adóhatóság", "értesítés"],
    "body": "Tisztelt Ügyfelünk!\n\nTájékoztatjuk, hogy irodánkhoz NAV megkeresés érkezett az Ön vállalkozásával kapcsolatban ({nav_ugy_szama}).\n\nA levelet átadtuk illetékes könyvelőjének, aki megvizsgálja és az ügy jellegétől függően:\n• Tájékoztatást ad a szükséges teendőkről\n• Elkészíti a szükséges választ vagy igazolásokat\n• Szükség esetén egyeztetést kezdeményez\n\nFontos: NAV-os levelekre általában meghatározott határidőn belül kell reagálni. Könyvelőnk hamarosan felveszi Önnel a kapcsolatot.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"
  }',
  false
),

(
  uuid_generate_v4(),
  'Adóbevallás státusz',
  'accounting',
  'Általános státuszválasz az adóbevallás elkészítéséről és benyújtásáról.',
  '{
    "reply_style": "formal",
    "language": "hu",
    "confidence_threshold": 0.72,
    "tags": ["adóbevallás", "státusz", "NAV"],
    "body": "Tisztelt Ügyfelünk!\n\nKöszönjük érdeklődését az adóbevallással kapcsolatban.\n\nTájékoztatjuk, hogy az Ön {adoev}. évi {adonem} bevallásának státusza: {status}.\n\n{reszletek}\n\nAmennyiben a bevallás benyújtásra került, a NAV visszaigazolást az Online Számla rendszerén, illetve az Ügyfélkapun keresztül ellenőrizni tudja. A befizetendő/visszaigényelhető összeget postai úton vagy Ügyfélkapun keresztül értesítjük.\n\nKérdés esetén kollégáink rendelkezésére állnak.\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"
  }',
  false
),

(
  uuid_generate_v4(),
  'Adatigénylés visszaigazolás',
  'accounting',
  'Standard visszaigazolás adatigénylési kérésre, tájékoztatás az átfutási időről.',
  '{
    "reply_style": "formal",
    "language": "hu",
    "confidence_threshold": 0.72,
    "tags": ["adatigénylés", "visszaigazolás", "GDPR"],
    "body": "Tisztelt Ügyfelünk!\n\nKöszönjük adatigénylési kérelmét, amelyet {datum}-án vettünk nyilvántartásba.\n\nTájékoztatjuk, hogy az Ön kérelmét az alábbi ütemezéssel teljesítjük:\n• Kérelem feldolgozási ideje: legfeljebb 30 nap (GDPR előírások szerint)\n• Az adatokat {adatszolgaltatas_modja} útján bocsátjuk rendelkezésére\n• A kért adatok rendelkezésre állásáról értesítjük\n\nFelhívjuk figyelmét, hogy egyes adatok kiadásához személyazonosságának igazolása szükséges lehet. Amennyiben ez szükséges, külön értesítjük.\n\nKérdés esetén adatvédelmi felelősünk az alábbi elérhetőségen érhető el: {adatvedelem_email}\n\nÜdvözlettel,\n{cegnev} könyvelőiroda"
  }',
  false
)

ON CONFLICT DO NOTHING;
