# DocuAgent v3 — 2. Fázis Tesztelési Jegyzőkönyv

**Verzió:** v3.2  
**Dátum:** _______________  
**Tesztelő:** _______________  
**Környezet:** localhost (Docker Compose)

---

## Előkészítés

```powershell
# Migrációk
Get-Content db\migrate_v3_10_agent_configs.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent
Get-Content db\migrate_v3_11_audit_log.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent

# Rebuild
docker compose up --build -d

# Demo seed (RAG log fix)
docker cp db\seed_demo.py docuagent_v3-backend-1:/app/seed_demo.py
docker cp backend\db\demo_data.py docuagent_v3-backend-1:/app/db/demo_data.py
docker exec docuagent_v3-backend-1 python seed_demo.py

# Táblák ellenőrzése
docker exec docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "\dt" | Select-String "agent_configs|audit_log"
```

---

## TC-07 — Agent Builder Wizard

**Felhasználó:** demo@agentify.hu / demo1234  
**URL:** http://localhost:3000/agent-builder

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 7.1 | Sidebar | "Agent Builder" menüpont látható az Analitika szekcióban | ☐ PASS ☐ FAIL | |
| 7.2 | Nyisd meg /agent-builder | 5 lépéses wizard, progress bar tetején "1/5" | ☐ PASS ☐ FAIL | |
| **1. lépés — Trigger** | | | | |
| 7.3 | 4 trigger kártya látható | Email, Dokumentum, Chat, Naptár kártyák | ☐ PASS ☐ FAIL | |
| 7.4 | Trigger kiválasztása | Kártya vizuálisan kiemelkedik, "Következő" aktívvá válik | ☐ PASS ☐ FAIL | |
| 7.5 | Következő gomb | 2. lépésre lép, progress bar frissül | ☐ PASS ☐ FAIL | |
| **2. lépés — Szűrők** | | | | |
| 7.6 | Szűrő mezők láthatók | Domain, kulcsszó, kategória, urgency slider | ☐ PASS ☐ FAIL | |
| 7.7 | Chip input kulcsszóhoz | Enter/vessző után chip jelenik meg, törölhető | ☐ PASS ☐ FAIL | |
| 7.8 | Urgency slider | 0-100 között húzható, érték megjelenik | ☐ PASS ☐ FAIL | |
| 7.9 | Visszalépés | "Vissza" gomb az 1. lépésre visz, adatok megmaradnak | ☐ PASS ☐ FAIL | |
| **3. lépés — Akció** | | | | |
| 7.10 | 4 akció kártya | AI válasz, Összefoglalás, CRM task, Slack értesítés | ☐ PASS ☐ FAIL | |
| 7.11 | Placeholder akciók | CRM/Slack kártyák "Hamarosan" vagy disabled jelzéssel | ☐ PASS ☐ FAIL | |
| **4. lépés — Jóváhagyás** | | | | |
| 7.12 | 3 radio opció | Mindig auto / Confidence alapján / Mindig emberi | ☐ PASS ☐ FAIL | |
| 7.13 | Confidence slider | Csak "Confidence alapján" esetén aktív | ☐ PASS ☐ FAIL | |
| **5. lépés — Stílus és név** | | | | |
| 7.14 | Agent neve mező | Text input, kötelező mező | ☐ PASS ☐ FAIL | |
| 7.15 | Válasz stílus | Formális/Barátságos/Semleges választó | ☐ PASS ☐ FAIL | |
| 7.16 | Mentés gomb | Agent mentődik, redirect /agents listára | ☐ PASS ☐ FAIL | |
| **Agent lista** | | | | |
| 7.17 | /agents oldal | Létrehozott agent megjelenik a listában | ☐ PASS ☐ FAIL | |
| 7.18 | Agent aktiválás/deaktiválás | Toggle gomb működik, státusz frissül | ☐ PASS ☐ FAIL | |
| 7.19 | Agent szerkesztés | Meglévő agent adataival töltődik fel a wizard | ☐ PASS ☐ FAIL | |
| 7.20 | Agent törlés | Megerősítés után törlődik a listából | ☐ PASS ☐ FAIL | |
| 7.21 | DB ellenőrzés | `SELECT name, trigger, is_active FROM agent_configs;` → agent látható | ☐ PASS ☐ FAIL | |

---

## TC-08 — Agent Performance Dashboard

**Felhasználó:** demo@agentify.hu / demo1234  
**URL:** http://localhost:3000/insights

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 8.1 | InsightsPage betölt | Meglévő AI elemzés látható + új "Agent Teljesítmény" szekció | ☐ PASS ☐ FAIL | |
| 8.2 | 4 metrika kártya | Automatizált válaszok, Időmegtakarítás, Arány, Confidence | ☐ PASS ☐ FAIL | |
| 8.3 | Automatizált válaszok száma | Demo adatokból: AI_ANSWERED emailek száma (4) | ☐ PASS ☐ FAIL | |
| 8.4 | Időmegtakarítás | automated_count × 3 perc = X óra formátumban | ☐ PASS ☐ FAIL | |
| 8.5 | Automatizálási arány | % értékkel és progress bar-ral | ☐ PASS ☐ FAIL | |
| 8.6 | Napi trend chart | Bar chart: automatizált vs manuális naponta | ☐ PASS ☐ FAIL | |
| 8.7 | Top kategóriák táblázat | Kategória, darab, avg confidence oszlopok | ☐ PASS ☐ FAIL | |
| 8.8 | Tenant izoláció | Éles userrel: 0 adat (agentify-test tenant üres) | ☐ PASS ☐ FAIL | |
| 8.9 | API ellenőrzés | `GET /api/agents/performance` → helyes JSON válasz | ☐ PASS ☐ FAIL | |

