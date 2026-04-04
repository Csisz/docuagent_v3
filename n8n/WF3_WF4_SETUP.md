# WF3 & WF4 — Calendar Integration Setup

## Áttekintés

| Workflow | Funkció | Trigger |
|---|---|---|
| **WF3** — Calendar Booking Detector | Emailből időpont-kérés detektálás + auto-reply | Minden 10 percben |
| **WF4** — Calendar Sync | Google Calendar → DocuAgent DB szinkron | Naponta 07:00 |

---

## 1. Google Cloud Console — Calendar API engedélyezés

1. Nyisd meg: https://console.cloud.google.com/
2. Válaszd ki a projektedet (vagy hozz létre újat)
3. Bal menü → **APIs & Services → Library**
4. Keresd: `Google Calendar API` → **Enable**
5. Keresd: `Gmail API` → **Enable** (ha még nincs engedélyezve)

---

## 2. OAuth2 Client ID létrehozása

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Name: `DocuAgent n8n`
4. Authorized redirect URIs:
   ```
   http://localhost:5678/rest/oauth2-credential/callback
   ```
5. Kattints **Create** → jegyezd fel a **Client ID** és **Client Secret** értékeket

> Ha még nincs OAuth consent screen konfigurálva:
> - **APIs & Services → OAuth consent screen**
> - User Type: **External** (teszteléshez) vagy **Internal** (Google Workspace)
> - App name: `DocuAgent`, support email, developer email kitöltve
> - Scopes: `calendar.readonly`, `calendar.events`, `gmail.send`, `gmail.readonly`
> - Test users: add hozzá a saját Gmail-ed

---

## 3. n8n — Google Calendar OAuth2 Credential

1. Nyisd meg: http://localhost:5678
2. Bal menü → **Credentials → Add Credential**
3. Típus: `Google Calendar OAuth2 API`
4. Töltsd ki:
   - **Client ID**: (Google Cloud-ból)
   - **Client Secret**: (Google Cloud-ból)
5. Kattints **Connect my account** → böngészőben engedélyezd
6. Mentsd el, jegyezd fel a credential ID-t

---

## 4. WF3 — Calendar Booking Detector importálása

1. n8n → **Workflows → Import from file**
2. Válaszd: `n8n/WF3_calendar_booking.json`
3. **Credential csere szükséges:**
   - `📧 Gmail: Olvasatlan emailek` → válaszd a meglévő Gmail credential-t
   - `📤 Gmail: Auto Reply` → ugyanaz a Gmail credential
   - `✅ Slack: Esemény létrehozva` → Slack credential + channel ID
   - `⚠️ Slack: Emberi jóváhagyás` → Slack credential + channel ID
4. **HTTP Request node ellenőrzése:**
   - URL: `http://backend:8000/api/calendar/book-from-email`
   - Header: `X-API-Key` → értéke: n8n environment variable `DOCUAGENT_API_KEY`
5. Aktiváld a workflow-t

### DOCUAGENT_API_KEY beállítása n8n-ben

n8n → **Settings → Environment Variables** (vagy `.env` fájl):
```
DOCUAGENT_API_KEY=<a backend .env-ből: DASHBOARD_API_KEY értéke>
```

---

## 5. WF4 — Calendar Sync importálása

1. n8n → **Workflows → Import from file**
2. Válaszd: `n8n/WF4_calendar_sync.json`
3. **Credential csere:**
   - `🗓️ Google Calendar API` node → válaszd a 3. lépésben létrehozott **Google Calendar OAuth2** credential-t
   - A node `GOOGLE_CALENDAR_CRED_ID` placeholder-t tartalmaz — cseréld le a tényleges ID-ra
   - `✅ Slack: Sync Riport` → Slack credential + channel ID
4. **HTTP Request ellenőrzése:**
   - URL: `http://backend:8000/api/calendar/sync`
   - Header: `X-API-Key` → `DOCUAGENT_API_KEY`
5. Aktiváld

---

## 6. Tesztelés

### WF3 teszt
```bash
# Küldj egy email-t a figyelő Gmail-re ezzel a tárggyal:
# "Szeretnék időpontot kérni egy demóra"
# → 10 percen belül a WF3 feldolgozza
```

### WF4 manuális teszt
1. n8n → WF4 → **Execute workflow** (kézzel elindít)
2. Ellenőrizd a DB-t:
```sql
SELECT title, start_time, source FROM calendar_events
WHERE source = 'google_sync'
ORDER BY start_time;
```

### Backend API direkt teszt
```bash
# Esemény létrehozása
curl -X POST http://localhost:8000/api/calendar/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{"title":"Teszt meeting","start_time":"2025-04-10T10:00:00Z","end_time":"2025-04-10T11:00:00Z"}'

# Események listázása
curl http://localhost:8000/api/calendar/events \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Sync endpoint (n8n hívja)
curl -X POST http://localhost:8000/api/calendar/sync \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <DASHBOARD_API_KEY>" \
  -d '{"events":[{"google_event_id":"test123","title":"Google event","start_time":"2025-04-10T10:00:00Z","end_time":"2025-04-10T11:00:00Z"}]}'
```

---

## 7. Hibaelhárítás

| Hiba | Ok | Megoldás |
|---|---|---|
| `401 Unauthorized` (WF4 → Google) | Lejárt OAuth token | n8n Credentials → Google Calendar → reconnect |
| `404 Tenant not found` (book-from-email) | JWT/API key hiányzik | DOCUAGENT_API_KEY env var ellenőrzése |
| `confidence: 0` minden emailnél | GPT nem talál időpontot | Ellenőrizd az email tartalmát; a küszöb 0.4 |
| Duplikált naptár események | `google_event_id` ütközés | Normális — az upsert kezeli, nem hoz létre duplikátumot |
| n8n nem éri el a backend-et | Docker network | Ellenőrizd: `docker network inspect docuagent_v3_default` |
