import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Konstansok ────────────────────────────────────────────────

const ACTION_META = {
  approve:        { label: 'Jóváhagyás',   color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.25)' },
  reject:         { label: 'Elutasítás',   color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)' },
  edit_approve:   { label: 'Szerk.+Küld',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)' },
  upload:         { label: 'Feltöltés',    color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.25)' },
  delete:         { label: 'Törlés',       color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)' },
  apply_template: { label: 'Sablon',       color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)' },
  create:         { label: 'Létrehozás',   color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.25)' },
  update:         { label: 'Módosítás',    color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.25)' },
  toggle:         { label: 'Kapcsoló',     color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)' },
  status_change:  { label: 'Státusz',      color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)' },
}

const ENTITY_META = {
  email:    { icon: '📧', label: 'Email' },
  document: { icon: '📄', label: 'Dokumentum' },
  template: { icon: '🧩', label: 'Sablon' },
  agent:    { icon: '⚙️', label: 'Agent' },
}

const ACTION_FILTERS = [
  { value: '', label: 'Összes akció' },
  { value: 'approve',        label: 'Jóváhagyás' },
  { value: 'reject',         label: 'Elutasítás' },
  { value: 'edit_approve',   label: 'Szerk.+Küldés' },
  { value: 'upload',         label: 'Feltöltés' },
  { value: 'delete',         label: 'Törlés' },
  { value: 'apply_template', label: 'Sablon alkalmazás' },
  { value: 'create',         label: 'Létrehozás' },
  { value: 'update',         label: 'Módosítás' },
  { value: 'toggle',         label: 'Kapcsoló' },
]

const ENTITY_FILTERS = [
  { value: '', label: 'Összes entitás' },
  { value: 'email',    label: 'Email' },
  { value: 'document', label: 'Dokumentum' },
  { value: 'template', label: 'Sablon' },
  { value: 'agent',    label: 'Agent' },
]

// ── Időbélyeg formázás ────────────────────────────────────────

function relativeTime(iso) {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)  return `${diff} másodperce`
  if (diff < 3600) return `${Math.floor(diff / 60)} perce`
  if (diff < 86400) return `${Math.floor(diff / 3600)} órája`
  if (diff < 2592000) return `${Math.floor(diff / 86400)} napja`
  return new Date(iso).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })
}

function fullDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('hu-HU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

// ── CSV export ────────────────────────────────────────────────

function exportCSV(logs) {
  const headers = ['Időbélyeg', 'Felhasználó', 'Akció', 'Entitás típus', 'Entitás ID', 'Részletek']
  const rows = logs.map(r => [
    r.created_at || '',
    r.user_email || '',
    r.action,
    r.entity_type,
    r.entity_id || '',
    JSON.stringify(r.details || {}),
  ])
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── JSON Details panel ────────────────────────────────────────

function DetailsPanel({ details }) {
  if (!details || Object.keys(details).length === 0) {
    return <span style={{ color: '#475569', fontSize: 11 }}>—</span>
  }
  return (
    <pre style={{
      margin: 0, fontSize: 11, lineHeight: 1.6,
      color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      background: 'rgba(0,0,0,0.2)', borderRadius: 6,
      padding: '0.5rem 0.75rem', maxHeight: 120, overflowY: 'auto',
    }}>
      {JSON.stringify(details, null, 2)}
    </pre>
  )
}

// ── Fő oldal ─────────────────────────────────────────────────

export default function AuditPage() {
  const { authFetch } = useAuth()

  const [logs,        setLogs]        = useState([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [expanded,    setExpanded]    = useState(null)

  // Szűrők
  const [filterAction,  setFilterAction]  = useState('')
  const [filterEntity,  setFilterEntity]  = useState('')
  const [filterUser,    setFilterUser]    = useState('')
  const [page,          setPage]          = useState(0)
  const LIMIT = 50

  const load = useCallback(async (opts = {}) => {
    setLoading(true)
    setError('')
    try {
      const action  = opts.action  ?? filterAction
      const entity  = opts.entity  ?? filterEntity
      const user    = opts.user    ?? filterUser
      const offset  = (opts.page ?? page) * LIMIT

      const params = new URLSearchParams({ limit: LIMIT, offset })
      if (action) params.set('action',      action)
      if (entity) params.set('entity_type', entity)
      if (user)   params.set('user_email',  user)

      const res = await authFetch(`${API}/api/audit?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setLogs(json.logs || [])
      setTotal(json.total || 0)
    } catch (e) {
      setError(`Nem sikerült betölteni az audit naplót. (${e.message})`)
    } finally {
      setLoading(false)
    }
  }, [authFetch, filterAction, filterEntity, filterUser, page]) // eslint-disable-line

  useEffect(() => { load() }, []) // eslint-disable-line

  function applyFilters() {
    setPage(0)
    load({ page: 0 })
  }

  function resetFilters() {
    setFilterAction('')
    setFilterEntity('')
    setFilterUser('')
    setPage(0)
    load({ action: '', entity: '', user: '', page: 0 })
  }

  const totalPages = Math.ceil(total / LIMIT)

  // Stílusok
  const BG     = '#050d18'
  const CARD   = 'rgba(13,27,46,0.8)'
  const BORDER = 'rgba(255,255,255,0.08)'
  const TEXT   = '#e2e8f0'
  const MUTED  = '#64748b'

  const inputStyle = {
    background: '#0f172a', border: `1px solid ${BORDER}`,
    color: '#e2e8f0', borderRadius: 7, padding: '0.45rem 0.75rem',
    fontSize: 12, outline: 'none',
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>

      {/* Fejléc */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.3rem' }}>Audit Trail</h1>
          <p style={{ fontSize: 13, color: MUTED }}>
            Compliance napló — minden rendszerbeli esemény rögzítve.
            {total > 0 && <span style={{ marginLeft: 8, color: '#475569' }}>{total} bejegyzés összesen</span>}
          </p>
        </div>
        <button
          onClick={() => exportCSV(logs)}
          disabled={logs.length === 0}
          style={{
            padding: '0.6rem 1.25rem', borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)',
            color: '#38bdf8', cursor: logs.length ? 'pointer' : 'not-allowed',
            opacity: logs.length ? 1 : 0.4,
          }}
        >
          ↓ CSV export
        </button>
      </div>

      {/* Szűrők */}
      <div style={{
        display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end',
        padding: '1rem 1.25rem', borderRadius: 10,
        background: CARD, border: `1px solid ${BORDER}`,
        marginBottom: '1.25rem',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Akció</label>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
            {ACTION_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entitás</label>
          <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={{ ...inputStyle, minWidth: 140 }}>
            {ENTITY_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Felhasználó (email tartalmaz)</label>
          <input
            type="text" placeholder="pl. admin@..."
            value={filterUser} onChange={e => setFilterUser(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <button onClick={applyFilters} style={{ padding: '0.5rem 1.125rem', borderRadius: 7, fontSize: 12, fontWeight: 600, background: '#1a56db', color: 'white', border: 'none', cursor: 'pointer' }}>
          Szűrés
        </button>
        <button onClick={resetFilters} style={{ padding: '0.5rem 0.875rem', borderRadius: 7, fontSize: 12, background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, cursor: 'pointer' }}>
          Reset
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', fontSize: 13, color: '#f87171' }}>
          ⚠ {error}
        </div>
      )}

      {/* Táblázat */}
      <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        {/* Fejléc */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '140px 180px 110px 100px 1fr 32px',
          gap: '0 0.75rem',
          padding: '0.75rem 1rem',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: `1px solid ${BORDER}`,
          fontSize: 10, fontWeight: 700, color: MUTED,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          <span>Időbélyeg</span>
          <span>Felhasználó</span>
          <span>Akció</span>
          <span>Entitás</span>
          <span>Részletek / ID</span>
          <span />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: MUTED, fontSize: 13 }}>Betöltés…</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: MUTED, fontSize: 13 }}>
            {filterAction || filterEntity || filterUser ? 'Nincs a szűrési feltételeknek megfelelő bejegyzés.' : 'Még nincs audit bejegyzés. A rendszerbeli műveletek itt jelennek majd meg.'}
          </div>
        ) : logs.map((r, i) => {
          const actionMeta = ACTION_META[r.action] || { label: r.action, color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' }
          const entityMeta = ENTITY_META[r.entity_type] || { icon: '📦', label: r.entity_type }
          const isExpanded = expanded === r.id
          const isEven = i % 2 === 0

          return (
            <div key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
              {/* Fő sor */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 180px 110px 100px 1fr 32px',
                  gap: '0 0.75rem',
                  padding: '0.75rem 1rem',
                  alignItems: 'center',
                  background: isEven ? 'transparent' : 'rgba(255,255,255,0.01)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = isEven ? 'transparent' : 'rgba(255,255,255,0.01)'}
                onClick={() => setExpanded(isExpanded ? null : r.id)}
              >
                {/* Időbélyeg */}
                <div title={fullDate(r.created_at)}>
                  <div style={{ fontSize: 12, color: TEXT }}>{relativeTime(r.created_at)}</div>
                  <div style={{ fontSize: 10, color: MUTED, fontFamily: 'monospace' }}>{fullDate(r.created_at).slice(0, 10)}</div>
                </div>

                {/* Felhasználó */}
                <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }} title={r.user_email}>
                  {r.user_email || '—'}
                </div>

                {/* Akció badge */}
                <div>
                  <span style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 700,
                    padding: '0.2rem 0.6rem', borderRadius: 5,
                    color: actionMeta.color,
                    background: actionMeta.bg,
                    border: `1px solid ${actionMeta.border}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {actionMeta.label}
                  </span>
                </div>

                {/* Entitás */}
                <div style={{ fontSize: 12, color: MUTED }}>
                  <span style={{ marginRight: 4 }}>{entityMeta.icon}</span>
                  {entityMeta.label}
                </div>

                {/* ID / summary */}
                <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.details?.filename || r.details?.name || r.details?.subject || r.details?.template_name || ''}
                  {r.entity_id && (
                    <span style={{ color: '#334155', marginLeft: 6 }}>
                      #{r.entity_id.slice(0, 8)}
                    </span>
                  )}
                </div>

                {/* Expand gomb */}
                <div style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: isExpanded ? 'rgba(26,86,219,0.2)' : 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: isExpanded ? '#60a5fa' : MUTED,
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s',
                  flexShrink: 0,
                }}>
                  ▾
                </div>
              </div>

              {/* Kibontott részletek */}
              {isExpanded && (
                <div style={{
                  padding: '0.75rem 1rem 1rem',
                  background: 'rgba(0,0,0,0.2)',
                  borderTop: `1px solid ${BORDER}`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    Részletek
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem', marginBottom: '0.75rem', fontSize: 12 }}>
                    {[
                      ['Entitás ID', r.entity_id],
                      ['Felhasználó ID', r.user_id],
                      ['Pontos időpont', fullDate(r.created_at)],
                      ['Tenant ID', r.tenant_id],
                    ].map(([k, v]) => v && (
                      <div key={k}>
                        <span style={{ color: MUTED }}>{k}: </span>
                        <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <DetailsPanel details={r.details} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lapozó */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            onClick={() => { const p = Math.max(0, page - 1); setPage(p); load({ page: p }) }}
            disabled={page === 0}
            style={{ padding: '0.4rem 0.875rem', borderRadius: 7, fontSize: 12, background: 'transparent', border: `1px solid ${BORDER}`, color: page === 0 ? MUTED : TEXT, cursor: page === 0 ? 'not-allowed' : 'pointer' }}
          >
            ← Előző
          </button>
          <span style={{ fontSize: 12, color: MUTED, fontFamily: 'monospace' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => { const p = Math.min(totalPages - 1, page + 1); setPage(p); load({ page: p }) }}
            disabled={page >= totalPages - 1}
            style={{ padding: '0.4rem 0.875rem', borderRadius: 7, fontSize: 12, background: 'transparent', border: `1px solid ${BORDER}`, color: page >= totalPages - 1 ? MUTED : TEXT, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
          >
            Következő →
          </button>
        </div>
      )}
    </div>
  )
}
