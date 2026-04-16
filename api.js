const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getJwtToken() {
  return localStorage.getItem('docuagent_token') || ''
}

async function req(path, opts = {}) {
  const jwt = getJwtToken()
  const apiKey = getApiKey()

  const headers = {
    'Content-Type': 'application/json',
    ...opts.headers,
  }

  // JWT prioritás: ha van JWT token, azt küldjük (nem az API key-t)
  // Az API key csak akkor kerül headerbe ha nincs JWT token
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`
  } else if (apiKey) {
    headers['X-API-Key'] = apiKey
  }

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    signal: opts.signal || AbortSignal.timeout(10000),
    headers,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  dashboard:  ()          => req('/api/dashboard'),
  health:     ()          => req('/api/health'),
  aiInsights: ()          => req('/api/ai-insights', { signal: AbortSignal.timeout(20000) }),

  emails:     (status, limit = 50, offset = 0) => {
    const q = new URLSearchParams({ limit, offset, ...(status && { status }) })
    return req(`/api/emails?${q}`)
  },

  deleteEmail: (id) =>
    req(`/api/emails/${id}`, { method: 'DELETE' }),

  approvalQueue: (limit = 50) =>
    req(`/api/emails/approval-queue?limit=${limit}`),

  approveEmail: (id) =>
    req(`/api/emails/${id}/approve`, { method: 'POST' }),

  rejectEmail: (id, note = '') =>
    req(`/api/emails/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),

  editAndApprove: (id, reply, note = '') =>
    req(`/api/emails/${id}/edit-and-approve`, { method: 'PATCH', body: JSON.stringify({ reply, note }) }),

  deleteDocument: (id) =>
    req(`/api/documents/${id}`, { method: 'DELETE' }),

  updateStatus: (id, status, note = '') =>
    req(`/api/emails/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),

  classify: (subject, body, sender = '') =>
    req('/api/classify', {
      method: 'POST',
      body: JSON.stringify({ subject, body, sender }),
    }),

  feedback: (email_id, original_ai_decision, new_status, note = '') =>
    req('/feedback', {
      method: 'POST',
      body: JSON.stringify({ email_id, original_ai_decision, new_status, note }),
    }),

  getSlaConfig:  () => req('/api/sla/config'),
  setSlaConfig:  (cfg) => req('/api/sla/config', { method: 'POST', body: JSON.stringify(cfg) }),
  getSlaSummary: () => req('/api/sla/summary'),
  getSlaStatus:  () => req('/api/sla/status'),

  slaConfig:    () => req('/api/sla/config'),
  slaSetConfig: (w, b) => req('/api/sla/config', { method: 'POST', body: JSON.stringify({ warning_hours: w, breach_hours: b }) }),
  slaSummary:   () => req('/api/sla/summary'),
  slaStatus:    () => req('/api/sla/status'),

  upload: (formData) =>
    fetch(`${BASE}/api/upload`, { method: 'POST', body: formData, signal: AbortSignal.timeout(60000) })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),

  templates:      ()         => req('/api/templates'),
  applyTemplate:  (id)       => req(`/api/templates/${id}/apply`, { method: 'POST' }),
  demoReset:      ()         => req('/api/demo/reset', { method: 'POST' }),

  calendarEvents: (from, to) => {
    const q = new URLSearchParams()
    if (from) q.set('from_date', from)
    if (to)   q.set('to_date', to)
    return req(`/api/calendar/events?${q}`)
  },
  createCalendarEvent: (data) =>
    req('/api/calendar/events', { method: 'POST', body: JSON.stringify(data) }),
  deleteCalendarEvent: (id) =>
    req(`/api/calendar/events/${id}`, { method: 'DELETE' }),
}

const API_KEY_STORAGE = 'docuagent_api_key'

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || ''
}

export function setApiKey(key) {
  if (key) localStorage.setItem(API_KEY_STORAGE, key)
  else localStorage.removeItem(API_KEY_STORAGE)
}
