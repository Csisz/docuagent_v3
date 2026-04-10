import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const API    = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const BG     = '#050d18'
const CARD   = 'rgba(13,27,46,0.8)'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT   = '#e2e8f0'
const MUTED  = '#64748b'
const PRIMARY = '#1a56db'
const ORANGE  = '#ff7820'

const TRIGGER_LABELS = {
  email:    { icon: '📧', label: 'Email' },
  document: { icon: '📄', label: 'Dokumentum' },
  chat:     { icon: '💬', label: 'Chat' },
  calendar: { icon: '📅', label: 'Naptár' },
}

const APPROVAL_LABELS = {
  auto:       'Automatikus',
  confidence: 'Confidence alapú',
  manual:     'Mindig kézi',
}

function AgentCard({ agent, onToggle, onDelete, onEdit }) {
  const trigger = TRIGGER_LABELS[agent.trigger] || { icon: '🤖', label: agent.trigger }
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div style={{
      background: CARD, borderRadius: 12,
      border: agent.is_active ? `1px solid rgba(26,86,219,0.3)` : `1px solid ${BORDER}`,
      padding: '1.25rem',
      opacity: agent.is_active ? 1 : 0.6,
      transition: 'all 0.2s',
    }}>
      {/* Fejléc */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.875rem' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 9, flexShrink: 0,
          background: agent.is_active ? `${PRIMARY}18` : 'rgba(255,255,255,0.05)',
          border: `1px solid ${agent.is_active ? PRIMARY + '44' : BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          {trigger.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agent.name}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, padding: '0.15rem 0.5rem', borderRadius: 4,
              background: `${PRIMARY}18`, color: PRIMARY,
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {trigger.label}
            </span>
            <span style={{
              fontSize: 10, padding: '0.15rem 0.5rem', borderRadius: 4,
              background: 'rgba(255,255,255,0.05)', color: MUTED,
            }}>
              {APPROVAL_LABELS[agent.approval_mode] || agent.approval_mode}
            </span>
          </div>
        </div>
        {/* Aktív toggle */}
        <div
          onClick={() => onToggle(agent)}
          style={{
            width: 36, height: 20, borderRadius: 10, flexShrink: 0,
            background: agent.is_active ? PRIMARY : 'rgba(255,255,255,0.1)',
            cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
          }}
        >
          <div style={{
            position: 'absolute', top: 3,
            left: agent.is_active ? 19 : 3,
            width: 14, height: 14, borderRadius: '50%',
            background: 'white', transition: 'left 0.2s',
          }} />
        </div>
      </div>

      {/* Akciók */}
      {agent.actions?.length > 0 && (
        <div style={{ fontSize: 11.5, color: MUTED, marginBottom: '0.875rem' }}>
          Akciók: <span style={{ color: TEXT }}>{agent.actions.join(', ')}</span>
        </div>
      )}

      {/* Gombsor */}
      {confirmDelete ? (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#f87171', flex: 1 }}>Biztosan törlöd?</span>
          <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 12, padding: '0.3rem 0.75rem', borderRadius: 6, background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, cursor: 'pointer' }}>Mégse</button>
          <button onClick={() => onDelete(agent.id)} style={{ fontSize: 12, padding: '0.3rem 0.75rem', borderRadius: 6, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer' }}>Törlés</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => onEdit(agent.id)}
            style={{
              flex: 1, padding: '0.45rem', borderRadius: 7, fontSize: 12, fontWeight: 500,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
              color: MUTED, cursor: 'pointer',
            }}
          >
            Szerkesztés
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              padding: '0.45rem 0.75rem', borderRadius: 7, fontSize: 12,
              background: 'transparent', border: `1px solid rgba(248,113,113,0.2)`,
              color: 'rgba(248,113,113,0.6)', cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

export default function AgentsPage() {
  const { authFetch } = useAuth()
  const navigate      = useNavigate()

  const [agents,  setAgents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  async function load() {
    try {
      const res = await authFetch(`${API}/api/agents`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setAgents(json.agents || [])
    } catch {
      setError('Nem sikerült betölteni az agent konfigurációkat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  async function handleToggle(agent) {
    try {
      await authFetch(`${API}/api/agents/${agent.id}/toggle`, { method: 'POST' })
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_active: !a.is_active } : a))
    } catch {
      setError('Állapotváltás sikertelen.')
    }
  }

  async function handleDelete(id) {
    try {
      await authFetch(`${API}/api/agents/${id}`, { method: 'DELETE' })
      setAgents(prev => prev.filter(a => a.id !== id))
    } catch {
      setError('Törlés sikertelen.')
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Fejléc */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.375rem' }}>Agent Builder</h1>
          <p style={{ fontSize: 13, color: MUTED }}>Konfiguráld az AI ügynököket automatizált munkafolyamatokhoz.</p>
        </div>
        <button
          onClick={() => navigate('/agent-builder')}
          style={{
            padding: '0.65rem 1.375rem', borderRadius: 9, fontSize: 13, fontWeight: 600,
            background: ORANGE, color: 'white', border: 'none', cursor: 'pointer',
          }}
        >
          + Új agent
        </button>
      </div>

      {error && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1.5rem',
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
          fontSize: 13, color: '#f87171',
        }}>
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: MUTED, fontSize: 14 }}>Betöltés...</div>
      ) : agents.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem',
          background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`,
        }}>
          <div style={{ fontSize: 40, marginBottom: '1rem' }}>⚙️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: '0.5rem' }}>Még nincsenek agent konfigurációk</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: '1.5rem' }}>Hozd létre az első AI ügynöködet a wizard segítségével.</div>
          <button
            onClick={() => navigate('/agent-builder')}
            style={{
              padding: '0.65rem 1.5rem', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: PRIMARY, color: 'white', border: 'none', cursor: 'pointer',
            }}
          >
            Wizard indítása →
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}>
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={id => navigate(`/agent-builder/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
