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
  dashboard:        ()         => req('/api/dashboard'),
  health:           ()         => req('/api/health'),
  aiInsights:       ()         => req('/api/ai-insights', { signal: AbortSignal.timeout(20000) }),
  agentPerformance: (days = 7) => req(`/api/agents/performance?days=${days}`),
  getEmail:         (id)       => req(`/api/emails/${id}`),

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

  // ── AI Gateway ────────────────────────────────────────────
  gatewayStats: (days = 7) => req(`/api/gateway/stats?days=${days}`),

  // ── Integrations ──────────────────────────────────────────
  integrationsStatus: () => req('/api/integrations/status'),
  saveOutlookConfig: (data) =>
    req('/api/integrations/outlook/config', { method: 'POST', body: JSON.stringify(data) }),
  saveWidgetConfig: (data) =>
    req('/api/integrations/widget/config', { method: 'POST', body: JSON.stringify(data) }),
  calendarTriggerSync: () =>
    req('/api/calendar/trigger-sync', { method: 'POST' }),

  // ── CRM ───────────────────────────────────────────────────
  crmContacts: (search = '', limit = 50, offset = 0) => {
    const q = new URLSearchParams({ limit, offset, ...(search && { search }) })
    return req(`/api/crm/contacts?${q}`)
  },
  crmCreateContact: (data) =>
    req('/api/crm/contacts', { method: 'POST', body: JSON.stringify(data) }),
  crmGetContact: (id) => req(`/api/crm/contacts/${id}`),
  crmUpdateContact: (id, data) =>
    req(`/api/crm/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  crmDeleteContact: (id) =>
    req(`/api/crm/contacts/${id}`, { method: 'DELETE' }),

  crmImportFromEmails: () =>
    req('/api/crm/contacts/import-from-emails', { method: 'POST' }),

  crmCases: (params = {}) => {
    const q = new URLSearchParams({ limit: 50, ...params })
    return req(`/api/crm/cases?${q}`)
  },
  crmCreateCase: (data) =>
    req('/api/crm/cases', { method: 'POST', body: JSON.stringify(data) }),
  crmGetCase: (id) => req(`/api/crm/cases/${id}`),
  crmUpdateCase: (id, data) =>
    req(`/api/crm/cases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  crmLinkEmail: (caseId, emailId) =>
    req(`/api/crm/cases/${caseId}/link-email`, { method: 'POST', body: JSON.stringify({ email_id: emailId }) }),

  crmTasks: (completed) => {
    const q = new URLSearchParams()
    if (completed !== undefined) q.set('completed', completed)
    return req(`/api/crm/tasks?${q}`)
  },
  crmCreateTask: (data) =>
    req('/api/crm/tasks', { method: 'POST', body: JSON.stringify(data) }),
  crmCompleteTask: (id) =>
    req(`/api/crm/tasks/${id}/complete`, { method: 'PATCH' }),

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

  // ── Runs / Error Center ───────────────────────────────────
  getFailedRuns: (limit = 50) =>
    req(`/api/runs/failed?limit=${limit}`),
  retryRun: (id) =>
    req(`/api/runs/${id}/retry`, { method: 'POST' }),

  // ── Usage / Metering ──────────────────────────────────────
  getUsageSummary: () =>
    req('/api/usage'),

  // ── Invoice workflow ──────────────────────────────────────
  extractInvoice: (emailId) =>
    req('/api/invoice-workflow/extract', { method: 'POST', body: JSON.stringify({ email_id: emailId }) }),
  getInvoiceForEmail: (emailId) =>
    req(`/api/invoice-workflow/email/${emailId}`),
  verifyInvoice: (id, data) =>
    req(`/api/invoice-workflow/${id}/verify`, { method: 'POST', body: JSON.stringify(data) }),

  // ── Senior approval ───────────────────────────────────────
  getPendingSeniorApprovals: (limit = 50) => {
    const q = new URLSearchParams({ limit, status: 'NEEDS_ATTENTION', senior_required: true })
    return req(`/api/emails/approval-queue?${q}`)
  },
  seniorApprove: (emailId) =>
    req(`/api/emails/${emailId}/approve`, { method: 'POST' }),

  // ── Gmail integration ─────────────────────────────────────
  gmailTest:   () => req('/api/integrations/gmail/test', { method: 'POST' }),
  gmailStatus: () => req('/api/integrations/gmail/status'),

  // ── Calendar sync status ──────────────────────────────────
  calendarSyncStatus: () => req('/api/calendar/sync-status'),

  // ── User directory ────────────────────────────────────────
  crmGetUsers: () => req('/api/auth/users'),

  // ── RAG statistics ─────────────────────────────────────────
  ragStats: (days = 7) => req(`/api/rag-stats?days=${days}`),

  // ── OCR pipeline ─────────────────────────────────────────
  triggerEmailOCR: (emailId) =>
    req(`/api/emails/${emailId}/ocr`, { method: 'POST' }),
  getOCRJobs: (limit = 50, status = null) =>
    req(`/api/ocr/jobs?limit=${limit}${status ? `&status=${status}` : ''}`),
  getOCRJob: (jobId) =>
    req(`/api/ocr/jobs/${jobId}`),
  batchOCR: (emailIds, forceRerun = false) =>
    req('/api/ocr/batch', { method: 'POST', body: JSON.stringify({ email_ids: emailIds, force_rerun: forceRerun }) }),

  // ── Agent runtime ─────────────────────────────────────────
  activateAgent: (agentId) =>
    req(`/api/agents/${agentId}/activate`, { method: 'POST' }),
  getAgentRuns: (agentId, limit = 50) =>
    req(`/api/agents/${agentId}/runs?limit=${limit}`),

  // ── Tenant API key management ─────────────────────────────
  listApiKeys: () =>
    req('/api/keys'),
  generateApiKey: (label = '') =>
    req('/api/keys/generate', { method: 'POST', body: JSON.stringify({ label }) }),
  revokeApiKey: (prefix) =>
    req(`/api/keys/${prefix}`, { method: 'DELETE' }),
}

const API_KEY_STORAGE = 'docuagent_api_key'

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || ''
}

export function setApiKey(key) {
  if (key) localStorage.setItem(API_KEY_STORAGE, key)
  else localStorage.removeItem(API_KEY_STORAGE)
}
