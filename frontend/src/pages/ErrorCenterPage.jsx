import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'

const TRIGGER_LABELS = {
  doc_ingest:      'Dokumentum indexelés',
  email_classify:  'Email osztályozás',
  invoice_extract: 'Számla kinyerés',
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })
}

function RunRow({ run, onRetry }) {
  const [retrying, setRetrying] = useState(false)
  const [retried,  setRetried]  = useState(false)
  const [err, setErr] = useState('')

  async function handleRetry() {
    setRetrying(true)
    setErr('')
    try {
      await onRetry(run.id)
      setRetried(true)
    } catch (e) {
      setErr(e.message || 'Hiba történt')
    } finally {
      setRetrying(false)
    }
  }

  const triggerLabel = TRIGGER_LABELS[run.trigger_type] || run.trigger_type

  return (
    <div style={{
      background: 'rgba(248,113,113,0.06)',
      border: '1px solid rgba(248,113,113,0.2)',
      borderRadius: 10,
      padding: '14px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: '#f87171', background: 'rgba(248,113,113,0.13)',
              border: '1px solid rgba(248,113,113,0.25)', borderRadius: 4, padding: '2px 7px',
            }}>{triggerLabel}</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>{fmtDate(run.created_at)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
            {run.input_summary || '—'}
          </div>
          {run.error_message && (
            <div style={{
              marginTop: 6, fontSize: 12, color: '#fca5a5',
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.15)',
              borderRadius: 6, padding: '6px 10px',
              fontFamily: 'monospace', wordBreak: 'break-word',
            }}>
              {run.error_message}
            </div>
          )}
          {run.latency_ms && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
              Futásidő: {run.latency_ms}ms
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          {retried ? (
            <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>✓ Újraindítva</span>
          ) : (
            <button
              onClick={handleRetry}
              disabled={retrying}
              style={{
                background: retrying ? 'rgba(248,113,113,0.15)' : 'rgba(248,113,113,0.2)',
                border: '1px solid rgba(248,113,113,0.4)',
                color: '#f87171', borderRadius: 7, padding: '6px 14px',
                fontSize: 12, fontWeight: 600, cursor: retrying ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {retrying ? 'Folyamatban…' : 'Újrapróbálás'}
            </button>
          )}
        </div>
      </div>
      {err && <div style={{ fontSize: 12, color: '#f87171' }}>Hiba: {err}</div>}
    </div>
  )
}

export default function ErrorCenterPage() {
  const [runs, setRuns]         = useState([])
  const [loading, setLoad]      = useState(true)
  const [error, setError]       = useState('')
  const [archived, setArchived] = useState(new Set())
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    setLoad(true)
    setError('')
    try {
      const data = await api.getFailedRuns(100)
      setRuns(data.runs || [])
    } catch (e) {
      setError('Nem sikerült betölteni a hibás futásokat.')
    } finally {
      setLoad(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Auto-refresh every 30s
    pollRef.current = setInterval(load, 30_000)
    return () => clearInterval(pollRef.current)
  }, [load])

  async function handleRetry(runId) {
    await api.retryRun(runId)
    // Refresh after brief delay to pick up status change
    setTimeout(load, 2000)
  }

  function handleArchive(runId) {
    setArchived(prev => new Set([...prev, runId]))
  }

  function handleArchiveAll() {
    setArchived(new Set(runs.map(r => r.id)))
  }

  const visibleRuns = runs.filter(r => !archived.has(r.id))

  return (
    <div style={{ padding: '32px 28px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>
            Hibák &amp; Újrapróbálás
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Sikertelen agent futások — manuális újraindítás lehetőséggel
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {archived.size > 0 && (
            <button
              onClick={() => setArchived(new Set())}
              style={{
                background: 'rgba(100,116,139,0.15)', border: '1px solid rgba(100,116,139,0.3)',
                color: '#94a3b8', borderRadius: 8, padding: '7px 14px',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              Archív mutatása ({archived.size})
            </button>
          )}
          {visibleRuns.length > 0 && (
            <button
              onClick={handleArchiveAll}
              style={{
                background: 'rgba(100,116,139,0.15)', border: '1px solid rgba(100,116,139,0.3)',
                color: '#94a3b8', borderRadius: 8, padding: '7px 14px',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              Összes archiválása
            </button>
          )}
          <button
            onClick={load}
            style={{
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)',
              color: '#818cf8', borderRadius: 8, padding: '7px 16px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Frissítés
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ color: '#64748b', fontSize: 14, textAlign: 'center', padding: '48px 0' }}>
          Betöltés…
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 10, padding: '14px 18px', color: '#f87171', fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {!loading && !error && visibleRuns.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '64px 0',
          color: '#64748b', fontSize: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: 16 }}>Nincs hibás futás</div>
          <div style={{ marginTop: 6 }}>Minden agent futás sikeresen befejeződött.</div>
        </div>
      )}

      {!loading && visibleRuns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            {visibleRuns.length} hibás futás{archived.size > 0 ? ` · ${archived.size} archivált` : ''}
          </div>
          {visibleRuns.map(run => (
            <div key={run.id} style={{ position: 'relative' }}>
              <RunRow run={run} onRetry={handleRetry} />
              <button
                onClick={() => handleArchive(run.id)}
                title="Archiválás"
                style={{
                  position: 'absolute', top: 10, right: 10,
                  background: 'none', border: 'none', color: 'rgba(100,116,139,.5)',
                  fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: 4,
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
