const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    signal: opts.signal || AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...opts.headers },
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

  updateStatus: (id, status, note = '') =>
    req(`/api/emails/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),

  classify: (subject, body, sender = '') =>
    req('/classify', {
      method: 'POST',
      body: JSON.stringify({ subject, body, sender }),
    }),

  feedback: (email_id, original_ai_decision, new_status, note = '') =>
    req('/feedback', {
      method: 'POST',
      body: JSON.stringify({ email_id, original_ai_decision, new_status, note }),
    }),

  upload: (formData) =>
    fetch(`${BASE}/api/upload`, { method: 'POST', body: formData, signal: AbortSignal.timeout(60000) })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
}
