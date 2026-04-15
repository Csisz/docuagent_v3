# DocuAgent v3 — 1. Fázis Tesztelési Jegyzőkönyv

**Verzió:** v3.1  
**Dátum:** 2026-04-09  
**Tesztelő:** _______________  
**Környezet:** localhost (Docker Compose)

---

## Előkészítés

```powershell
# 1. Userök létrehozása
docker cp create_users.py docuagent_v3-backend-1:/app/create_users.py
docker exec docuagent_v3-backend-1 python create_users.py

# 2. Demo adatok betöltése
docker cp db\seed_demo.py docuagent_v3-backend-1:/app/seed_demo.py
docker cp backend\db\demo_data.py docuagent_v3-backend-1:/app/db/demo_data.py
docker exec docuagent_v3-backend-1 python seed_demo.py

# 3. Backend állapot ellenőrzés
docker logs docuagent_v3-backend-1 --tail 10
```

---

## TC-01 — Sandbox Demo Mode

**Felhasználó:** demo@agentify.hu / demo1234  
**URL:** http://localhost:3000

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 1.1 | Nyisd meg a login oldalt | "Demo megtekintése" narancssárga gomb látható a bejelentkezés alatt | x PASS ☐ FAIL | |
| 1.2 | Kattints "Demo megtekintése" | Automatikus bejelentkezés, dashboard betölt | x PASS ☐ FAIL | |
| 1.3 | Nézd meg a felső sávot | Sárga demo banner: "Demo mód — az adatok 24 óránként visszaállnak..." | x PASS ☐ FAIL | |
| 1.4 | Nézd meg a topbar gombjait | "Demo reset" piros gomb látható | x PASS ☐ FAIL | |
| 1.5 | Dashboard KPI kártyák | 14 email, 5 figyelmet igényel, 47% konfidencia látható | x PASS ☐ FAIL | |
| 1.6 | Jóváhagyás oldalon jóváhagyj egy emailt | "Valódi email küldés letiltva" üzenet jelenik meg (mock send) | ☐ PASS x FAIL | |
| 1.7 | Kattints "Demo reset" gombra | Megerősítő dialog, majd adatok visszaállnak | ☐ PASS x FAIL | |
| 1.8 | Kijelentkezés után belépj demo@agentify.hu / demo1234-gyel manuálisan | Sikeres bejelentkezés, demo banner látható | x PASS ☐ FAIL | |

---

## TC-02 — Template Library

**Felhasználó:** demo@agentify.hu / demo1234  
**URL:** http://localhost:3000/templates

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 2.1 | Nyisd meg a /templates oldalt | 4 sablon kártya látható grid elrendezésben | ☐ PASS ☐ FAIL | |
| 2.2 | Kártyák tartalma | Minden kártya: ikon, név, kategória badge, leírás, "Mit csinál" lista, "Alkalmazás" gomb | x PASS ☐ FAIL | |
| 2.3 | Magyar karakterek | Ékezetes betűk helyesen jelennek meg (Könyvelői, Ügyvédi, stb.) | x PASS ☐ FAIL | |
| 2.4 | Kártya hover | Hover-re a kártya kerete a sablon színével villan | x PASS ☐ FAIL | |
| 2.5 | Kattints "Alkalmazás →" (Könyvelői) | Konfirmációs modal jelenik meg a sablon részleteivel | x PASS ☐ FAIL | |
| 2.6 | Modal tartalma | Sablon neve, "Mit konfigurál" lista, Válaszstílus, Min. confidence, Nyelv | x PASS ☐ FAIL | |
| 2.7 | Kattints "Mégse" | Modal bezárul, semmi nem változik | x PASS ☐ FAIL | |
| 2.8 | Kattints "Alkalmazás →" újra, majd "✓ Sablon alkalmazása" | Sikeres modal jelenik meg: "Sablon alkalmazva!" | x PASS ☐ FAIL | |
| 2.9 | Sikeres modal után "Rendben" | Modal bezárul, a kártya "✓ Aktív" badge-t és más stílust kap | x PASS ☐ FAIL | |
| 2.10 | Backend ellenőrzés | `docker logs docuagent_v3-backend-1 --tail 5` → "Template applied: ..." log látható | x PASS ☐ FAIL | |
| 2.11 | DB ellenőrzés | `SELECT key, value FROM config WHERE key LIKE 'agent.%' LIMIT 5;` → értékek láthatók | x PASS ☐ FAIL | |
| 2.12 | Másik sablon alkalmazása | Az előző kártya elveszti "Aktív" státuszát, az új kapja meg | x PASS ☐ FAIL | |

