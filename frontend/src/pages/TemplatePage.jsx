import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const CARD    = 'rgba(13,27,46,0.7)'
const BORDER  = 'rgba(255,255,255,0.08)'
const TEXT    = '#e2e8f0'
const MUTED   = '#64748b'
const PRIMARY = '#1a56db'

const CATEGORY_META = {
  accounting: { icon: '📊', color: '#4ade80', label: 'Könyvelés' },
  legal:      { icon: '⚖️', color: '#a78bfa', label: 'Jog' },
  sales:      { icon: '📈', color: '#fbbf24', label: 'Sales' },
  hr:         { icon: '👥', color: '#38bdf8', label: 'HR' },
}

function SuccessModal({ template, onClose }) {
  const meta = CATEGORY_META[template.category] || { icon: '🤖', color: PRIMARY }
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 400, maxWidth: '90vw', borderRadius: 16,
          background: '#0d1b2e', border: `1px solid ${meta.color}44`,
          padding: '2rem', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          textAlign: 'center',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 48, marginBottom: '1rem' }}>✅</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
          Sablon alkalmazva!
        </div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, marginBottom: '1.5rem' }}>
          A <strong style={{ color: TEXT }}>{template.name}</strong> sablon sikeresen beállítva.
          Az AI ügynök mostantól ezzel a konfigurációval dolgozik.
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '0.6rem 1.5rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: meta.color, color: '#0d1b2e',
            border: 'none', cursor: 'pointer', width: '100%',
          }}
        >
          Rendben
        </button>
      </div>
    </div>
  )
}

