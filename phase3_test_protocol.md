# DocuAgent v3 — 3. Fázis Tesztelési Jegyzőkönyv

**Verzió:** v3.3  
**Dátum:** _______________  
**Tesztelő:** _______________  
**Környezet:** localhost (Docker Compose)

---

## Előkészítés

```powershell
# Migrációk
Get-Content db\migrate_v3_12_crm.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent
Get-Content db\migrate_v3_13_ai_gateway.sql | docker exec -i docuagent_v3-postgres-1 psql -U postgres -d docuagent

# Rebuild
docker compose up --build -d

# Táblák ellenőrzése
docker exec docuagent_v3-postgres-1 psql -U postgres -d docuagent -c "\dt" | Select-String "contacts|cases|tasks|ai_usage"
```

---

## TC-11 — Basic CRM

**Felhasználó:** demo@agentify.hu / demo1234  
**URL:** http://localhost:3000/crm

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 11.1 | Sidebar | "CRM" menüpont látható a Tartalom szekcióban | ☐ PASS ☐ FAIL | |
| 11.2 | /crm oldal betölt | 3 tab: Kontaktok, Ügyek, Teendők | ☐ PASS ☐ FAIL | |
| **Kontaktok tab** | | | | |
| 11.3 | Auto-generált kontaktok | A demo emailek feladói automatikusan megjelennek kontaktként | ☐ PASS ☐ FAIL | |
| 11.4 | Keresés | Névre/emailre/cégre szűr | ☐ PASS ☐ FAIL | |
| 11.5 | Kontakt táblázat | Név, email, cég, emailek száma, utolsó kontaktus | ☐ PASS ☐ FAIL | |
| 11.6 | Kontakt részletei | Kattintásra oldalpanel nyílik kapcsolódó emailekkel | ☐ PASS ☐ FAIL | |
| 11.7 | Új kontakt | "+ Kontakt" gomb → form → mentés → listában megjelenik | ☐ PASS ☐ FAIL | |
| 11.8 | DB ellenőrzés | `SELECT email, full_name FROM contacts WHERE tenant_id='00000000-0000-0000-0000-000000000001' LIMIT 5;` | ☐ PASS ☐ FAIL | |
| **Ügyek tab** | | | | |
| 11.9 | Ügyek lista/kanban | open, in_progress, resolved, closed oszlopok vagy státusz badge | ☐ PASS ☐ FAIL | |
| 11.10 | Új ügy | "+ Ügy" gomb → modal: cím, kontakt, prioritás, kategória | ☐ PASS ☐ FAIL | |
| 11.11 | Prioritás badge | low=szürke, normal=kék, high=narancs, urgent=piros | ☐ PASS ☐ FAIL | |
| 11.12 | Email kapcsolás | ApprovalPage-en "+ Ügyhez" gomb → ügy listából választható | ☐ PASS ☐ FAIL | |
| 11.13 | Ügy részletei | Kapcsolódó emailek listája az ügy részleteinél | ☐ PASS ☐ FAIL | |
| **Teendők tab** | | | | |
| 11.14 | Teendők lista | Checkbox, cím, határidő, kapcsolódó ügy | ☐ PASS ☐ FAIL | |
| 11.15 | Új teendő | "+ Teendő" gomb → form → mentés | ☐ PASS ☐ FAIL | |
| 11.16 | Teendő teljesítése | Checkbox kattintásra completed=true, áthúzott szöveg | ☐ PASS ☐ FAIL | |
| 11.17 | Completed szűrő | Toggle: csak aktív / összes teendő | ☐ PASS ☐ FAIL | |
| 11.18 | Tenant izoláció | Éles userrel: üres CRM (demo adatok nem látszanak) | ☐ PASS ☐ FAIL | |

---

## TC-12 — Outlook integráció

**Felhasználó:** demo@agentify.hu / demo1234  
**URL:** http://localhost:3000/integrations

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 12.1 | Sidebar | "Integrációk" menüpont látható | ☐ PASS ☐ FAIL | |
| 12.2 | /integrations oldal | 4 kártya: Gmail, Outlook, Google Calendar, n8n | ☐ PASS ☐ FAIL | |
| 12.3 | Gmail kártya | Státusz dot, email cím, Beállítás gomb | ☐ PASS ☐ FAIL | |
| 12.4 | Outlook kártya | "Hamarosan" badge, leírás, email input | ☐ PASS ☐ FAIL | |
| 12.5 | Google Calendar kártya | Szinkronizálás gomb működik (trigger-sync) | ☐ PASS ☐ FAIL | |
| 12.6 | n8n kártya | Online/Offline státusz health check alapján | ☐ PASS ☐ FAIL | |
| 12.7 | Outlook webhook endpoint | `POST /api/integrations/outlook/webhook` létezik a Swagger-ben | ☐ PASS ☐ FAIL | |
| 12.8 | Integráció státusz API | `GET /api/integrations/status` → JSON válasz | ☐ PASS ☐ FAIL | |