---

## TC-03 — Approval Inbox

**Felhasználó:** demo@agentify.hu / demo1234  
**URL:** http://localhost:3000/approval

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 3.1 | Sidebar | "Jóváhagyásra vár" menüpont piros badge-el (5) | x PASS ☐ FAIL | |
| 3.2 | Nyisd meg /approval | "5 email vár emberi döntésre" felirat, lista bal oldalon | ☐ PASS x FAIL | |
| 3.3 | Email lista elemei | Subject, feladó, kategória badge, confidence %, időbélyeg | ☐ PASS x FAIL | |
| 3.4 | Confidence színkódolás | <60% piros, 60-80% sárga, >80% zöld | ☐ PASS x FAIL | |
| 3.5 | Sürgős emailek | Villám ikon jelenik meg a sürgős emaileknél | ☐ PASS x FAIL | |
| 3.6 | Email kiválasztása | Jobb panel megjelenik: email szöveg, AI javaslat, RAG forrás, 3 gomb | ☐ PASS x FAIL | |
| 3.7 | "Jóváhagyás + Küldés" gomb | Demo módban: "Valódi email küldés letiltva" üzenet, email eltűnik a listából | ☐ PASS x FAIL | |
| 3.8 | "Elutasítás" gomb | Email eltűnik a listából, CLOSED státuszra áll | ☐ PASS x FAIL | |
| 3.9 | "Szerkesztés" gomb | Reply szövegmező szerkeszthetővé válik | ☐ PASS x FAIL | |
| 3.10 | Szerkesztés + Küldés | Módosított szöveggel küld (demo módban mock), email eltűnik | ☐ PASS x FAIL | |
| 3.11 | Lista badge frissül | Sidebar badge száma csökken minden feldolgozott emailnél | ☐ PASS x FAIL | |

---

## TC-04 — Onboarding Wizard (Éles teszt tenant)

**Felhasználó:** admin@agentify-test.hu / TestAdmin2024!  
**URL:** http://localhost:3000

> **Előfeltétel:** Az éles teszt user onboarding state-je NEM completed.
> Ellenőrzés: `SELECT completed_at FROM onboarding_state WHERE tenant_id=(SELECT id FROM tenants WHERE slug='agentify-test');`
> → NULL kell legyen

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 4.1 | Bejelentkezés admin@agentify-test.hu | Automatikus redirect /onboarding-ra | ☐ PASS ☐ FAIL | |
| 4.2 | Onboarding oldal | Progress bar tetején 5 lépéssel, "1/5" felirat | ☐ PASS ☐ FAIL | |
| 4.3 | Sidebar | NEM látható (onboarding alatt el van rejtve) | ☐ PASS ☐ FAIL | |
| 4.4 | Demo banner | NEM jelenik meg (nem demo tenant) | ☐ PASS ☐ FAIL | |
| **1. lépés — Cégadatok** |  |  |  |  |
| 4.5 | Sablon választó látható | 4 sablon kártya megjelenik az 1. lépésben | ☐ PASS ☐ FAIL | |
| 4.6 | Cégnév kitöltése | Mező elfogadja a szöveget | ☐ PASS ☐ FAIL | |
| 4.7 | Sablon kiválasztása | Kártya vizuálisan kiemelkedik | ☐ PASS ☐ FAIL | |
| 4.8 | "Következő" gomb | Továbblép 2. lépésre, progress bar frissül | ☐ PASS ☐ FAIL | |
| **2. lépés — Gmail** |  |  |  |  |
| 4.9 | Gmail lépés tartalma | n8n link, lépések leírása, Gmail cím mező | ☐ PASS ☐ FAIL | |
| 4.10 | "Átugrás" lehetőség | Gomb látható, kattintásra 3. lépésre ugrik | ☐ PASS ☐ FAIL | |
| 4.11 | Visszalépés | "Vissza" gomb az 1. lépésre visz vissza | ☐ PASS ☐ FAIL | |
| **3. lépés — Dokumentumok** |  |  |  |  |
| 4.12 | Dokumentum feltöltés | Fájl feltöltő látható, PDF/DOCX elfogad | ☐ PASS ☐ FAIL | |
| 4.13 | Feltöltés után | Fájlnév megjelenik a listában | ☐ PASS ☐ FAIL | |
| 4.14 | "Átugrás" lehetőség | Kattintásra 4. lépésre ugrik | ☐ PASS ☐ FAIL | |
| **4. lépés — AI Teszt** |  |  |  |  |
| 4.15 | AI teszt lépés | Teszt email szövegmező látható | ☐ PASS ☐ FAIL | |
| 4.16 | "Átugrás" lehetőség | 5. lépésre ugrik | ☐ PASS ☐ FAIL | |
| **5. lépés — Kész** |  |  |  |  |
| 4.17 | Összefoglaló képernyő | "Minden készen áll!" felirat, beállítási összefoglaló | ☐ PASS ☐ FAIL | |
| 4.18 | "Dashboard megnyitása" gomb | Dashboardra navigál, sidebar megjelenik | ☐ PASS ☐ FAIL | |
| 4.19 | Újrabelépés után | /onboarding-ra NEM dob vissza (completed_at be van állítva) | ☐ PASS ☐ FAIL | |
| 4.20 | Demo banner | Nem jelenik meg az éles tenant userénél | ☐ PASS ☐ FAIL | |

