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

// ── Entitás kinyerés (kliens oldali, regex-alapú) ────────────
const TAX_KEYWORDS = ['nav','kata','áfa','szja','adó','bevallás','adóhatóság','iparűzési','hipa','eva']
const INVOICE_KEYWORDS = ['számla','díjbekérő','fizetés','tartozás','kiegyenlítés','számlakorrekció','stornó','jóváírás']

function extractEntities(text) {
  if (!text) return { invoice_ids: [], amounts: [], dates: [], has_tax: false }
  const lower = text.toLowerCase()

  const invoiceRe = /(?:számlaszám|számla|inv|ref|szt)[:\-\s#]*([A-Z0-9\-\/]{4,20})/gi
  const invoice_ids = [...new Set([...(text.matchAll(invoiceRe) || [])].map(m => m[1].trim()))].slice(0, 5)

  const amountRe = /(\d[\d\s.,]{1,12})\s*(ft|huf|eur|€|usd|\$)/gi
  const amounts = [...new Set([...(text.matchAll(amountRe) || [])].map(m => `${m[1].replace(/\s/g,'\u202f')} ${m[2].toUpperCase()}`))].slice(0, 5)

  const dateRe = /\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2}\.?|\d{4}\.\s*\w+\s*\d{1,2}\.?/g
  const dates = [...new Set((text.match(dateRe) || []).map(d => d.trim()))].slice(0, 4)

  const has_tax = TAX_KEYWORDS.some(k => lower.includes(k))

  return { invoice_ids, amounts, dates, has_tax }
}

