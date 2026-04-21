import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'

const PRIORITY_COLORS = {
  low:    { bg: 'rgba(100,116,139,.18)', text: '#94a3b8' },
  normal: { bg: 'rgba(59,130,246,.15)',  text: '#60a5fa' },
  high:   { bg: 'rgba(245,158,11,.15)',  text: '#fbbf24' },
  urgent: { bg: 'rgba(239,68,68,.18)',   text: '#f87171' },
}
const STATUS_COLORS = {
  open:        { bg: 'rgba(59,130,246,.15)',  text: '#60a5fa'  },
  in_progress: { bg: 'rgba(245,158,11,.15)',  text: '#fbbf24'  },
  resolved:    { bg: 'rgba(34,197,94,.15)',   text: '#4ade80'  },
  closed:      { bg: 'rgba(100,116,139,.18)', text: '#94a3b8'  },
}
const STATUS_LABELS  = { open: 'Nyitott', in_progress: 'Folyamatban', resolved: 'Megoldva', closed: 'Lezárva' }
const PRIORITY_LABELS = { low: 'Alacsony', normal: 'Normál', high: 'Magas', urgent: 'Sürgős' }

function Badge({ value, map, colors }) {
  const label  = map[value]    || value
  const color  = colors[value] || { bg: 'rgba(255,255,255,.08)', text: '#94a3b8' }
  return (
    <span style={{ background: color.bg, color: color.text, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 500 }}>
      {label}
    </span>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
}

function showToast(msg, ok = true) {
  const el = document.getElementById('toast-root')
  if (!el) return
  el.textContent = msg
  el.className = `toast-visible ${ok ? 'toast-ok' : 'toast-err'}`
  setTimeout(() => { el.className = '' }, 3000)
}

// ── Modal wrapper ─────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: 24, width: 480, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>{title}</div>
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,.4)', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,.45)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 8, color: '#e2e8f0', padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const selectStyle = { ...inputStyle }
const btnPrimary = {
  background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8,
  padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
}
const btnSecondary = {
  background: 'none', color: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
}

// ── Contact Form ──────────────────────────────────────────────
function ContactForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    email: '', full_name: '', company: '', phone: '', notes: '', ...initial,
  })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit() {
    if (!form.email) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Field label="Email *"><input style={inputStyle} value={form.email} onChange={set('email')} placeholder="pl. john@example.com" /></Field>
      <Field label="Teljes név"><input style={inputStyle} value={form.full_name} onChange={set('full_name')} placeholder="pl. Kovács János" /></Field>
      <Field label="Cég"><input style={inputStyle} value={form.company} onChange={set('company')} placeholder="pl. Agentify Kft." /></Field>
      <Field label="Telefon"><input style={inputStyle} value={form.phone} onChange={set('phone')} placeholder="pl. +36 30 123 4567" /></Field>
      <Field label="Megjegyzés"><textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.notes} onChange={set('notes')} /></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button style={btnSecondary} onClick={onCancel}>Mégse</button>
        <button style={btnPrimary} onClick={submit} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</button>
      </div>
    </div>
  )
}

// ── Case Form ─────────────────────────────────────────────────
function CaseForm({ contacts = [], initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: '', contact_id: '', status: 'open', priority: 'normal', category: '', notes: '', ...initial,
  })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit() {
    if (!form.title) return
    setSaving(true)
    try {
      await onSave({ ...form, contact_id: form.contact_id || null })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Field label="Cím *"><input style={inputStyle} value={form.title} onChange={set('title')} placeholder="pl. Számlázási probléma" /></Field>
      <Field label="Kontakt">
        <select style={selectStyle} value={form.contact_id} onChange={set('contact_id')}>
          <option value="">— nincs kapcsolva —</option>
          {contacts.map(c => (
            <option key={c.id} value={c.id}>{c.full_name || c.email} {c.company ? `(${c.company})` : ''}</option>
          ))}
        </select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Prioritás">
          <select style={selectStyle} value={form.priority} onChange={set('priority')}>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Státusz">
          <select style={selectStyle} value={form.status} onChange={set('status')}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Kategória"><input style={inputStyle} value={form.category} onChange={set('category')} placeholder="pl. Számlázás, Technikai..." /></Field>
      <Field label="Megjegyzés"><textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.notes} onChange={set('notes')} /></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button style={btnSecondary} onClick={onCancel}>Mégse</button>
        <button style={btnPrimary} onClick={submit} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</button>
      </div>
    </div>
  )
}

