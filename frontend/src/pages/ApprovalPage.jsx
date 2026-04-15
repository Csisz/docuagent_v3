import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { useStore } from '../store'
import { useAuth } from '../context/AuthContext'
import { Skeleton } from '../components/ui'
import { useToast } from '../hooks'
import { CATEGORY_LABELS, SENTIMENT_LABELS } from '../constants/labels'

// ── Confidence szín ───────────────────────────────────────────
function confColor(v) {
  if (v == null) return '#64748b'
  const pct = Math.round(v * 100)
  if (pct >= 80) return '#4ade80'
  if (pct >= 60) return '#fbbf24'
  return '#f87171'
}
function confBg(v) {
  if (v == null) return 'rgba(100,116,139,0.1)'
  const pct = Math.round(v * 100)
  if (pct >= 80) return 'rgba(74,222,128,0.1)'
  if (pct >= 60) return 'rgba(251,191,36,0.1)'
  return 'rgba(248,113,113,0.1)'
}

// ── Relatív idő ───────────────────────────────────────────────
function relTime(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)  return `${diff}mp`
  if (diff < 3600) return `${Math.floor(diff / 60)}p`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ó`
  return `${Math.floor(diff / 86400)}n`
}

// ── Sürgőség badge ────────────────────────────────────────────
function UrgencyChip({ score, urgent }) {
  if (!urgent && score < 50) return null
  const high = urgent || score >= 76
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
      background: high ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.12)',
      color: high ? '#f87171' : '#fbbf24',
      border: `1px solid ${high ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.25)'}`,
      textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0,
    }}>
      {high ? '⚡ Sürgős' : '⚠ Figyelem'}
    </span>
  )
}