---

## TC-13 — AI Gateway

**Felhasználó:** demo@agentify.hu / demo1234

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 13.1 | Model routing — classify | Backend log: `gpt-4o-mini` modell használva classify-nál | ☐ PASS ☐ FAIL | |
| 13.2 | Model routing — reply | Backend log: confidence alapján választ modellt | ☐ PASS ☐ FAIL | |
| 13.3 | AI Gateway stats API | `GET /api/gateway/stats` → total_calls, mini_calls, smart_calls, cost | ☐ PASS ☐ FAIL | |
| 13.4 | ai_usage_log tábla | `SELECT model, task_type, COUNT(*) FROM ai_usage_log GROUP BY model, task_type;` | ☐ PASS ☐ FAIL | |
| 13.5 | InsightsPage Gateway szekció | 3 metrika kártya + pie chart megjelenik | ☐ PASS ☐ FAIL | |
| 13.6 | Cost becslés | Becsült $ érték megjelenik (lehet 0 ha nincs hívás) | ☐ PASS ☐ FAIL | |
| 13.7 | Tenant izoláció | Csak a saját tenant AI hívásait mutatja | ☐ PASS ☐ FAIL | |

---

## TC-14 — Embeddable Widget

**URL:** http://localhost:3000/integrations (embed konfigurátor)  
**Widget URL:** http://localhost:8000/widget (vagy frontend/public/widget.html)

| # | Lépés | Elvárt eredmény | Eredmény | Megjegyzés |
|---|-------|----------------|----------|------------|
| 14.1 | Widget config API | `GET /api/widget/config/demo` → company_name, welcome_message | ☐ PASS ☐ FAIL | |
| 14.2 | Widget chat API | `POST /api/widget/chat` body: {message, session_id, tenant_slug} → reply | ☐ PASS ☐ FAIL | |
| 14.3 | Widget megnyitása | Chat bubble látható jobb alsó sarokban | ☐ PASS ☐ FAIL | |
| 14.4 | Üzenet küldése | Kérdésre AI válasz érkezik | ☐ PASS ☐ FAIL | |
| 14.5 | RAG forrás | Ha dokumentum alapú válasz: forrás kártya megjelenik | ☐ PASS ☐ FAIL | |
| 14.6 | Fallback válasz | Ha nincs releváns dokumentum: config-ból jön a fallback | ☐ PASS ☐ FAIL | |
| 14.7 | Session persistence | Oldal frissítés után az előző üzenetek megmaradnak | ☐ PASS ☐ FAIL | |
| 14.8 | IntegrationsPage embed | Copy snippet gomb működik, kód a vágólapra kerül | ☐ PASS ☐ FAIL | |
| 14.9 | Testreszabás | Color picker + welcome message mentés működik | ☐ PASS ☐ FAIL | |
| 14.10 | embed-example.html | A beágyazási példa frissítve, widget betölt benne | ☐ PASS ☐ FAIL | |
| 14.11 | Publikus endpoint | Widget chat API-hoz nem kell bejelentkezés | ☐ PASS ☐ FAIL | |

---

## Ismert korlátok (Not a bug)

| # | Viselkedés | Magyarázat |
|---|-----------|------------|
| K1 | Outlook integráció nem küld/fogad valódi emailt | n8n Outlook credential szükséges, a UI csak a konfigot menti |
| K2 | AI Gateway cost becslés hozzávetőleges | Token számolás becsült, nem pontos OpenAI billing |
| K3 | Widget session nem szerver-oldali | localStorage-ban van, törlés után elvész |
| K4 | CRM auto-contact csak új emaileknél | A meglévő demo emailek feladói manuálisan kell importálni |

---

## Végeredmény

| Feature | PASS | FAIL | Megjegyzés |
|---------|------|------|------------|
| TC-11 Basic CRM | /18 | /18 | |
| TC-12 Outlook integráció | /8 | /8 | |
| TC-13 AI Gateway | /7 | /7 | |
| TC-14 Embeddable Widget | /11 | /11 | |
| **Összesen** | **/44** | **/44** | |

**Tesztelő aláírása:** _______________  
**Dátum:** _______________  
**SaaS launch indítható:** ☐ Igen ☐ Nem — Blokkoló hibák: _______________