// ── Task Form ─────────────────────────────────────────────────
function TaskForm({ contacts = [], cases = [], initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: '', case_id: '', contact_id: '', due_date: '', assigned_to: '', ...initial,
  })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit() {
    if (!form.title) return
    setSaving(true)
    try {
      await onSave({
        ...form,
        case_id:    form.case_id    || null,
        contact_id: form.contact_id || null,
        due_date:   form.due_date   || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Field label="Feladat megnevezése *"><input style={inputStyle} value={form.title} onChange={set('title')} placeholder="pl. Visszahívni az ügyfelet" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Kapcsolódó ügy">
          <select style={selectStyle} value={form.case_id} onChange={set('case_id')}>
            <option value="">—</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
        <Field label="Kontakt">
          <select style={selectStyle} value={form.contact_id} onChange={set('contact_id')}>
            <option value="">—</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Határidő"><input type="datetime-local" style={inputStyle} value={form.due_date} onChange={set('due_date')} /></Field>
        <Field label="Felelős"><input style={inputStyle} value={form.assigned_to} onChange={set('assigned_to')} placeholder="pl. admin@..." /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button style={btnSecondary} onClick={onCancel}>Mégse</button>
        <button style={btnPrimary} onClick={submit} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</button>
      </div>
    </div>
  )
}

// ── Contact side panel ────────────────────────────────────────
function ContactPanel({ contact, onClose, onEdit, onDelete }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: '#0f172a',
      borderLeft: '1px solid rgba(255,255,255,.1)', zIndex: 40, display: 'flex', flexDirection: 'column',
      overflowY: 'auto', padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>Kontakt részletei</div>
        <button onClick={onClose} style={{ color: 'rgba(255,255,255,.4)', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#1a56db,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 14 }}>
        {(contact.full_name || contact.email).slice(0, 1).toUpperCase()}
      </div>

      <div style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 2 }}>{contact.full_name || '—'}</div>
      <div style={{ fontSize: 13, color: '#60a5fa', marginBottom: 14 }}>{contact.email}</div>

      {contact.company && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
          <span style={{ color: 'rgba(255,255,255,.3)' }}>Cég: </span>{contact.company}
        </div>
      )}
      {contact.phone && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
          <span style={{ color: 'rgba(255,255,255,.3)' }}>Tel: </span>{contact.phone}
        </div>
      )}
      {contact.notes && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {contact.notes}
        </div>
      )}

      {contact.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
          {contact.tags.map(t => (
            <span key={t} style={{ background: 'rgba(26,86,219,.2)', color: '#93c5fd', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>{t}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={onEdit} style={{ ...btnSecondary, flex: 1 }}>Szerkesztés</button>
        {onDelete && (
          <button
            onClick={onDelete}
            style={{ background: 'rgba(248,113,113,.1)', color: '#f87171', border: '1px solid rgba(248,113,113,.25)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}
          >Törlés</button>
        )}
      </div>

      {contact.emails?.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 10 }}>
            Kapcsolódó emailek ({contact.emails.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {contact.emails.map(e => (
              <div key={e.id} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,.07)' }}>
                <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.subject || '(nincs tárgy)'}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)' }}>{formatDate(e.created_at)}</span>
                  <span style={{ fontSize: 10, color: '#60a5fa' }}>{e.status}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Case side panel ───────────────────────────────────────────
function CasePanel({ caseItem, onClose, onEdit }) {
  const [linkedEmails, setLinkedEmails] = useState([])
  useEffect(() => {
    if (!caseItem?.id) return
    api.crmGetCase(caseItem.id)
      .then(data => setLinkedEmails(data.emails || []))
      .catch(() => {})
  }, [caseItem?.id])

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, background: '#0f172a',
      borderLeft: '1px solid rgba(255,255,255,.1)', zIndex: 40, display: 'flex', flexDirection: 'column',
      overflowY: 'auto', padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>Ügy részletei</div>
        <button onClick={onClose} style={{ color: 'rgba(255,255,255,.4)', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 10, lineHeight: 1.4 }}>{caseItem.title}</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge value={caseItem.status}   map={STATUS_LABELS}   colors={STATUS_COLORS} />
        <Badge value={caseItem.priority} map={PRIORITY_LABELS} colors={PRIORITY_COLORS} />
        {caseItem.category && (
          <span style={{ background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.5)', borderRadius: 4, padding: '2px 7px', fontSize: 11 }}>
            {caseItem.category}
          </span>
        )}
      </div>

      {caseItem.contact_name && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
          <span style={{ color: 'rgba(255,255,255,.3)' }}>Kontakt: </span>
          {caseItem.contact_name} {caseItem.contact_email ? `<${caseItem.contact_email}>` : ''}
        </div>
      )}
      {caseItem.assigned_to && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
          <span style={{ color: 'rgba(255,255,255,.3)' }}>Felelős: </span>{caseItem.assigned_to}
        </div>
      )}
      {caseItem.notes && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {caseItem.notes}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginBottom: 16 }}>
        Létrehozva: {formatDate(caseItem.created_at)}
      </div>

      <button onClick={onEdit} style={{ ...btnSecondary, marginBottom: 20, width: '100%' }}>Szerkesztés</button>

      {linkedEmails.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 10 }}>
            Kapcsolódó emailek ({linkedEmails.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {linkedEmails.map(e => (
              <div key={e.id} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,.07)' }}>
                <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.subject || '(nincs tárgy)'}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)' }}>{formatDate(e.created_at)}</span>
                  <span style={{ fontSize: 10, color: '#60a5fa' }}>{e.status}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main CrmPage ──────────────────────────────────────────────
export default function CrmPage() {
  const [tab, setTab]           = useState('contacts')

  // Contacts
  const [contacts, setContacts]     = useState([])
  const [contactTotal, setContactTotal] = useState(0)
  const [contactSearch, setContactSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState(null)
  const [showContactModal, setShowContactModal] = useState(false)
  const [editContact, setEditContact] = useState(null)

  // Cases
  const [cases, setCases]         = useState([])
  const [caseStatusFilter, setCaseStatusFilter] = useState('')
  const [showCaseModal, setShowCaseModal] = useState(false)
  const [editCase, setEditCase]   = useState(null)
  const [selectedCase, setSelectedCase] = useState(null)

  // Tasks
  const [tasks, setTasks]         = useState([])
  const [showCompleted, setShowCompleted] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)

  const [loading, setLoading]   = useState(false)
  const [importing, setImporting] = useState(false)

  // ── Load data ───────────────────────────────────────────────

  const loadContacts = useCallback(async (search = contactSearch) => {
    setLoading(true)
    try {
      const res = await api.crmContacts(search)
      setContacts(res.contacts || [])
      setContactTotal(res.total || 0)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [contactSearch])

  const loadCases = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (caseStatusFilter) params.status = caseStatusFilter
      const res = await api.crmCases(params)
      setCases(res.cases || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [caseStatusFilter])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.crmTasks(showCompleted ? undefined : false)
      setTasks(res.tasks || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [showCompleted])

  useEffect(() => {
    if (tab === 'contacts') loadContacts()
    else if (tab === 'cases') { loadCases(); loadContacts('') }
    else if (tab === 'tasks') { loadTasks(); loadContacts(''); loadCases() }
  }, [tab, caseStatusFilter, showCompleted])

  useEffect(() => {
    if (tab !== 'contacts') return
    const t = setTimeout(() => loadContacts(contactSearch), 300)
    return () => clearTimeout(t)
  }, [contactSearch])

  // ── Contact detail panel ────────────────────────────────────
  async function openContactPanel(c) {
    try {
      const full = await api.crmGetContact(c.id)
      setSelectedContact(full)
    } catch {
      setSelectedContact(c)
    }
  }

  // ── Case detail panel ────────────────────────────────────────

  function openCasePanel(c) {
    setSelectedCase(c)
  }

  // ── Import contacts from emails ───────────────────────────────

  async function handleImportFromEmails() {
    setImporting(true)
    try {
      const res = await api.crmImportFromEmails()
      showToast(`${res.created} új kontakt importálva (${res.skipped} kihagyva)`)
      loadContacts()
    } catch (e) {
      showToast(`Import sikertelen: ${e.message}`, false)
    } finally {
      setImporting(false)
    }
  }

  // ── Contact CRUD ────────────────────────────────────────────
  async function saveContact(form) {
    try {
      if (editContact) {
        await api.crmUpdateContact(editContact.id, form)
        showToast('Kontakt frissítve')
        // Refresh detail panel if currently open
        if (selectedContact?.id === editContact.id) {
          const updated = await api.crmGetContact(editContact.id).catch(() => null)
          if (updated) setSelectedContact(updated)
        }
      } else {
        await api.crmCreateContact(form)
        showToast('Kontakt létrehozva')
      }
      setShowContactModal(false)
      setEditContact(null)
      loadContacts()
    } catch (e) {
      showToast(`Hiba: ${e.message}`, false)
    }
  }

  async function deleteContact(id) {
    if (!confirm('Törlöd ezt a kontaktot?')) return
    try {
      await api.crmDeleteContact(id)
      showToast('Kontakt törölve')
      if (selectedContact?.id === id) setSelectedContact(null)
      loadContacts()
    } catch (e) {
      showToast(`Hiba: ${e.message}`, false)
    }
  }

  // ── Case CRUD ───────────────────────────────────────────────
  async function saveCase(form) {
    try {
      if (editCase) {
        await api.crmUpdateCase(editCase.id, form)
        showToast('Ügy frissítve')
      } else {
        await api.crmCreateCase(form)
        showToast('Ügy létrehozva')
      }
      setShowCaseModal(false)
      setEditCase(null)
      loadCases()
    } catch (e) {
      showToast(`Hiba: ${e.message}`, false)
    }
  }

  // ── Task CRUD ───────────────────────────────────────────────
  async function saveTask(form) {
    try {
      await api.crmCreateTask(form)
      showToast('Teendő létrehozva')
      setShowTaskModal(false)
      loadTasks()
    } catch (e) {
      showToast(`Hiba: ${e.message}`, false)
    }
  }

  async function completeTask(id) {
    try {
      await api.crmCompleteTask(id)
      showToast('Teendő kész!')
      loadTasks()
    } catch (e) {
      showToast(`Hiba: ${e.message}`, false)
    }
  }

  // ── Styles ──────────────────────────────────────────────────
  const s = {
    page:    { minHeight: '100vh', background: '#050d18', color: '#e2e8f0', padding: '24px 32px' },
    header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    title:   { fontSize: 20, fontWeight: 700, color: '#f1f5f9' },
    tabs:    { display: 'flex', gap: 2, background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: 3, marginBottom: 20, width: 'fit-content' },
    tab:     (active) => ({
      padding: '7px 20px', borderRadius: 8, fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
      background: active ? '#1a56db' : 'none', color: active ? '#fff' : 'rgba(255,255,255,.5)',
      border: 'none', transition: 'all .15s',
    }),
    table:   { width: '100%', borderCollapse: 'collapse' },
    th:      { textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,.35)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' },
    td:      { padding: '11px 12px', fontSize: 13, color: '#cbd5e1', borderBottom: '1px solid rgba(255,255,255,.05)' },
    row:     { cursor: 'pointer', transition: 'background .1s' },
    card:    { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 14 },
    searchInput: { ...inputStyle, width: 280 },
  }

  // ── Contacts tab ─────────────────────────────────────────────
  function renderContacts() {
    return (
      <>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <input
            style={s.searchInput}
            placeholder="Keresés: név, email, cég..."
            value={contactSearch}
            onChange={e => setContactSearch(e.target.value)}
          />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>{contactTotal} kontakt</span>
          <button
            style={{ ...btnSecondary, fontSize: 12 }}
            onClick={handleImportFromEmails}
            disabled={importing}
          >
            {importing ? 'Importálás...' : '⬇ Importálás emailekből'}
          </button>
          <button style={btnPrimary} onClick={() => { setEditContact(null); setShowContactModal(true) }}>
            + Kontakt
          </button>
        </div>

        {loading && contacts.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Betöltés...</div>
        ) : contacts.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,.25)', fontSize: 13, padding: '48px 0', textAlign: 'center' }}>
            Nincs kontakt. Hozz létre egyet, vagy küldj be egy emailt — automatikusan létrejön.
          </div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Név</th>
                <th style={s.th}>Email</th>
                <th style={s.th}>Cég</th>
                <th style={s.th}>Emailek</th>
                <th style={s.th}>Utolsó kontaktus</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr
                  key={c.id}
                  style={s.row}
                  onClick={() => openContactPanel(c)}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#1a56db,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {(c.full_name || c.email).slice(0, 1).toUpperCase()}
                      </div>
                      <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{c.full_name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ ...s.td, color: '#60a5fa' }}>{c.email}</td>
                  <td style={s.td}>{c.company || '—'}</td>
                  <td style={s.td}>{c.email_count || 0}</td>
                  <td style={s.td}>{formatDate(c.last_contact)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    )
  }

  // ── Cases tab ────────────────────────────────────────────────
  function renderCases() {
    const statuses = ['', 'open', 'in_progress', 'resolved', 'closed']
    return (
      <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {statuses.map(st => (
            <button
              key={st}
              style={{
                padding: '5px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: 'none',
                background: caseStatusFilter === st ? '#1a56db' : 'rgba(255,255,255,.07)',
                color: caseStatusFilter === st ? '#fff' : 'rgba(255,255,255,.5)',
              }}
              onClick={() => setCaseStatusFilter(st)}
            >
              {st ? STATUS_LABELS[st] : 'Összes'}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button style={btnPrimary} onClick={() => { setEditCase(null); setShowCaseModal(true) }}>
            + Ügy
          </button>
        </div>

        {loading && cases.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Betöltés...</div>
        ) : cases.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,.25)', fontSize: 13, padding: '48px 0', textAlign: 'center' }}>Nincsenek ügyek.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {cases.map(c => (
              <div
                key={c.id}
                style={{ ...s.card, cursor: 'pointer' }}
                onClick={() => openCasePanel(c)}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.07)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 8, lineHeight: 1.4 }}>{c.title}</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <Badge value={c.status}   map={STATUS_LABELS}   colors={STATUS_COLORS} />
                  <Badge value={c.priority} map={PRIORITY_LABELS} colors={PRIORITY_COLORS} />
                  {c.category && (
                    <span style={{ background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.5)', borderRadius: 4, padding: '2px 7px', fontSize: 11 }}>
                      {c.category}
                    </span>
                  )}
                </div>
                {c.contact_name && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>
                    👤 {c.contact_name} {c.contact_email ? `<${c.contact_email}>` : ''}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', marginTop: 6 }}>{formatDate(c.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  // ── Tasks tab ────────────────────────────────────────────────
  function renderTasks() {
    const pending   = tasks.filter(t => !t.completed)
    const completed = tasks.filter(t =>  t.completed)
    const list = showCompleted ? tasks : pending

    return (
      <>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <button
            style={{
              padding: '5px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: 'none',
              background: showCompleted ? '#1a56db' : 'rgba(255,255,255,.07)',
              color: showCompleted ? '#fff' : 'rgba(255,255,255,.5)',
            }}
            onClick={() => setShowCompleted(v => !v)}
          >
            {showCompleted ? 'Csak aktívak' : `Kész is (${completed.length})`}
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>{pending.length} aktív</span>
          <button style={btnPrimary} onClick={() => setShowTaskModal(true)}>
            + Teendő
          </button>
        </div>

        {loading && tasks.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Betöltés...</div>
        ) : list.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,.25)', fontSize: 13, padding: '48px 0', textAlign: 'center' }}>Nincsenek teendők.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map(t => (
              <div
                key={t.id}
                style={{ ...s.card, display: 'flex', alignItems: 'flex-start', gap: 12, opacity: t.completed ? 0.5 : 1 }}
              >
                <button
                  onClick={() => !t.completed && completeTask(t.id)}
                  style={{
                    width: 20, height: 20, borderRadius: 5, border: '1.5px solid rgba(255,255,255,.3)',
                    background: t.completed ? '#1a56db' : 'none', flexShrink: 0, cursor: t.completed ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                  }}
                >
                  {t.completed && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: t.completed ? 'rgba(255,255,255,.4)' : '#f1f5f9', fontWeight: 500, textDecoration: t.completed ? 'line-through' : 'none' }}>
                    {t.title}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
                    {t.due_date && (
                      <span style={{ fontSize: 11, color: new Date(t.due_date) < new Date() && !t.completed ? '#f87171' : 'rgba(255,255,255,.35)' }}>
                        📅 {formatDate(t.due_date)}
                      </span>
                    )}
                    {t.case_title && (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>📁 {t.case_title}</span>
                    )}
                    {t.contact_name && (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>👤 {t.contact_name}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>CRM</div>
      </div>

      <div style={s.tabs}>
        {[['contacts','Kontaktok'],['cases','Ügyek'],['tasks','Teendők']].map(([id,label]) => (
          <button key={id} style={s.tab(tab === id)} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'contacts' && renderContacts()}
      {tab === 'cases'    && renderCases()}
      {tab === 'tasks'    && renderTasks()}

      {/* Contact side panel */}
      {selectedContact && (
        <ContactPanel
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onEdit={() => {
            setEditContact(selectedContact)
            setSelectedContact(null)
            setShowContactModal(true)
          }}
          onDelete={() => deleteContact(selectedContact.id)}
        />
      )}

      {/* Case side panel */}
      {selectedCase && (
        <CasePanel
          caseItem={selectedCase}
          onClose={() => setSelectedCase(null)}
          onEdit={() => {
            setEditCase(selectedCase)
            setSelectedCase(null)
            setShowCaseModal(true)
          }}
        />
      )}

      {/* Contact modal */}
      {showContactModal && (
        <Modal title={editContact ? 'Kontakt szerkesztése' : 'Új kontakt'} onClose={() => { setShowContactModal(false); setEditContact(null) }}>
          <ContactForm
            initial={editContact || {}}
            onSave={saveContact}
            onCancel={() => { setShowContactModal(false); setEditContact(null) }}
          />
        </Modal>
      )}

      {/* Case modal */}
      {showCaseModal && (
        <Modal title={editCase ? 'Ügy szerkesztése' : 'Új ügy'} onClose={() => { setShowCaseModal(false); setEditCase(null) }}>
          <CaseForm
            contacts={contacts}
            initial={editCase || {}}
            onSave={saveCase}
            onCancel={() => { setShowCaseModal(false); setEditCase(null) }}
          />
        </Modal>
      )}

      {/* Task modal */}
      {showTaskModal && (
        <Modal title="Új teendő" onClose={() => setShowTaskModal(false)}>
          <TaskForm
            contacts={contacts}
            cases={cases}
            onSave={saveTask}
            onCancel={() => setShowTaskModal(false)}
          />
        </Modal>
      )}
    </div>
  )
}