---

## TC-05 — Éles tenant alapfunkciók

**Felhasználó:** admin@agentify-test.hu / TestAdmin2024!

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 5.1 | Dashboard betölt | Üres dashboard (0 email, nincs adat) | ☐ PASS ☐ FAIL | |
| 5.2 | /approval oldal | "Nincs várakozó email" üzenet | ☐ PASS ☐ FAIL | |
| 5.3 | /templates oldal | 4 sablon látható, alkalmazható | ☐ PASS ☐ FAIL | |
| 5.4 | Sablon alkalmazása | Sikeresen alkalmaz, "✓ Aktív" badge megjelenik | ☐ PASS ☐ FAIL | |
| 5.5 | /docs oldal | Üres dokumentum lista | ☐ PASS ☐ FAIL | |
| 5.6 | Agent user belépés (agent@agentify-test.hu) | Bejelentkezés sikeres, onboarding NEM indul (admin már elvégezte) | ☐ PASS ☐ FAIL | |

---

## TC-06 — Tenant izoláció

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 6.1 | Demo userrel bejelentkezve, /approval | 5 demo email látható | ☐ PASS ☐ FAIL | |
| 6.2 | Éles userrel bejelentkezve, /approval | 0 email (demo adatok NEM látszanak) | ☐ PASS ☐ FAIL | |
| 6.3 | Demo userrel /docs | Demo dokumentumok látszanak | ☐ PASS ☐ FAIL | |
| 6.4 | Éles userrel /docs | Üres lista (demo dokumentumok NEM látszanak) | ☐ PASS ☐ FAIL | |

---

## Ismert korlátok (Not a bug)

| # | Viselkedés | Magyarázat |
|---|-----------|------------|
| K1 | Demo mód onboarding átugrás | A demo seed `completed_at`-et állít be — szándékos, sales demo-hoz nem kell végigmenni |
| K2 | Approval "Jóváhagyás + Küldés" demo módban nem küld valódi emailt | `isDemo` flag alapján mock send — szándékos |
| K3 | Template alkalmazás nem módosítja a classify viselkedést azonnal | A config tábla csak tárolja, a classify router még nem olvassa — 2. fázis fejlesztés |
| K4 | Onboarding step paraméter URL-ből (`?step=3`) csak akkor működik, ha az onboarding még nem complete | ProtectedRoute átirányítja ha complete |

---

## Végeredmény

| Feature | PASS | FAIL | Megjegyzés |
|---------|------|------|------------|
| TC-01 Sandbox Demo Mode | /8 | /8 | |
| TC-02 Template Library | /12 | /12 | |
| TC-03 Approval Inbox | /11 | /11 | |
| TC-04 Onboarding Wizard | /20 | /20 | |
| TC-05 Éles tenant | /6 | /6 | |
| TC-06 Tenant izoláció | /4 | /4 | |
| **Összesen** | **/61** | **/61** | |

**Tesztelő aláírása:** _______________  
**Dátum:** _______________  
**Következő fázis indítható:** ☐ Igen ☐ Nem — Blokkoló hibák: _______________