function ConfirmModal({ template, onConfirm, onCancel, applying }) {
  const meta = CATEGORY_META[template.category] || { icon: '🤖', color: PRIMARY, label: template.category }
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: 440, maxWidth: '90vw', borderRadius: 16,
          background: '#0d1b2e', border: `1px solid ${BORDER}`,
          padding: '1.75rem', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 32, marginBottom: '0.5rem' }}>
          {meta.icon}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: '0.375rem' }}>
          Alkalmazzuk a sablont?
        </div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, marginBottom: '1.25rem' }}>
          A <strong style={{ color: TEXT }}>{template.name}</strong> sablon alkalmazása után a rendszer
          az iparágspecifikus beállításokkal fog dolgozni.
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Mit konfigurál ez a sablon?
          </div>
          {(template.config?.features || []).map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: TEXT, padding: '0.2rem 0', display: 'flex', gap: '0.5rem' }}>
              <span style={{ color: meta.color }}>›</span>{f}
            </div>
          ))}
          <div style={{ marginTop: '0.625rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              ['Válaszstílus', template.config?.reply_style],
              ['Min. confidence', template.config?.confidence_threshold ? `${(template.config.confidence_threshold * 100).toFixed(0)}%` : null],
              ['Nyelv', template.config?.language?.toUpperCase()],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label} style={{
                fontSize: 11, padding: '0.2rem 0.6rem', borderRadius: 5,
                background: 'rgba(255,255,255,0.06)', color: TEXT,
              }}>
                <span style={{ color: MUTED }}>{label}: </span>{val}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.5rem 1.125rem', borderRadius: 8, fontSize: 13,
              background: 'transparent', color: MUTED,
              border: `1px solid ${BORDER}`, cursor: 'pointer',
            }}
          >
            Mégse
          </button>
          <button
            onClick={onConfirm}
            disabled={applying}
            style={{
              padding: '0.5rem 1.375rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: applying ? 'rgba(26,86,219,0.4)' : PRIMARY,
              color: 'white', border: 'none',
              cursor: applying ? 'not-allowed' : 'pointer',
              opacity: applying ? 0.7 : 1,
            }}
          >
            {applying ? 'Alkalmazás...' : '✓ Sablon alkalmazása'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TemplateCard({ template, onSelect, isActive }) {
  const meta = CATEGORY_META[template.category] || { icon: '🤖', color: PRIMARY, label: template.category }
  const features = template.config?.features || []

  return (
    <div style={{
      background: isActive ? `${meta.color}10` : CARD,
      border: isActive ? `2px solid ${meta.color}` : `1px solid ${BORDER}`,
      borderRadius: 14, padding: '1.375rem',
      display: 'flex', flexDirection: 'column', gap: '1rem',
      transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
      cursor: 'default',
      position: 'relative',
    }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.borderColor = `${meta.color}44`
          e.currentTarget.style.boxShadow = `0 4px 24px rgba(0,0,0,0.3)`
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.borderColor = BORDER
          e.currentTarget.style.boxShadow = 'none'
        }
      }}
    >
      {/* Aktív jelzés */}
      {isActive && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: meta.color, color: '#0d1b2e',
          fontSize: 10, fontWeight: 700, padding: '0.2rem 0.6rem',
          borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          ✓ Aktív
        </div>
      )}

      {/* Fejléc */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: `${meta.color}18`,
          border: `1px solid ${meta.color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {meta.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: '0.2rem' }}>
            {template.name}
          </div>
          <div style={{
            display: 'inline-block', fontSize: 10, fontWeight: 700,
            color: meta.color, background: `${meta.color}18`,
            padding: '0.15rem 0.5rem', borderRadius: 4,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {meta.label}
          </div>
        </div>
      </div>

      {/* Leírás */}
      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.65 }}>
        {template.description}
      </div>

      {/* Mit csinál */}
      {features.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Mit csinál
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {features.map((f, i) => (
              <div key={i} style={{ fontSize: 12, color: TEXT, display: 'flex', gap: '0.5rem' }}>
                <span style={{ color: meta.color, flexShrink: 0 }}>›</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gomb */}
      <button
        onClick={() => onSelect(template)}
        style={{
          marginTop: 'auto', padding: '0.5rem 1rem', borderRadius: 8,
          fontSize: 13, fontWeight: 600,
          background: isActive ? meta.color : `${meta.color}18`,
          color: isActive ? '#0d1b2e' : meta.color,
          border: `1px solid ${meta.color}33`,
          cursor: 'pointer',
          transition: 'background 0.15s',
          width: '100%',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = `${meta.color}30` }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = `${meta.color}18` }}
      >
        {isActive ? '✓ Kiválasztva' : 'Alkalmazás →'}
      </button>
    </div>
  )
}

export default function TemplatePage() {
  const { authFetch } = useAuth()

  const [templates,   setTemplates]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [selected,    setSelected]    = useState(null)   // confirm modal
  const [activeId,    setActiveId]    = useState(null)   // kiválasztott sablon
  const [applying,    setApplying]    = useState(false)
  const [error,       setError]       = useState('')
  const [showSuccess, setShowSuccess] = useState(null)   // success modal template

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch(`${API}/api/templates`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setTemplates(json.templates || [])
      } catch {
        setError('Nem sikerült betölteni a sablonokat.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, []) // eslint-disable-line

  async function handleApply() {
    if (!selected) return
    setApplying(true)
    setError('')
    try {
      const res = await authFetch(`${API}/api/templates/${selected.id}/apply`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setActiveId(selected.id)
      setShowSuccess(selected)
      setSelected(null)
    } catch {
      setError('Alkalmazás sikertelen. Próbáld újra.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.375rem' }}>
          Sablon könyvtár
        </h1>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
          Válassz egy iparági sablont az AI ügynök gyors beállításához.
          A sablon alkalmazása után az onboarding 3. lépésén töltheted fel a saját dokumentumaidat.
        </p>
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
        <div style={{ color: MUTED, fontSize: 14, textAlign: 'center', padding: '3rem' }}>
          Betöltés...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1.25rem',
        }}>
          {templates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onSelect={setSelected}
              isActive={activeId === t.id}
            />
          ))}
        </div>
      )}

      {templates.length === 0 && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '3rem', color: MUTED, fontSize: 14 }}>
          Nem találhatók sablonok.
        </div>
      )}

      {selected && (
        <ConfirmModal
          template={selected}
          onConfirm={handleApply}
          onCancel={() => { if (!applying) setSelected(null) }}
          applying={applying}
        />
      )}

      {showSuccess && (
        <SuccessModal
          template={showSuccess}
          onClose={() => setShowSuccess(null)}
        />
      )}
    </div>
  )
}