// ── RAG forrás lista ──────────────────────────────────────────
function RagSources({ sources }) {
  if (!sources?.length) return (
    <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>
      Nincs RAG forrás ehhez az emailhez
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {sources.map((s, i) => {
        const score = typeof s.score === 'number' ? s.score : 0
        const pct   = Math.round(score * 100)
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            padding: '0.375rem 0.625rem', borderRadius: 6,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📄 {s.filename || s.file || '—'}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
              color: confColor(score), background: confBg(score),
              padding: '1px 6px', borderRadius: 4,
            }}>
              {pct}%
            </span>
            {s.collection && (
              <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
                {s.collection}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// FŐ KOMPONENS
// ══════════════════════════════════════════════════════════════
export default function ApprovalPage() {
  const { theme } = useStore()
  const { isDemo } = useAuth()
  const toast = useToast()

  const [emails,   setEmails]   = useState([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)  // kiválasztott email
  const [replyTxt, setReplyTxt] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [acting,   setActing]   = useState(false)  // action in flight

  // CRM case link modal
  const [showLinkModal, setShowLinkModal]   = useState(false)
  const [linkCases,     setLinkCases]       = useState([])
  const [linkCaseId,    setLinkCaseId]      = useState('')
  const [linking,       setLinking]         = useState(false)

  const isDark = theme !== 'light'
  const bg     = isDark ? '#050d18'           : '#f8fafc'
  const card   = isDark ? '#0d1b2e'           : 'white'
  const border = isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0'
  const text   = isDark ? '#e2e8f0'           : '#0f172a'
  const muted  = isDark ? '#64748b'           : '#94a3b8'
  const subtle = isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9'

  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.approvalQueue()
      // Normalize rag_sources: ha stringként érkezne, parse-oljuk
      const emails = (d.emails || []).map(email => ({
        ...email,
        rag_sources: (() => {
          const src = email.rag_sources
          if (Array.isArray(src)) return src
          if (typeof src === 'string') {
            try { return JSON.parse(src) } catch { return [] }
          }
          return []
        })(),
      }))
      if (emails.length > 0) {
        console.debug('[ApprovalQueue] first email rag_sources:', emails[0].rag_sources, '| rag_confidence:', emails[0].rag_confidence)
      }
      setEmails(emails)
      setTotal(d.total || 0)
    } catch {
      toast('Jóváhagyási sor betöltése sikertelen', 'err')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line

  useEffect(() => { loadQueue() }, [loadQueue])

  // Kiválasztáskor reply textarea feltöltése
  useEffect(() => {
    if (selected) {
      setReplyTxt(selected.ai_response || '')
      setEditMode(false)
    }
  }, [selected?.id]) // eslint-disable-line

  function selectEmail(email) {
    setSelected(email)
    setActing(false)
  }

  function removeFromList(id) {
    setEmails(prev => prev.filter(e => e.id !== id))
    setTotal(prev => Math.max(0, prev - 1))
    setSelected(null)
  }

  async function handleApprove() {
    if (!selected) return
    setActing(true)
    try {
      await api.approveEmail(selected.id)
      toast('Email jóváhagyva és elküldve ✓', 'ok')
      removeFromList(selected.id)
    } catch (e) {
      toast(e.message || 'Jóváhagyás sikertelen', 'err')
      setActing(false)
    }
  }

  async function handleReject() {
    if (!selected) return
    setActing(true)
    try {
      await api.rejectEmail(selected.id, 'Kézzel elutasítva')
      toast('Email lezárva', 'ok')
      removeFromList(selected.id)
    } catch (e) {
      toast(e.message || 'Elutasítás sikertelen', 'err')
      setActing(false)
    }
  }

  async function openLinkModal() {
    setLinkCaseId('')
    try {
      const res = await api.crmCases()
      setLinkCases(res.cases || [])
    } catch {
      setLinkCases([])
    }
    setShowLinkModal(true)
  }

  async function handleLinkToCase() {
    if (!selected || !linkCaseId) return
    setLinking(true)
    try {
      await api.crmLinkEmail(linkCaseId, selected.id)
      toast('Email hozzárendelve az ügyhez ✓', 'ok')
      setShowLinkModal(false)
    } catch (e) {
      toast(e.message || 'Hozzárendelés sikertelen', 'err')
    } finally {
      setLinking(false)
    }
  }

  async function handleEditApprove() {
    if (!selected || !replyTxt.trim()) return
    setActing(true)
    try {
      await api.editAndApprove(selected.id, replyTxt.trim())
      toast('Szerkesztett válasz elküldve ✓', 'ok')
      removeFromList(selected.id)
    } catch (e) {
      toast(e.message || 'Küldés sikertelen', 'err')
      setActing(false)
    }
  }

  // ── Stílusok ─────────────────────────────────────────────
  const panelStyle = { background: card, border: `1px solid ${border}`, borderRadius: 12 }

  return (
    <div style={{ color: text, fontFamily: 'inherit', height: `calc(100vh - ${isDemo ? 158 : 130}px)`, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── Fejléc ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Jóváhagyásra vár</h1>
          <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
            {loading ? 'Betöltés...' : `${total} email vár emberi döntésre`}
          </div>
        </div>
        <button
          onClick={loadQueue}
          disabled={loading}
          style={{
            padding: '0.375rem 0.875rem', borderRadius: 6, fontSize: 12,
            background: subtle, border: `1px solid ${border}`,
            color: muted, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          ↻ Frissítés
        </button>
      </div>

      {/* ── Fő layout: lista + panel ── */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap: '0.875rem', flex: 1, minHeight: 0 }}>

        {/* ── EMAIL LISTA ── */}
        <div style={{ ...panelStyle, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '0.75rem 1rem', borderBottom: `1px solid ${border}`,
            fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            Várakozó emailek
          </div>
          <div style={{ overflow: 'y-auto', flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : emails.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: muted }}>
                <div style={{ fontSize: 32, marginBottom: '0.5rem' }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Nincs várakozó email</div>
                <div style={{ fontSize: 12, marginTop: '0.25rem' }}>Minden email feldolgozva!</div>
              </div>
            ) : emails.map(email => {
              const isSelected = selected?.id === email.id
              const confPct = Math.round((email.confidence || 0) * 100)
              return (
                <div
                  key={email.id}
                  onClick={() => selectEmail(email)}
                  style={{
                    padding: '0.75rem 1rem', cursor: 'pointer',
                    borderBottom: `1px solid ${border}`,
                    background: isSelected
                      ? isDark ? 'rgba(26,86,219,0.15)' : 'rgba(26,86,219,0.07)'
                      : 'transparent',
                    borderLeft: isSelected ? '3px solid #1a56db' : '3px solid transparent',
                    transition: 'background 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {email.urgent && <span style={{ color: '#f87171', marginRight: 4 }}>⚡</span>}
                      {email.subject || '(Tárgy nélkül)'}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0,
                      color: confColor(email.confidence),
                      background: confBg(email.confidence),
                      padding: '2px 6px', borderRadius: 4,
                    }}>
                      {confPct}%
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.sender}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.375rem' }}>
                    {email.category && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.06)', color: muted,
                        border: `1px solid ${border}`,
                      }}>
                        {CATEGORY_LABELS[email.category] || email.category}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: muted, marginLeft: 'auto' }}>
                      {relTime(email.created_at)} ezelőtt
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── JOBB PANEL ── */}
        {selected && (
          <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

            {/* Panel fejléc */}
            <div style={{
              padding: '0.875rem 1.25rem', borderBottom: `1px solid ${border}`,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                  <UrgencyChip score={selected.urgency_score} urgent={selected.urgent} />
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: confBg(selected.confidence),
                    color: confColor(selected.confidence),
                    fontWeight: 700, fontFamily: 'monospace',
                  }}>
                    {Math.round((selected.confidence || 0) * 100)}% konfidencia
                  </span>
                  {selected.sentiment && selected.sentiment !== 'neutral' && (
                    <span style={{ fontSize: 10, color: muted }}>
                      {SENTIMENT_LABELS[selected.sentiment] || selected.sentiment}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.subject || '(Tárgy nélkül)'}
                </div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                  {selected.sender} · {relTime(selected.created_at)} ezelőtt
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{ color: muted, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Tartalom */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Email szöveg */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                  Email szöveg
                </div>
                <div style={{
                  fontSize: 13, color: isDark ? '#94a3b8' : '#475569',
                  lineHeight: 1.7, whiteSpace: 'pre-wrap',
                  background: subtle, borderRadius: 8, padding: '0.75rem',
                  border: `1px solid ${border}`, maxHeight: 160, overflowY: 'auto',
                }}>
                  {selected.body || '(Üres)'}
                </div>
              </div>

              {/* AI válasz javaslat */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    AI válasz javaslat
                  </div>
                  {!editMode && (
                    <button
                      onClick={() => setEditMode(true)}
                      style={{ fontSize: 11, color: '#ff7820', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      ✏ Szerkesztés
                    </button>
                  )}
                  {editMode && (
                    <button
                      onClick={() => { setEditMode(false); setReplyTxt(selected.ai_response || '') }}
                      style={{ fontSize: 11, color: muted, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Visszavonás
                    </button>
                  )}
                </div>
                <textarea
                  value={replyTxt}
                  onChange={e => setReplyTxt(e.target.value)}
                  readOnly={!editMode}
                  rows={5}
                  placeholder="Nincs AI válasz javaslat..."
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '0.75rem', borderRadius: 8,
                    background: editMode
                      ? (isDark ? 'rgba(255,255,255,0.06)' : 'white')
                      : subtle,
                    border: `1px solid ${editMode ? '#ff7820' : border}`,
                    color: text, fontSize: 13, lineHeight: 1.7,
                    resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                    cursor: editMode ? 'text' : 'default',
                    transition: 'border-color 0.15s',
                  }}
                />
              </div>

              {/* RAG forrás dokumentumok */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                  Tudásbázis forrás
                  {selected.rag_confidence != null && (
                    <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', color: confColor(selected.rag_confidence) }}>
                      {Math.round(selected.rag_confidence * 100)}% relevancia
                    </span>
                  )}
                </div>
                <RagSources sources={selected.rag_sources} />
              </div>
            </div>

            {/* ── Akció gombok ── */}
            <div style={{
              padding: '1rem 1.25rem', borderTop: `1px solid ${border}`,
              display: 'flex', gap: '0.625rem', flexWrap: 'wrap',
            }}>
              {/* Jóváhagyás */}
              <button
                onClick={editMode ? handleEditApprove : handleApprove}
                disabled={acting || (!editMode && !selected.ai_response) || (editMode && !replyTxt.trim())}
                style={{
                  flex: 1, minWidth: 120, padding: '0.625rem 1rem',
                  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: acting ? 'rgba(74,222,128,0.25)' : 'rgba(74,222,128,0.15)',
                  color: '#4ade80', border: '1px solid rgba(74,222,128,0.35)',
                  opacity: (acting || (!editMode && !selected.ai_response) || (editMode && !replyTxt.trim())) ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {acting ? '⏳ Küldés...' : editMode ? '✏ Szerkesztve küld' : '✓ Jóváhagyás + Küldés'}
              </button>

              {/* Szerkesztés toggle (ha nem edit módban) */}
              {!editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  disabled={acting}
                  style={{
                    flex: 1, minWidth: 100, padding: '0.625rem 1rem',
                    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(255,120,32,0.1)',
                    color: '#ff7820', border: '1px solid rgba(255,120,32,0.3)',
                    opacity: acting ? 0.5 : 1,
                  }}
                >
                  ✏ Szerkesztés
                </button>
              )}

              {/* Elutasítás */}
              <button
                onClick={handleReject}
                disabled={acting}
                style={{
                  flex: 1, minWidth: 100, padding: '0.625rem 1rem',
                  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: 'rgba(248,113,113,0.1)',
                  color: '#f87171', border: '1px solid rgba(248,113,113,0.3)',
                  opacity: acting ? 0.5 : 1,
                }}
              >
                ✕ Elutasítás
              </button>

              {/* Ügyhez rendelés */}
              <button
                onClick={openLinkModal}
                disabled={acting}
                style={{
                  flex: 1, minWidth: 100, padding: '0.625rem 1rem',
                  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: 'rgba(124,58,237,0.1)',
                  color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)',
                  opacity: acting ? 0.5 : 1,
                }}
              >
                + Ügyhez
              </button>
            </div>
          </div>
        )}

        {/* Üres állapot — ha nincs kiválasztott */}
        {!selected && !loading && emails.length > 0 && (
          <div style={{
            ...panelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: muted, fontSize: 14,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: '0.625rem' }}>👈</div>
              <div>Válassz ki egy emailt a listából</div>
            </div>
          </div>
        )}
      </div>

      {/* ── CRM case link modal ── */}
      {showLinkModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowLinkModal(false)}
        >
          <div
            style={{ background: isDark ? '#0f172a' : '#fff', border: `1px solid ${border}`, borderRadius: 14, padding: 24, width: 420, maxWidth: '92vw' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: text }}>Email hozzárendelése ügyhez</div>
              <button onClick={() => setShowLinkModal(false)} style={{ color: muted, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {linkCases.length === 0 ? (
              <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>Nincs meglévő ügy. Hozz létre egyet a CRM oldalon.</div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Válassz ügyet</label>
                <select
                  value={linkCaseId}
                  onChange={e => setLinkCaseId(e.target.value)}
                  style={{ width: '100%', background: isDark ? 'rgba(255,255,255,.06)' : '#f8fafc', border: `1px solid ${border}`, borderRadius: 8, color: text, padding: '8px 12px', fontSize: 13, outline: 'none' }}
                >
                  <option value="">— válassz ügyet —</option>
                  {linkCases.map(c => (
                    <option key={c.id} value={c.id}>{c.title} ({c.status})</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLinkModal(false)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'none', color: muted, border: `1px solid ${border}` }}>
                Mégse
              </button>
              <button
                onClick={handleLinkToCase}
                disabled={!linkCaseId || linking}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#7c3aed', color: '#fff', border: 'none', opacity: (!linkCaseId || linking) ? 0.5 : 1 }}
              >
                {linking ? 'Mentés...' : 'Hozzárendelés'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
