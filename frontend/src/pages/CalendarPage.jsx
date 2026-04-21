import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { Skeleton } from '../components/ui'
import { useStore } from '../store'
import { api } from '../services/api'

// ── Konstansok ────────────────────────────────────────────────
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8)  // 08–19
const DAYS  = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']

const SOURCE_COLOR = {
  google:       '#1a56db',
  google_sync:  '#1a56db',  // legacy
  email_ai:     '#ff7820',
  manual:       '#4ade80',
}

function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day  // ISO week: H=1
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDateRange(weekStart) {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${weekStart.toLocaleDateString('hu-HU', opts)} – ${end.toLocaleDateString('hu-HU', { ...opts, year: 'numeric' })}`
}

// ── Event pill szín ───────────────────────────────────────────
function pillColor(ev) {
  if (ev.email_id) return SOURCE_COLOR.email_ai
  if (ev.source === 'google' || ev.source === 'google_sync') return SOURCE_COLOR.google
  return SOURCE_COLOR.manual
}

// ── Modals ────────────────────────────────────────────────────
function EventModal({ event, onClose, onDelete, theme }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const start = event.start_time ? new Date(event.start_time) : null
  const end   = event.end_time   ? new Date(event.end_time)   : null
  const color = pillColor(event)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme === 'light' ? 'white' : '#0f172a',
          border: `1px solid ${color}44`,
          borderTop: `3px solid ${color}`,
          borderRadius: 12, padding: '1.5rem',
          width: '90%', maxWidth: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Pill forrás jelző */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
            padding: '2px 8px', borderRadius: 999,
            background: `${color}22`, color, border: `1px solid ${color}55`,
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            {(event.source === 'google' || event.source === 'google_sync') ? 'Google' : event.email_id ? 'Email foglalás' : 'Manuális'}
          </span>
          <span style={{ fontSize: 11, color: '#71717a', fontFamily: 'monospace', marginLeft: 'auto' }}>
            {event.status || 'confirmed'}
          </span>
        </div>

        <div style={{
          fontSize: 17, fontWeight: 600,
          color: theme === 'light' ? '#0f172a' : '#f1f5f9',
          marginBottom: '1rem', lineHeight: 1.3,
        }}>
          {event.title}
        </div>

        {/* Időpont */}
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: '0.5rem' }}>
          🕐 {start?.toLocaleString('hu-HU', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {end && ` → ${end.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}`}
        </div>

        {/* Leírás */}
        {event.description && (
          <div style={{
            fontSize: 13, color: '#94a3b8', lineHeight: 1.6,
            marginBottom: '0.75rem',
            padding: '0.625rem 0.75rem',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)',
            whiteSpace: 'pre-wrap',
          }}>
            {event.description}
          </div>
        )}

        {/* Résztvevők */}
        {event.attendees?.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Résztvevők
            </div>
            {event.attendees.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0' }}>
                {a.name ? `${a.name} <${a.email}>` : a.email || a}
              </div>
            ))}
          </div>
        )}

        {/* Gombok */}
        <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          {event.email_id && (
            <a
              href={`/emails?id=${event.email_id}`}
              style={{
                padding: '0.4rem 0.875rem', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: 'rgba(255,120,32,0.12)', color: '#ff7820',
                border: '1px solid rgba(255,120,32,0.3)', textDecoration: 'none',
              }}
            >
              📧 Email megtekintése
            </a>
          )}
          <button
            onClick={() => onDelete(event.id)}
            style={{
              padding: '0.4rem 0.875rem', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: 'rgba(248,113,113,0.1)', color: '#f87171',
              border: '1px solid rgba(248,113,113,0.25)', cursor: 'pointer',
            }}
          >
            Törlés
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.4rem 0.875rem', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: 'transparent', color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
            }}
          >
            Bezárás
          </button>
        </div>
      </div>
    </div>
  )
}

function NewEventModal({ onClose, onSave, theme }) {
  const [title,       setTitle]       = useState('')
  const [startTime,   setStartTime]   = useState('')
  const [endTime,     setEndTime]     = useState('')
  const [description, setDescription] = useState('')
  const [attendee,    setAttendee]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  async function handleSave() {
    if (!title.trim()) { setError('A cím kötelező'); return }
    if (!startTime)     { setError('A kezdési időpont kötelező'); return }
    if (!endTime)       { setError('A befejezési időpont kötelező'); return }
    if (endTime <= startTime) { setError('A befejezés a kezdés után kell legyen'); return }

    setSaving(true)
    setError('')
    const data = {
      title:       title.trim(),
      start_time:  new Date(startTime).toISOString(),
      end_time:    new Date(endTime).toISOString(),
      description: description.trim() || null,
      attendees:   attendee.trim() ? [attendee.trim()] : [],
    }
    const ok = await onSave(data)
    if (!ok) { setSaving(false); setError('Mentési hiba, próbáld újra') }
  }

  const inputStyle = {
    width: '100%', padding: '0.5rem 0.75rem',
    background: theme === 'light' ? '#f8fafc' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${theme === 'light' ? '#e2e8f0' : 'rgba(255,255,255,0.12)'}`,
    borderRadius: 8, fontSize: 13, color: theme === 'light' ? '#0f172a' : '#e2e8f0',
    outline: 'none', fontFamily: 'inherit',
  }
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.06em' }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme === 'light' ? 'white' : '#0f172a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderTop: '3px solid #ff7820',
          borderRadius: 12, padding: '1.5rem',
          width: '90%', maxWidth: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: theme === 'light' ? '#0f172a' : '#f1f5f9', marginBottom: '1.25rem' }}>
          + Új naptár esemény
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label style={labelStyle}>Cím *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="pl. Demo call, Konzultáció..."
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Kezdés *</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Vége *</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Leírás</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Opcionális megjegyzés..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Meghívott email</label>
            <input
              type="email"
              value={attendee}
              onChange={e => setAttendee(e.target.value)}
              placeholder="pelda@email.com"
              style={inputStyle}
            />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', marginTop: '0.75rem' }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: 'transparent', color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
            }}
          >
            Mégse
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: saving ? 'rgba(255,120,32,0.5)' : '#ff7820', color: 'white',
              border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              minWidth: 80, transition: 'opacity 0.15s',
            }}
          >
            {saving ? 'Mentés...' : 'Létrehozás'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Fő komponens ─────────────────────────────────────────────
export default function CalendarPage() {
  const { authFetch } = useAuth()
  const { theme }     = useStore()
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const [weekStart,  setWeekStart]  = useState(() => getWeekStart(new Date()))
  const [events,     setEvents]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [syncing,    setSyncing]    = useState(false)
  const [selected,   setSelected]   = useState(null)  // EventModal
  const [showNew,    setShowNew]    = useState(false)  // NewEventModal
  const [syncStatus, setSyncStatus] = useState(null)  // { last_sync_at, status, webhook_configured }

  // ── API hívások ───────────────────────────────────────────
  const loadEvents = useCallback(async () => {
    setLoading(true)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    try {
      const res = await authFetch(
        `${apiUrl}/api/calendar/events?from_date=${weekStart.toISOString()}&to_date=${weekEnd.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [weekStart, apiUrl, authFetch])

  useEffect(() => { loadEvents() }, [loadEvents])

  // Load sync status once on mount
  useEffect(() => {
    api.calendarSyncStatus()
      .then(d => setSyncStatus(d))
      .catch(() => {})
  }, [])

  async function handleCreateEvent(data) {
    try {
      const res = await authFetch(`${apiUrl}/api/calendar/create`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (!res.ok) return false
      setShowNew(false)
      loadEvents()
      return true
    } catch { return false }
  }

  async function handleDeleteEvent(id) {
    try {
      await authFetch(`${apiUrl}/api/calendar/events/${id}`, { method: 'DELETE' })
      setSelected(null)
      setEvents(prev => prev.filter(e => e.id !== id))
    } catch (e) { console.error(e) }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await authFetch(`${apiUrl}/api/calendar/trigger-sync`, { method: 'POST' })
      if (res.status === 503) {
        // n8n sync webhook not configured — just refresh events from DB
        await loadEvents()
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Give n8n a moment to process, then reload
      await new Promise(r => setTimeout(r, 2000))
      await loadEvents()
      api.calendarSyncStatus().then(d => setSyncStatus(d)).catch(() => {})
    } catch (e) {
      console.error(e)
    } finally {
      setSyncing(false)
    }
  }

  // ── Hét napjai ────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  // Esemény → nap+óra slot
  function eventsForSlot(dayIndex, hour) {
    return events.filter(ev => {
      const dt = new Date(ev.start_time)
      const d  = new Date(weekStart)
      d.setDate(d.getDate() + dayIndex)
      return dt.getDate() === d.getDate() &&
             dt.getMonth() === d.getMonth() &&
             dt.getFullYear() === d.getFullYear() &&
             dt.getHours() === hour
    })
  }

  const today = new Date()
  const isToday = (d) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()

  // ── Stílusok ─────────────────────────────────────────────
  const isDark = theme !== 'light'
  const card   = isDark ? 'rgba(255,255,255,0.04)' : 'white'
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
  const text   = isDark ? '#e2e8f0'           : '#0f172a'
  const muted  = isDark ? '#64748b'           : '#94a3b8'

  return (
    <div style={{ color: text, fontFamily: 'inherit', height: '100%' }}>

      {/* ── Fejléc ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        {/* Hét navigáció */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            style={{
              padding: '0.375rem 0.625rem', borderRadius: 6, fontSize: 13,
              background: card, border: `1px solid ${border}`,
              color: text, cursor: 'pointer',
            }}
          >
            ‹ Előző
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 160, textAlign: 'center' }}>
            {formatDateRange(weekStart)}
          </span>
          <button
            onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            style={{
              padding: '0.375rem 0.625rem', borderRadius: 6, fontSize: 13,
              background: card, border: `1px solid ${border}`,
              color: text, cursor: 'pointer',
            }}
          >
            Következő ›
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            style={{
              padding: '0.375rem 0.625rem', borderRadius: 6, fontSize: 12,
              background: 'rgba(255,120,32,0.12)', border: '1px solid rgba(255,120,32,0.3)',
              color: '#ff7820', cursor: 'pointer', fontWeight: 500,
            }}
          >
            Ma
          </button>
        </div>

        {/* Jobb oldali gombok */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Sync status badge */}
          {syncStatus && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontFamily: 'monospace',
              color: syncStatus.status === 'error'  ? '#f87171'
                   : syncStatus.status === 'ok'     ? '#4ade80'
                   : '#64748b',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: syncStatus.status === 'error'  ? '#f87171'
                          : syncStatus.status === 'ok'     ? '#22c55e'
                          : '#475569',
                boxShadow: syncStatus.status === 'ok' ? '0 0 5px rgba(34,197,94,.5)' : 'none',
              }} />
              {syncStatus.last_sync_at
                ? `szinkron: ${new Date(syncStatus.last_sync_at).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                : syncStatus.webhook_configured ? 'soha' : 'n8n nincs konfigurálva'
              }
            </div>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: '0.375rem 0.75rem', borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: card, border: `1px solid ${border}`,
              color: muted, cursor: syncing ? 'not-allowed' : 'pointer',
              opacity: syncing ? 0.7 : 1,
            }}
          >
            {syncing ? '↻ Szinkronizálás...' : '↻ Szinkronizálás'}
          </button>
          <button
            onClick={() => setShowNew(true)}
            style={{
              padding: '0.375rem 0.875rem', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: '#ff7820', color: 'white', border: 'none', cursor: 'pointer',
            }}
          >
            + Új esemény
          </button>
        </div>
      </div>

      {/* ── Jelmagyarázat ── */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
        {[
          { color: SOURCE_COLOR.google,      label: 'Google Calendar' },
          { color: SOURCE_COLOR.email_ai,    label: 'Email foglalás' },
          { color: SOURCE_COLOR.manual,      label: 'Manuális' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: muted }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Heti nézet ── */}
      <div style={{
        background: card, borderRadius: 12,
        border: `1px solid ${border}`,
        overflow: 'hidden',
        fontSize: 12,
      }}>

        {/* Fejléc sor — napok */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '52px repeat(7, 1fr)',
          borderBottom: `1px solid ${border}`,
          background: isDark ? 'rgba(255,255,255,0.025)' : '#f1f5f9',
        }}>
          <div style={{ padding: '0.625rem 0.5rem' }} />
          {weekDays.map((d, i) => (
            <div
              key={i}
              style={{
                padding: '0.625rem 0.5rem', textAlign: 'center',
                borderLeft: `1px solid ${border}`,
                fontWeight: isToday(d) ? 700 : 500,
                color: isToday(d) ? '#ff7820' : text,
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.6 }}>{DAYS[i]}</div>
              <div style={{
                fontSize: 15, fontWeight: isToday(d) ? 700 : 500,
                color: isToday(d) ? '#ff7820' : text,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: '50%',
                background: isToday(d) ? 'rgba(255,120,32,0.15)' : 'transparent',
              }}>
                {d.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Sorok — órák */}
        {loading ? (
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {HOURS.map(h => <Skeleton key={h} className="h-8" />)}
          </div>
        ) : (
          HOURS.map(hour => (
            <div
              key={hour}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px repeat(7, 1fr)',
                borderBottom: `1px solid ${border}`,
                minHeight: 52,
              }}
            >
              {/* Óra label */}
              <div style={{
                padding: '0.375rem 0.5rem',
                color: muted, fontSize: 11, fontFamily: 'monospace',
                flexShrink: 0,
                borderRight: `1px solid ${border}`,
              }}>
                {String(hour).padStart(2, '0')}:00
              </div>

              {/* Nap cellák */}
              {weekDays.map((_, dayIdx) => {
                const slotEvents = eventsForSlot(dayIdx, hour)
                return (
                  <div
                    key={dayIdx}
                    style={{
                      padding: '3px 4px',
                      borderLeft: `1px solid ${border}`,
                      display: 'flex', flexDirection: 'column', gap: 2,
                      background: isToday(weekDays[dayIdx])
                        ? isDark ? 'rgba(255,120,32,0.03)' : 'rgba(255,120,32,0.04)'
                        : 'transparent',
                    }}
                  >
                    {slotEvents.map(ev => {
                      const color = pillColor(ev)
                      const isEmail = !!ev.email_id
                      return (
                        <div
                          key={ev.id}
                          onClick={() => setSelected(ev)}
                          title={ev.title}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 5,
                            fontSize: 11,
                            fontWeight: 500,
                            background: `${color}22`,
                            color: color,
                            border: `1px solid ${isEmail ? color : color + '55'}`,
                            borderLeft: `3px solid ${color}`,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.5,
                            transition: 'opacity 0.1s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                          {ev.title}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* ── Esemény összesítő ── */}
      {!loading && (
        <div style={{ marginTop: '0.75rem', fontSize: 11, color: muted, fontFamily: 'monospace' }}>
          {events.length} esemény ezen a héten
          {events.filter(e => e.email_id).length > 0 &&
            ` · ${events.filter(e => e.email_id).length} email foglalásból`}
        </div>
      )}

      {/* ── Modals ── */}
      {selected && (
        <EventModal
          event={selected}
          theme={theme}
          onClose={() => setSelected(null)}
          onDelete={handleDeleteEvent}
        />
      )}
      {showNew && (
        <NewEventModal
          theme={theme}
          onClose={() => setShowNew(false)}
          onSave={handleCreateEvent}
        />
      )}
    </div>
  )
}
