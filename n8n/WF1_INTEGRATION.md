# DocuAgent v3 — n8n WF1 Integration

## Email Pipeline → FastAPI

After your existing **AI Válasz Generálás** node, add these two HTTP Request nodes:

---

### Node: POST /classify (before replying)

**Type:** HTTP Request
**Method:** POST
**URL:** `http://host.docker.internal:8000/classify`
**Body (JSON):**
```json
{
  "subject":  "={{ $('Email Kategorizálás').item.json.subject }}",
  "body":     "={{ $('Gmail — Bejövő Email').item.json.text }}",
  "sender":   "={{ $('Gmail — Bejövő Email').item.json.from }}"
}
```

**Response shape:**
```json
{
  "can_answer": true,
  "confidence": 0.85,
  "category": "inquiry",
  "reason": "Standard product question",
  "status": "AI_ANSWERED"
}
```

Use `{{ $json.can_answer }}` and `{{ $json.confidence }}` in your IF node.

---

### Node: POST /email-log (after everything)

**Type:** HTTP Request
**Method:** POST
**URL:** `http://host.docker.internal:8000/email-log`
**Body (JSON):**
```json
{
  "message_id": "={{ $('Gmail — Bejövő Email').item.json.id }}",
  "subject":    "={{ $('Email Kategorizálás').item.json.subject }}",
  "from":       "={{ $('Gmail — Bejövő Email').item.json.from }}",
  "body":       "={{ $('Gmail — Bejövő Email').item.json.text }}",
  "category":   "={{ $('Email Kategorizálás').item.json.category }}",
  "urgent":     "={{ $('Email Kategorizálás').item.json.isUrgent }}",
  "ai_reply":   "={{ $('AI Válasz Generálás').item.json.message?.content?.substring(0,500) }}",
  "confidence": "={{ $('POST /classify').item.json.confidence ?? 0 }}"
}
```

---

### Node: POST /generate-reply (optional — use instead of direct OpenAI)

**URL:** `http://host.docker.internal:8000/generate-reply`
**Body:**
```json
{
  "subject":  "={{ $('Email Kategorizálás').item.json.subject }}",
  "body":     "={{ $('Gmail — Bejövő Email').item.json.text }}",
  "category": "={{ $('Email Kategorizálás').item.json.category }}"
}
```

Response: `{{ $json.reply }}` → pass to Gmail Send node.

---

## Flow diagram

```
Gmail Trigger
  → Email Kategorizálás (Code)
  → POST /classify (FastAPI)       ← confidence decision
  → IF can_answer AND conf > 0.7
      TRUE  → POST /generate-reply → Gmail Send → status=AI_ANSWERED
      FALSE → Slack Alert          → status=NEEDS_ATTENTION
  → POST /email-log                ← always log + deduplicate
```

## Note on host resolution

From Docker containers, use:
- `http://host.docker.internal:8000` to reach the FastAPI backend
- `http://localhost:8000` if running backend natively on host

## Learning loop

Every time a human changes status in the dashboard:
1. Dashboard calls `PATCH /api/emails/{id}/status`
2. Backend stores in `feedback` table
3. Next `/classify` call reads last 8 feedback examples
4. GPT uses them as few-shot corrections → better decisions over time
