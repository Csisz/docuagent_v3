import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })
}

export default function APIKeysPanel() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const [keys, setKeys]       = useState([])
  const [loading, setLoading] = useState(true)
  const [genLabel, setGenLabel] = useState('')
  const [generating, setGenerating] = useState(false)
  const [newKey, setNewKey]   = useState(null)   // shown once after generation
  const [revoking, setRevoking] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listApiKeys()
      setKeys(Array.isArray(data) ? data : [])
    } catch (e) {
      toast(`Betöltési hiba: ${e.message}`, 'err')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    if (!isAdmin) return
    setGenerating(true)
    setNewKey(null)
    try {
      const result = await api.generateApiKey(genLabel.trim() || undefined)
      setNewKey(result.key)
      setGenLabel('')
      toast('API kulcs létrehozva — mentsd el, csak egyszer jelenik meg!', 'ok')
      load()
    } catch (e) {
      toast(`Generálás sikertelen: ${e.message}`, 'err')
    } finally {
      setGenerating(false)
    }
  }

  async function handleRevoke(prefix) {
    if (!isAdmin) return
    if (!confirm(`Visszavonod a(z) ${prefix}... kulcsot?`)) return
    setRevoking(prefix)
    try {
      await api.revokeApiKey(prefix)
      toast('API kulcs visszavonva', 'ok')
      load()
    } catch (e) {
      toast(`Visszavonás sikertelen: ${e.message}`, 'err')
    } finally {
      setRevoking(null)
    }
  }

  const s = {
    section: { marginBottom: 28 },
    label:   { fontSize: 11, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, display: 'block' },
    input:   { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: '#e2e8f0', padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%' },
    btn:     { background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    btnDanger: { background: 'rgba(248,113,113,.15)', color: '#f87171', border: '1px solid rgba(248,113,113,.3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
    row:     { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, marginBottom: 6 },
    mono:    { fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' },
    badge:   { background: 'rgba(26,86,219,.2)', color: '#60a5fa', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 600, fontFamily: 'monospace' },
    newKey:  { background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 },
  }

  return (
    <div>
      {/* New key banner — shown once */}
      {newKey && (
        <div style={s.newKey}>
          <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 600, marginBottom: 8 }}>
            ✓ Új API kulcs — mentsd el most, többé nem jelenik meg!
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{ ...s.mono, fontSize: 13, color: '#e2e8f0', flex: 1, wordBreak: 'break-all' }}>{newKey}</code>
            <button
              style={{ ...s.btn, padding: '6px 12px', fontSize: 12 }}
              onClick={() => { navigator.clipboard?.writeText(newKey); toast('Másolva!', 'ok') }}
            >Másol</button>
            <button
              style={{ ...s.btnDanger, padding: '6px 10px' }}
              onClick={() => setNewKey(null)}
            >✕</button>
          </div>
        </div>
      )}

      {/* Generate */}
      {isAdmin && (
        <div style={s.section}>
          <label style={s.label}>Új API kulcs generálása</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder="Megnevezés (pl. n8n integráció)"
              value={genLabel}
              onChange={e => setGenLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !generating && handleGenerate()}
            />
            <button style={s.btn} onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generálás…' : '+ Generál'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', marginTop: 6 }}>
            A kulcs csak létrehozáskor látható. SHA-256 hashként tároljuk.
          </div>
        </div>
      )}

      {/* List */}
      <div style={s.section}>
        <label style={s.label}>Aktív kulcsok ({keys.length})</label>
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Betöltés…</div>
        ) : keys.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,.25)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Nincs aktív API kulcs.</div>
        ) : keys.map(k => (
          <div key={k.prefix} style={s.row}>
            <span style={s.badge}>{k.prefix}…</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{k.label || 'Névtelen kulcs'}</div>
              <div style={s.mono}>Létrehozva: {fmtDate(k.created_at)} · Utoljára: {fmtDate(k.last_used)}</div>
            </div>
            {isAdmin && (
              <button
                style={s.btnDanger}
                onClick={() => handleRevoke(k.prefix)}
                disabled={revoking === k.prefix}
              >
                {revoking === k.prefix ? '…' : 'Visszavon'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
