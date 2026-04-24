import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'

const STATUS_COLOR = {
  pending: '#f59e0b',
  running: '#3b82f6',
  done:    '#10b981',
  failed:  '#ef4444',
}
const STATUS_LABEL = {
  pending: 'Várakozik',
  running: 'Fut',
  done:    'Kész',
  failed:  'Hiba',
}

function StatusBadge({ status }) {
  return (
    <span style={{
      background: STATUS_COLOR[status] || '#6b7280',
      color: '#fff',
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function ConfidenceBar({ value }) {
  if (value == null) return <span style={{ color: '#6b7280' }}>—</span>
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block', width: 60, height: 6,
        background: '#374151', borderRadius: 3, overflow: 'hidden',
      }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color }} />
      </span>
      <span style={{ fontSize: 12, color }}>{pct}%</span>
    </span>
  )
}

export default function OCRCenterPage() {
  const [jobs, setJobs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [batchIds, setBatchIds] = useState('')
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchResult, setBatchResult]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.getOCRJobs(200, statusFilter || null)
      setJobs(d.jobs || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  // Auto-refresh while any job is running/pending
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'running')
    if (!hasActive) return
    const t = setTimeout(() => load(), 5000)
    return () => clearTimeout(t)
  }, [jobs, load])

  const handleBatch = async () => {
    const ids = batchIds.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    if (!ids.length) return
    setBatchRunning(true)
    setBatchResult(null)
    try {
      const r = await api.batchOCR(ids)
      setBatchResult(r)
      load()
    } catch (e) {
      setBatchResult({ error: String(e) })
    } finally {
      setBatchRunning(false)
    }
  }

  const exportCSV = () => {
    const header = 'job_id,email_subject,status,confidence,latency_ms,cost_usd,created_at'
    const rows = jobs.map(j =>
      [j.id, `"${(j.email_subject || '').replace(/"/g, '""')}"`,
       j.status, j.confidence ?? '', j.latency_ms ?? '', j.cost_usd ?? '',
       j.created_at || ''].join(',')
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `ocr_jobs_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `ocr_jobs_${new Date().toISOString().slice(0,10)}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const cell = { padding: '8px 12px', borderBottom: '1px solid #1f2937', fontSize: 13, color: '#d1d5db' }
  const hcell = { ...cell, color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ color: '#f9fafb', fontSize: 22, fontWeight: 700, margin: 0 }}>OCR Center</h1>
        <span style={{ color: '#6b7280', fontSize: 13 }}>{jobs.length} job</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ background: '#1f2937', color: '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '5px 10px', fontSize: 13 }}
          >
            <option value="">Összes státusz</option>
            <option value="pending">Várakozik</option>
            <option value="running">Fut</option>
            <option value="done">Kész</option>
            <option value="failed">Hiba</option>
          </select>
          <button onClick={load} style={{ background: '#374151', color: '#d1d5db', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>
            Frissítés
          </button>
          <button onClick={exportCSV} style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>
            CSV
          </button>
          <button onClick={exportJSON} style={{ background: '#374151', color: '#d1d5db', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>
            JSON
          </button>
        </div>
      </div>

      {/* Batch trigger */}
      <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
          Batch OCR indítása
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <textarea
            value={batchIds}
            onChange={e => setBatchIds(e.target.value)}
            placeholder="Email ID-k, vesszővel vagy soronként (max 20)"
            rows={3}
            style={{ flex: 1, background: '#111827', color: '#d1d5db', border: '1px solid #374151', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
          />
          <button
            onClick={handleBatch}
            disabled={batchRunning || !batchIds.trim()}
            style={{ background: batchRunning ? '#374151' : '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 18px', cursor: batchRunning ? 'not-allowed' : 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
          >
            {batchRunning ? 'Folyamatban…' : 'Batch indítás'}
          </button>
        </div>
        {batchResult && (
          <div style={{ marginTop: 10, fontSize: 12, color: batchResult.error ? '#ef4444' : '#10b981' }}>
            {batchResult.error
              ? `Hiba: ${batchResult.error}`
              : `Elindítva: ${batchResult.queued} | Kihagyva: ${batchResult.skipped}`}
          </div>
        )}
      </div>

      {/* Jobs table */}
      <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Betöltés…</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Nincs OCR job</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#111827' }}>
                <th style={hcell}>Email</th>
                <th style={hcell}>Státusz</th>
                <th style={hcell}>Bizalom</th>
                <th style={hcell}>Késleltetés</th>
                <th style={hcell}>Létrehozva</th>
                <th style={hcell}></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(selected?.id === job.id ? null : job)}>
                  <td style={cell}>
                    <div style={{ fontWeight: 500, color: '#f3f4f6', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.email_subject || '(nincs tárgy)'}
                    </div>
                    {job.email_sender && <div style={{ fontSize: 11, color: '#6b7280' }}>{job.email_sender}</div>}
                  </td>
                  <td style={cell}><StatusBadge status={job.status} /></td>
                  <td style={cell}><ConfidenceBar value={job.confidence} /></td>
                  <td style={cell}>{job.latency_ms != null ? `${job.latency_ms} ms` : '—'}</td>
                  <td style={cell}>{job.created_at ? new Date(job.created_at).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{job.id.slice(0, 8)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Job detail panel */}
      {selected && (
        <div style={{ marginTop: 16, background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14 }}>Job részletek — {selected.id.slice(0, 8)}</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          {selected.error_message && (
            <div style={{ background: '#450a0a', border: '1px solid #ef4444', borderRadius: 6, padding: '8px 12px', color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>
              {selected.error_message}
            </div>
          )}

          {selected.extracted_json && (
            <div>
              <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontWeight: 700 }}>Kinyert adatok</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 12 }}>
                {[
                  ['Számlaszám', selected.extracted_json.invoice_number],
                  ['Kibocsátó', selected.extracted_json.vendor_name],
                  ['Adószám', selected.extracted_json.vendor_tax_number],
                  ['Vevő', selected.extracted_json.customer_name],
                  ['Kiállítás', selected.extracted_json.issue_date],
                  ['Fizetési határidő', selected.extracted_json.due_date],
                  ['Nettó', selected.extracted_json.net_amount != null ? `${selected.extracted_json.net_amount.toLocaleString('hu-HU')} ${selected.extracted_json.currency || 'HUF'}` : null],
                  ['ÁFA', selected.extracted_json.tax_rate != null ? `${selected.extracted_json.tax_rate}%` : null],
                  ['Bruttó', selected.extracted_json.gross_amount != null ? `${selected.extracted_json.gross_amount.toLocaleString('hu-HU')} ${selected.extracted_json.currency || 'HUF'}` : null],
                  ['Fizetési mód', selected.extracted_json.payment_method],
                ].filter(([, v]) => v != null).map(([label, value]) => (
                  <div key={label} style={{ background: '#111827', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontSize: 13, color: '#f3f4f6', fontWeight: 500 }}>{String(value)}</div>
                  </div>
                ))}
              </div>
              {selected.extracted_json.line_items?.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 12 }}>Tételek ({selected.extracted_json.line_items.length})</summary>
                  <pre style={{ marginTop: 8, background: '#111827', borderRadius: 6, padding: 12, fontSize: 11, color: '#d1d5db', overflow: 'auto' }}>
                    {JSON.stringify(selected.extracted_json.line_items, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, color: '#6b7280' }}>
            <span>Modell: {selected.model || 'gpt-4o-mini'}</span>
            {selected.cost_usd != null && <span>Költség: ${selected.cost_usd.toFixed(5)}</span>}
            {selected.latency_ms != null && <span>Válaszidő: {selected.latency_ms} ms</span>}
            {selected.finished_at && <span>Befejezve: {new Date(selected.finished_at).toLocaleString('hu-HU')}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