function EntityPanel({ email }) {
  const text = `${email.subject || ''} ${email.body || ''}`
  const { invoice_ids, amounts, dates, has_tax } = extractEntities(text)

  if (!invoice_ids.length && !amounts.length && !dates.length && !has_tax) return null

  return (
    <div style={{
      background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)',
      borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.625rem' }}>
        Azonosított adatok
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {has_tax && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
            background: 'rgba(248,113,113,0.15)', color: '#f87171',
            border: '1px solid rgba(248,113,113,0.3)',
          }}>
            🔴 NAV vagy adó tartalom észlelve
          </span>
        )}
        {invoice_ids.map(id => (
          <span key={id} style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 6,
            background: 'rgba(96,165,250,0.12)', color: '#60a5fa',
            border: '1px solid rgba(96,165,250,0.25)',
            fontFamily: 'monospace',
          }}>
            🧾 {id}
          </span>
        ))}
        {amounts.map(a => (
          <span key={a} style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 6,
            background: 'rgba(74,222,128,0.1)', color: '#4ade80',
            border: '1px solid rgba(74,222,128,0.25)',
            fontFamily: 'monospace',
          }}>
            💰 {a}
          </span>
        ))}
        {dates.map(d => (
          <span key={d} style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 6,
            background: 'rgba(167,139,250,0.1)', color: '#a78bfa',
            border: '1px solid rgba(167,139,250,0.25)',
            fontFamily: 'monospace',
          }}>
            📅 {d}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── RAG forrás lista (collapsible, bizonyossági figyelmeztetéssel) ────
function SourceTrustPanel({ sources, confidence }) {
  const [open, setOpen] = useState(false)
  const lowConf = confidence != null && confidence < 0.6
  const uniqueSources = sources
    ? [...new Map(
        [...sources]
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .map(s => [s.filename, s])
      ).values()]
      .slice(0, 3)
    : []

  return (
    <div style={{
      border: `1px solid ${lowConf ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 8,
      background: lowConf ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.5rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer',
          color: '#94a3b8', fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Mire támaszkodott az AI?
          {confidence != null && (
            <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', color: confColor(confidence) }}>
              {Math.round(confidence * 100)}% relevancia
            </span>
          )}
        </span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {lowConf && (
            <div style={{
              fontSize: 11, padding: '0.375rem 0.625rem', borderRadius: 6, marginBottom: '0.375rem',
              background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
              border: '1px solid rgba(251,191,36,0.25)',
            }}>
              ⚠ Alacsony bizonyossági szint — ajánlott emberi felülvizsgálat
            </div>
          )}
          {!uniqueSources.length ? (
            <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', padding: '0.25rem 0' }}>
              Általános tudás alapján (nem talált releváns dokumentumot)
            </div>
          ) : uniqueSources.map((s, i) => {
            const score = typeof s.score === 'number' ? s.score : 0
            const pct   = Math.round(score * 100)
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: '0.375rem 0.625rem', borderRadius: 6,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📄 {s.filename || s.file || '—'}
                </span>
                <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: confColor(score), transition: 'width 0.3s' }} />
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                  color: confColor(score), background: confBg(score),
                  padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                }}>
                  {pct}%
                </span>
                {s.collection && (
                  <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', flexShrink: 0 }}>
                    {s.collection}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Számla kinyerés kártya ────────────────────────────────────
function InvoiceCard({ emailId, toast }) {
  const [extraction, setExtraction] = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [edit,       setEdit]       = useState({})
  const [loaded,     setLoaded]     = useState(false)

  useEffect(() => {
    setExtraction(null)
    setLoaded(false)
    setEdit({})
    api.getInvoiceForEmail(emailId)
      .then(d => {
        if (d.extraction) {
          setExtraction(d.extraction)
          setEdit(d.extraction)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [emailId])

  async function handleExtract() {
    setLoading(true)
    try {
      const d = await api.extractInvoice(emailId)
      setExtraction(d.extraction)
      setEdit(d.extraction || {})
      toast && toast('Számla adatok kinyerve ✓', 'ok')
    } catch (e) {
      toast && toast(e.message || 'Kinyerés sikertelen', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!extraction?.id) return
    setSaving(true)
    try {
      const d = await api.verifyInvoice(extraction.id, {
        invoice_number: edit.invoice_number || null,
        vendor_name: edit.vendor_name || null,
        amount: edit.amount ? parseFloat(edit.amount) : null,
        currency: edit.currency || 'HUF',
        due_date: edit.due_date || null,
        issue_date: edit.issue_date || null,
        vat_amount: edit.vat_amount ? parseFloat(edit.vat_amount) : null,
      })
      setExtraction(d.extraction)
      toast && toast('Számla adatok mentve ✓', 'ok')
    } catch (e) {
      toast && toast(e.message || 'Mentés sikertelen', 'err')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  const hasInvoice = !!extraction

  return (
    <div style={{
      border: '1px solid rgba(96,165,250,0.2)',
      borderRadius: 8, background: 'rgba(96,165,250,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.625rem 0.875rem',
        borderBottom: hasInvoice ? '1px solid rgba(96,165,250,0.15)' : 'none',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Számla adatok
          {extraction?.status === 'verified' && (
            <span style={{ marginLeft: 8, color: '#4ade80', fontSize: 10 }}>● Ellenőrzött</span>
          )}
        </div>
        <button
          onClick={handleExtract}
          disabled={loading}
          style={{
            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, cursor: loading ? 'not-allowed' : 'pointer',
            background: 'rgba(96,165,250,0.15)', color: '#60a5fa',
            border: '1px solid rgba(96,165,250,0.3)',
          }}
        >
          {loading ? '⏳ Kinyerés...' : hasInvoice ? '↻ Újrakinyerés' : '🔍 Számla kinyerése'}
        </button>
      </div>

      {hasInvoice && (
        <div style={{ padding: '0.75rem 0.875rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem', marginBottom: '0.75rem' }}>
            {[
              { key: 'invoice_number', label: 'Számlaszám' },
              { key: 'vendor_name',    label: 'Kibocsátó' },
              { key: 'amount',         label: 'Összeg' },
              { key: 'currency',       label: 'Deviza' },
              { key: 'due_date',       label: 'Fizetési határidő' },
              { key: 'issue_date',     label: 'Kiállítás dátuma' },
              { key: 'vat_amount',     label: 'ÁFA összeg' },
            ].map(({ key, label }) => (
              <div key={key}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{label}</div>
                <input
                  value={edit[key] ?? ''}
                  onChange={e => setEdit(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="—"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(96,165,250,0.2)',
                    borderRadius: 5, padding: '4px 8px', fontSize: 12, color: '#e2e8f0',
                    outline: 'none', fontFamily: 'monospace',
                  }}
                />
              </div>
            ))}
          </div>
          {extraction.confidence != null && (
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: '0.5rem' }}>
              AI bizonyossági szint: {Math.round(extraction.confidence * 100)}%
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1, padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                background: 'rgba(74,222,128,0.15)', color: '#4ade80',
                border: '1px solid rgba(74,222,128,0.3)',
              }}
            >
              {saving ? '⏳ Mentés...' : '💾 Mentés'}
            </button>
            <button
              disabled
              title="Billingo integráció — Phase 7"
              style={{
                flex: 1, padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'not-allowed',
                background: 'rgba(255,255,255,0.04)', color: '#475569',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              📤 Küldés Billingo-ba (hamarosan)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// FŐ KOMPONENS
// ══════════════════════════════════════════════════════════════
export default function ApprovalPage() {
  const { theme } = useStore()
  const { isDemo, user } = useAuth()
  const toast = useToast()

  const [emails,   setEmails]   = useState([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)  // kiválasztott email
  const [replyTxt, setReplyTxt] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [acting,   setActing]   = useState(false)  // action in flight
  const [ocrJob,   setOcrJob]   = useState(null)   // OCR job for selected email
  const [ocrLoading, setOcrLoading] = useState(false)

  const isAdmin = user?.role === 'admin'

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
    setOcrJob(null)
  }

  async function triggerOCR() {
    if (!selected) return
    setOcrLoading(true)
    try {
      const r = await api.triggerEmailOCR(selected.id)
      setOcrJob(r)
      if (r.status === 'done' || r.reused) {
        const job = await api.getOCRJob(r.job_id)
        setOcrJob(job)
      } else {
        // Poll until done
        const poll = setInterval(async () => {
          const job = await api.getOCRJob(r.job_id)
          setOcrJob(job)
          if (job.status === 'done' || job.status === 'failed') clearInterval(poll)
        }, 2500)
      }
    } catch (e) {
      toast('OCR indítása sikertelen', 'err')
    } finally {
      setOcrLoading(false)
    }
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
                  {selected.senior_required && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
                      border: '1px solid rgba(167,139,250,0.35)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                    }}>
                      ⭐ Senior jóváhagyás szükséges
                    </span>
                  )}
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

              {/* Entitás panel */}
              <EntityPanel email={selected} />

              {/* OCR panel */}
              <div style={{ border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: subtle, borderBottom: ocrJob ? `1px solid ${border}` : 'none' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Számla OCR
                    {ocrJob && <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', fontSize: 10, color: ocrJob.status === 'done' ? '#10b981' : ocrJob.status === 'failed' ? '#ef4444' : '#f59e0b' }}>
                      {ocrJob.status === 'done' ? `${Math.round((ocrJob.confidence || 0) * 100)}% bizalom` : ocrJob.status === 'failed' ? 'Hiba' : 'Folyamatban…'}
                    </span>}
                  </span>
                  <button
                    onClick={triggerOCR}
                    disabled={ocrLoading || ocrJob?.status === 'running' || ocrJob?.status === 'pending'}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: '#059669', color: '#fff', border: 'none', cursor: ocrLoading ? 'not-allowed' : 'pointer', opacity: ocrLoading ? 0.6 : 1 }}
                  >
                    {ocrLoading ? '…' : ocrJob ? 'Újrafuttatás' : 'OCR indítása'}
                  </button>
                </div>
                {ocrJob?.extracted_json && (
                  <div style={{ padding: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      ['Számlaszám', ocrJob.extracted_json.invoice_number],
                      ['Kibocsátó', ocrJob.extracted_json.vendor_name],
                      ['Bruttó', ocrJob.extracted_json.gross_amount != null ? `${ocrJob.extracted_json.gross_amount.toLocaleString('hu-HU')} ${ocrJob.extracted_json.currency || 'HUF'}` : null],
                      ['ÁFA', ocrJob.extracted_json.tax_rate != null ? `${ocrJob.extracted_json.tax_rate}%` : null],
                      ['Esedékes', ocrJob.extracted_json.due_date],
                      ['Fizetési mód', ocrJob.extracted_json.payment_method],
                    ].filter(([, v]) => v != null).map(([label, value]) => (
                      <div key={label} style={{ background: subtle, borderRadius: 5, padding: '5px 8px', border: `1px solid ${border}` }}>
                        <div style={{ fontSize: 9, color: muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                        <div style={{ fontSize: 12, color: text, fontWeight: 500, marginTop: 1 }}>{String(value)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {ocrJob?.error_message && (
                  <div style={{ padding: '0.5rem 0.75rem', fontSize: 12, color: '#f87171' }}>{ocrJob.error_message}</div>
                )}
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

              {/* RAG forrás dokumentumok — collapsible */}
              <SourceTrustPanel sources={selected.rag_sources} confidence={selected.rag_confidence} />

              {/* Invoice extraction card */}
              <InvoiceCard emailId={selected.id} toast={toast} />
            </div>

            {/* ── Akció gombok ── */}
            <div style={{
              padding: '1rem 1.25rem', borderTop: `1px solid ${border}`,
              display: 'flex', gap: '0.625rem', flexWrap: 'wrap',
            }}>
              {/* Jóváhagyás */}
              {selected.senior_required && !isAdmin ? (
                <div style={{
                  flex: 1, minWidth: 120, padding: '0.625rem 1rem',
                  borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: 'rgba(167,139,250,0.08)', color: '#a78bfa',
                  border: '1px solid rgba(167,139,250,0.25)',
                  textAlign: 'center',
                }}>
                  ⭐ Senior jóváhagyás szükséges
                </div>
              ) : (
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
              )}

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
