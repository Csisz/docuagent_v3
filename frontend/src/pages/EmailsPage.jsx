import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { api } from '../services/api'
import { useStore } from '../store'
import { StatusBadge, ConfBar, Skeleton } from '../components/ui'
import { useToast } from '../hooks'

const FILTERS = [null, 'NEW', 'AI_ANSWERED', 'NEEDS_ATTENTION', 'CLOSED']
const FILTER_LABELS = { null: 'Összes', NEW: 'NEW', AI_ANSWERED: 'AI_ANSWERED', NEEDS_ATTENTION: 'NEEDS_ATTENTION', CLOSED: 'CLOSED' }

export default function EmailsPage({ defaultFilter }) {
  const location = useLocation()
  const { emails, emailTotal, setEmails, updateEmailStatus } = useStore()
  const toast = useToast()
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState(null)
  // Local filter state — independent per route instance
  const [activeFilter, setActiveFilter] = useState(
    location.state?.filter ?? defaultFilter ?? null
  )
  const didMount = useRef(false)

  // Load on mount with the correct initial filter
  useEffect(() => {
    loadEmails(activeFilter)
  }, []) // eslint-disable-line

  // When navigating between /emails and /attention, re-run with new filter
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return }
    const f = location.state?.filter ?? defaultFilter ?? null
    setActiveFilter(f)
    loadEmails(f)
    setExpanded(null)
  }, [location.key, defaultFilter]) // eslint-disable-line

  async function loadEmails(filter) {
    setLoading(true)
    try {
      const d = await api.emails(filter)
      setEmails(d.emails || [], d.total || 0)
    } catch { toast('Backend nem elérhető', 'err') }
    finally { setLoading(false) }
  }

  function handleFilter(f) {
    setActiveFilter(f)
    loadEmails(f)
    setExpanded(null)
  }

  async function handleStatusChange(email, newStatus, sel) {
    if (email.status === newStatus) return
    try {
      const res = await api.updateStatus(email.id, newStatus)
      updateEmailStatus(email.id, newStatus)
      toast(`✓ ${email.status} → ${newStatus}${res.learning_stored ? ' · 🧠 tanulás' : ''}`, 'ok')
    } catch (e) {
      toast(`Hiba: ${e.message}`, 'err')
      sel.value = email.status
    }
  }

  return (
    <div className="animate-fade-up">
      <p className="text-[11.5px] text-zinc-500 font-mono mb-3">
        Státusz szerkesztés · Human-in-the-loop tanulás ·{' '}
        <span className="text-orange-400">🧠 LEARNED = AI tanult</span>
      </p>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px] text-zinc-600 font-mono font-semibold">Szűrő:</span>
        {FILTERS.map(f => (
          <button
            key={String(f)}
            onClick={() => handleFilter(f)}
            className={clsx(
              'px-3 py-1 rounded-full text-[11px] font-mono font-medium border transition-all',
              activeFilter === f
                ? 'bg-[#ff7820] border-[#ff7820] text-white'
                : 'bg-white/5 border-white/13 text-zinc-400 hover:border-[#ff7820]/50 hover:text-orange-400'
            )}
          >
            {FILTER_LABELS[String(f)]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-zinc-600">{emails.length} / {emailTotal}</span>
          <button className="btn-ghost text-[11px] px-3 py-1" onClick={() => loadEmails(activeFilter)}>↻</button>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/7">
                {['', 'Tárgy', 'Feladó', 'Kategória', 'Státusz', 'Konf.', 'Dátum', 'Módosítás'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-[9.5px] font-bold text-zinc-500 uppercase tracking-[.08em] font-mono bg-white/[.02] whitespace-nowrap first:w-6" style={h==='Státusz'?{minWidth:'160px'}:{}}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><Skeleton className="h-3" /></td>
                    ))}
                  </tr>
                ))
                : emails.length === 0
                ? <tr><td colSpan={8} className="text-center py-12 text-zinc-600">Nincs email</td></tr>
                : emails.map(e => (
                  <EmailRow
                    key={e.id}
                    email={e}
                    expanded={expanded === e.id}
                    onToggle={() => setExpanded(expanded === e.id ? null : e.id)}
                    onStatusChange={handleStatusChange}
                  />
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EmailRow({ email: e, expanded, onToggle, onStatusChange }) {
  let aiD = {}
  try { aiD = typeof e.ai_decision === 'string' ? JSON.parse(e.ai_decision) : e.ai_decision || {} } catch {}

  const catColor = { complaint: 'text-red-400', inquiry: 'text-blue-400', other: 'text-zinc-500' }[e.category] || 'text-zinc-500'
  const dt = e.created_at ? new Date(e.created_at).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  const statusBadge = {
    NEW:             <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-400/20 whitespace-nowrap">NEW</span>,
    AI_ANSWERED:     <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-400/20 whitespace-nowrap">✓ AI_ANSWERED</span>,
    NEEDS_ATTENTION: <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-400/20 whitespace-nowrap">⚠ NEEDS_ATTENTION</span>,
    CLOSED:          <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-zinc-500/15 text-zinc-400 border border-zinc-400/20 whitespace-nowrap">CLOSED</span>,
  }[e.status] || <span className="text-zinc-500 font-mono text-[10px] whitespace-nowrap">{e.status}</span>

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-orange-500/[.04] transition-colors">
        <td className="px-3 py-2.5">
          <button onClick={onToggle} className="text-zinc-600 hover:text-white text-[13px] transition-colors w-5 text-center">
            {expanded ? '▾' : '▸'}
          </button>
        </td>
        <td className="px-3 py-2.5 max-w-[200px]">
          <div className="flex items-center gap-1.5">
            {e.urgent && <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />}
            <span className="font-medium truncate">{e.subject || '(nincs tárgy)'}</span>
            {aiD.learned_override && (
              <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-400/25 flex-shrink-0">🧠</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 max-w-[150px]">
          <span className="text-[11px] font-mono text-zinc-500 truncate block">{e.sender || '—'}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className={clsx('text-[11px] font-mono', catColor)}>{e.category || '—'}</span>
        </td>
        <td className="px-3 py-2.5" style={{minWidth:'160px'}}>{statusBadge}</td>
        <td className="px-3 py-2.5"><ConfBar value={e.confidence} /></td>
        <td className="px-3 py-2.5">
          <span className="text-[11px] font-mono text-zinc-500 whitespace-nowrap">{dt}</span>
        </td>
        <td className="px-3 py-2.5">
          <select
            defaultValue={e.status}
            onChange={ev => onStatusChange(e, ev.target.value, ev.target)}
            className="text-[11px] font-mono bg-white/5 border border-white/13 rounded px-2 py-1 text-zinc-300 outline-none hover:border-orange-400/50 focus:border-orange-400 min-w-[140px] transition-colors"
          >
            {['NEW','AI_ANSWERED','NEEDS_ATTENTION','CLOSED'].map(s => (
              <option key={s} value={s} className="bg-[#0d0d24]">{s}</option>
            ))}
          </select>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-white/5">
          <td colSpan={8} className="px-4 py-3 bg-orange-500/[.04] border-t border-orange-400/15">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-[9.5px] font-mono text-zinc-500 uppercase tracking-[.08em] mb-1">Feladó</div>
                <div className="text-[13px] text-zinc-300">{e.sender || '—'}</div>
                <div className="text-[9.5px] font-mono text-zinc-500 uppercase tracking-[.08em] mt-3 mb-1">AI döntés</div>
                <pre className="text-[11px] font-mono text-zinc-400 bg-white/3 rounded p-2 overflow-auto max-h-24">{JSON.stringify(aiD, null, 2)}</pre>
              </div>
              <div>
                <div className="text-[9.5px] font-mono text-zinc-500 uppercase tracking-[.08em] mb-1">Email törzse</div>
                <div className="bg-white/3 border border-white/10 rounded-lg p-3 text-[12px] text-zinc-400 leading-relaxed min-h-[60px] max-h-[150px] overflow-auto whitespace-pre-wrap">
                  {e.body || <span className="text-zinc-600">Nincs tartalom</span>}
                </div>
              </div>
              <div>
                <div className="text-[9.5px] font-mono text-zinc-500 uppercase tracking-[.08em] mb-1 flex items-center gap-1.5">
                  AI válasz
                  {e.status === 'AI_ANSWERED' && !e.ai_response && (
                    <span className="text-[9px] text-amber-400 font-mono">(generálás folyamatban…)</span>
                  )}
                </div>
                <div className={`bg-white/3 rounded-lg p-3 text-[13px] leading-relaxed min-h-[60px] max-h-[150px] overflow-auto whitespace-pre-wrap ${
                  e.ai_response ? 'border border-green-400/20 text-zinc-300' : 'border border-orange-400/15 text-zinc-600'
                }`}>
                  {e.ai_response || 'Nincs AI válasz'}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