---

## TC-09 — Source-aware AI

**Felhasználó:** demo@agentify.hu / demo1234

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 9.1 | Demo seed újrafuttatva | RAG logok a NEEDS_ATTENTION emailekhez kötve | ☐ PASS ☐ FAIL | |
| 9.2 | DB ellenőrzés | `SELECT e.subject, rl.source_docs IS NOT NULL FROM emails e LEFT JOIN rag_logs rl ON rl.email_id=e.id WHERE e.status='NEEDS_ATTENTION';` → has_rag=true | ☐ PASS ☐ FAIL | |
| 9.3 | /approval → email kiválasztás | "TUDÁSBÁZIS FORRÁS" szekció megjelenik | ☐ PASS ☐ FAIL | |
| 9.4 | RAG forrás tartalma | Dokumentum neve, relevancia %, collection badge | ☐ PASS ☐ FAIL | |
| 9.5 | Több forrás | Ha 2 forrás van, mindkettő megjelenik | ☐ PASS ☐ FAIL | |
| 9.6 | Forrás nélküli email | "Nincs dokumentum forrás" szürke szöveg jelenik meg | ☐ PASS ☐ FAIL | |
| 9.7 | /emails → email részlet | "AI Forrásai" szekció megjelenik ha van RAG log | ☐ PASS ☐ FAIL | |

---

## TC-10 — Audit Trail UI

**Felhasználó:** demo@agentify.hu / demo1234  
**URL:** http://localhost:3000/audit

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 10.1 | Sidebar | "Audit Trail" menüpont látható az Analitika szekcióban | ☐ PASS ☐ FAIL | |
| 10.2 | /audit oldal betölt | Táblázat nézet fejlécekkel | ☐ PASS ☐ FAIL | |
| 10.3 | Approval művelet naplózva | Email jóváhagyás után az audit logban megjelenik | ☐ PASS ☐ FAIL | |
| 10.4 | Audit log mezők | Időbélyeg, user email, akció badge, entitás, részletek | ☐ PASS ☐ FAIL | |
| 10.5 | Akció badge színek | approve=zöld, reject=piros, upload=kék | ☐ PASS ☐ FAIL | |
| 10.6 | Időbélyeg formátum | Relatív idő: "2 perce", "1 órája" | ☐ PASS ☐ FAIL | |
| 10.7 | Részletek megtekintése | Kattintásra részletek megjelennek (collapsible) | ☐ PASS ☐ FAIL | |
| 10.8 | Szűrő — akció típus | Dropdown szűrőre csak az adott típus jelenik meg | ☐ PASS ☐ FAIL | |
| 10.9 | Export CSV | Gomb letölti az audit log-ot CSV formátumban | ☐ PASS ☐ FAIL | |
| 10.10 | Tenant izoláció | Csak a saját tenant audit logjai látszanak | ☐ PASS ☐ FAIL | |
| 10.11 | Dokumentum feltöltés naplózva | Onboarding/Docs oldalon feltöltés után audit logban megjelenik | ☐ PASS ☐ FAIL | |
| 10.12 | Sablon alkalmazás naplózva | Template alkalmazás után audit logban megjelenik | ☐ PASS ☐ FAIL | |
| 10.13 | DB ellenőrzés | `SELECT action, entity_type, user_email FROM audit_log LIMIT 5;` | ☐ PASS ☐ FAIL | |

---

## Ismert korlátok (Not a bug)

| # | Viselkedés | Magyarázat |
|---|-----------|------------|
| K1 | CRM task / Slack akció "Hamarosan" | 3. fázis fejlesztés — placeholder |
| K2 | Agent Builder nem módosítja az n8n workflow-t | Az agent config csak DB-ben tárolódik, n8n integráció 3. fázis |
| K3 | Performance dashboard becsült időmegtakarítás | 3 perc/email becslés, nem tényleges mérés |
| K4 | Audit log nem tartalmaz korábbi eseményeket | Csak a migration után történő eseményeket naplózza |

---

## Végeredmény

| Feature | PASS | FAIL | Megjegyzés |
|---------|------|------|------------|
| TC-07 Agent Builder | /21 | /21 | |
| TC-08 Agent Performance | /9 | /9 | |
| TC-09 Source-aware AI | /7 | /7 | |
| TC-10 Audit Trail | /13 | /13 | |
| **Összesen** | **/50** | **/50** | |

**Tesztelő aláírása:** _______________  
**Dátum:** _______________  
**Következő fázis indítható:** ☐ Igen ☐ Nem — Blokkoló hibák: _______________
