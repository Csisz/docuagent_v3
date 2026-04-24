import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const BG       = '#050d18'
const CARD     = 'rgba(13,27,46,0.8)'
const BORDER   = 'rgba(255,255,255,0.08)'
const TEXT     = '#e2e8f0'
const MUTED    = '#64748b'
const PRIMARY  = '#1a56db'
const ORANGE   = '#ff7820'

// ── Wizard lépések metaadatai ─────────────────────────────────

const STEPS = [
  { id: 1, label: 'Trigger',     short: 'Esemény' },
  { id: 2, label: 'Szűrők',     short: 'Szűrők' },
  { id: 3, label: 'Akció',      short: 'Akció' },
  { id: 4, label: 'Jóváhagyás', short: 'Jóváh.' },
  { id: 5, label: 'Stílus',     short: 'Mentés' },
]

const TRIGGERS = [
  { id: 'email',    icon: '📧', label: 'Email érkezik',         desc: 'Bejövő emailekre reagál automatikusan' },
  { id: 'document', icon: '📄', label: 'Dokumentum feltöltve',  desc: 'Új dokumentum feltöltésekor aktiválódik' },
  { id: 'chat',     icon: '💬', label: 'Chat üzenet',           desc: 'Valós idejű chat üzenetekre válaszol' },
  { id: 'calendar', icon: '📅', label: 'Naptár esemény',        desc: 'Naptár eseményeknél dolgozik' },
]

const ACTIONS = [
  { id: 'reply',   icon: '✅', label: 'AI válasz generálás',    desc: 'Automatikus emailválasz a dokumentumok alapján', available: true },
  { id: 'summary', icon: '📋', label: 'Összefoglalás készítés', desc: 'Rövid összefoglalót készít a tartalomból', available: true },
  { id: 'crm',     icon: '🔗', label: 'CRM task létrehozás',    desc: 'Feladatot hoz létre a CRM rendszerben', available: false },
  { id: 'slack',   icon: '📤', label: 'Slack értesítés',        desc: 'Értesítést küld a megadott Slack csatornára', available: false },
]

const CATEGORIES = [
  { id: 'complaint',   label: 'Panasz' },
  { id: 'inquiry',     label: 'Megkeresés' },
  { id: 'appointment', label: 'Időpontfoglalás' },
  { id: 'other',       label: 'Egyéb' },
]

const STYLES = [
  { id: 'formal',    label: 'Formális',     desc: 'Hivatalos, üzleti hangnem' },
  { id: 'friendly',  label: 'Barátságos',   desc: 'Közvetlen, segítőkész stílus' },
  { id: 'neutral',   label: 'Semleges',     desc: 'Tárgyilagos, tömör válaszok' },
]

// ── Alap állapot ──────────────────────────────────────────────

function defaultState() {
  return {
    trigger:           'email',
    filter_domain:     '',
    filter_keywords:   [],
    filter_categories: [],
    filter_urgency:    0,
    actions:           ['reply'],
    approval_mode:     'confidence',
    confidence_threshold: 75,
    name:              '',
    reply_style:       'formal',
  }
}

// ── Progress Bar ──────────────────────────────────────────────

function ProgressBar({ step }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((s, i) => {
          const done    = s.id < step
          const current = s.id === step
          const color   = done ? PRIMARY : current ? ORANGE : 'rgba(255,255,255,0.12)'
          const textCol = done || current ? TEXT : MUTED
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: done ? PRIMARY : current ? 'rgba(255,120,32,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `2px solid ${color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  color: done ? 'white' : current ? ORANGE : MUTED,
                  transition: 'all 0.3s',
                }}>
                  {done ? '✓' : s.id}
                </div>
                <div style={{ fontSize: 10, color: textCol, whiteSpace: 'nowrap', fontWeight: current ? 600 : 400 }}>
                  {s.label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2, margin: '0 8px', marginBottom: 18,
                  background: done ? PRIMARY : 'rgba(255,255,255,0.08)',
                  transition: 'background 0.3s',
                }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Nav gombok ────────────────────────────────────────────────

function NavButtons({ step, onBack, onNext, onSave, saving, isLast, canNext }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: `1px solid ${BORDER}` }}>
      <button
        onClick={onBack}
        disabled={step === 1}
        style={{
          padding: '0.6rem 1.4rem', borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: 'transparent', color: step === 1 ? 'rgba(255,255,255,0.2)' : MUTED,
          border: `1px solid ${step === 1 ? 'rgba(255,255,255,0.06)' : BORDER}`,
          cursor: step === 1 ? 'not-allowed' : 'pointer',
        }}
      >
        ← Vissza
      </button>
      {isLast ? (
        <button
          onClick={onSave}
          disabled={saving || !canNext}
          style={{
            padding: '0.6rem 1.75rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: saving || !canNext ? 'rgba(255,120,32,0.3)' : ORANGE,
            color: 'white', border: 'none',
            cursor: saving || !canNext ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Mentés...' : '✓ Agent mentése'}
        </button>
      ) : (
        <button
          onClick={onNext}
          disabled={!canNext}
          style={{
            padding: '0.6rem 1.75rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: canNext ? PRIMARY : 'rgba(26,86,219,0.3)',
            color: 'white', border: 'none',
            cursor: canNext ? 'pointer' : 'not-allowed',
          }}
        >
          Tovább →
        </button>
      )}
    </div>
  )
}

// ── Lépés 1 — Trigger ─────────────────────────────────────────

function Step1({ state, setState }) {
  return (
    <div>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: '0.4rem' }}>Mikor aktiválódjon az agent?</h2>
      <p style={{ fontSize: 13, color: MUTED, marginBottom: '1.5rem' }}>Válaszd ki, milyen esemény indítsa el az AI ügynököt.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
        {TRIGGERS.map(t => {
          const active = state.trigger === t.id
          return (
            <div
              key={t.id}
              onClick={() => setState(s => ({ ...s, trigger: t.id }))}
              style={{
                padding: '1.25rem',
                borderRadius: 12,
                border: active ? `2px solid ${ORANGE}` : `1px solid ${BORDER}`,
                background: active ? 'rgba(255,120,32,0.08)' : CARD,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: '0.625rem' }}>{t.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: active ? ORANGE : TEXT, marginBottom: '0.3rem' }}>{t.label}</div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>{t.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chip input segéd ──────────────────────────────────────────

function ChipInput({ chips, onAdd, onRemove, placeholder }) {
  const [input, setInput] = useState('')

  function handleKey(e) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      const val = input.trim().replace(/,$/, '')
      if (val && !chips.includes(val)) onAdd(val)
      setInput('')
    }
    if (e.key === 'Backspace' && !input && chips.length) {
      onRemove(chips[chips.length - 1])
    }
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center',
      padding: '0.5rem 0.75rem', borderRadius: 8, minHeight: 42,
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
    }}>
      {chips.map(c => (
        <span key={c} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: `${PRIMARY}22`, border: `1px solid ${PRIMARY}44`,
          borderRadius: 5, padding: '0.15rem 0.5rem', fontSize: 12, color: TEXT,
        }}>
          {c}
          <span onClick={() => onRemove(c)} style={{ cursor: 'pointer', color: MUTED, fontWeight: 700, lineHeight: 1 }}>×</span>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        placeholder={chips.length ? '' : placeholder}
        style={{
          flex: 1, minWidth: 80, background: 'transparent', border: 'none',
          outline: 'none', color: TEXT, fontSize: 13,
        }}
      />
    </div>
  )
}

// ── Lépés 2 — Szűrők ─────────────────────────────────────────

function Step2({ state, setState }) {
  function toggleCat(id) {
    setState(s => {
      const cats = s.filter_categories.includes(id)
        ? s.filter_categories.filter(c => c !== id)
        : [...s.filter_categories, id]
      return { ...s, filter_categories: cats }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: '0.4rem' }}>Szűrési feltételek</h2>
        <p style={{ fontSize: 13, color: MUTED }}>Opcionálisan szűkítsd le, mely esetekben aktiválódjon az agent.</p>
      </div>

      {/* Domain */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.5rem' }}>
          Feladó domain
        </label>
        <input
          type="text"
          placeholder="pl. @nagyceg.hu"
          value={state.filter_domain}
          onChange={e => setState(s => ({ ...s, filter_domain: e.target.value }))}
          style={{
            width: '100%', padding: '0.6rem 0.875rem', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
            color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Keywords */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.5rem' }}>
          Tárgy kulcsszavak <span style={{ color: MUTED, fontWeight: 400, textTransform: 'none' }}>(Enter vagy vessző)</span>
        </label>
        <ChipInput
          chips={state.filter_keywords}
          onAdd={kw => setState(s => ({ ...s, filter_keywords: [...s.filter_keywords, kw] }))}
          onRemove={kw => setState(s => ({ ...s, filter_keywords: s.filter_keywords.filter(k => k !== kw) }))}
          placeholder="Adj meg kulcsszavakat..."
        />
      </div>

      {/* Categories */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.75rem' }}>
          Kategória szűrő <span style={{ color: MUTED, fontWeight: 400, textTransform: 'none' }}>(ha üres: mindegyik)</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {CATEGORIES.map(c => {
            const active = state.filter_categories.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                style={{
                  padding: '0.4rem 0.875rem', borderRadius: 6, fontSize: 13,
                  background: active ? `${PRIMARY}22` : 'rgba(255,255,255,0.04)',
                  border: active ? `1px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                  color: active ? TEXT : MUTED, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {active && <span style={{ marginRight: 4, color: PRIMARY }}>✓</span>}
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Urgency */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.75rem' }}>
          Minimum urgency score: <span style={{ color: TEXT, fontWeight: 700 }}>{state.filter_urgency}</span>
        </label>
        <input
          type="range" min={0} max={100} step={5}
          value={state.filter_urgency}
          onChange={e => setState(s => ({ ...s, filter_urgency: +e.target.value }))}
          style={{ width: '100%', accentColor: PRIMARY }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, marginTop: '0.25rem' }}>
          <span>0 — minden email</span>
          <span>100 — csak a legsürgősebbek</span>
        </div>
      </div>
    </div>
  )
}

// ── Lépés 3 — Akciók ─────────────────────────────────────────

function Step3({ state, setState }) {
  function toggle(id) {
    setState(s => {
      const acts = s.actions.includes(id)
        ? s.actions.filter(a => a !== id)
        : [...s.actions, id]
      return { ...s, actions: acts }
    })
  }

  return (
    <div>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: '0.4rem' }}>Mit csináljon az AI?</h2>
      <p style={{ fontSize: 13, color: MUTED, marginBottom: '1.5rem' }}>Több akciót is kiválaszthatsz (legalább egy szükséges).</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {ACTIONS.map(a => {
          const active = state.actions.includes(a.id)
          return (
            <div
              key={a.id}
              onClick={() => a.available && toggle(a.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '1rem 1.125rem', borderRadius: 10,
                border: active ? `2px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                background: active ? `${PRIMARY}0d` : CARD,
                cursor: a.available ? 'pointer' : 'not-allowed',
                opacity: a.available ? 1 : 0.45,
                transition: 'all 0.2s',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: active ? `${PRIMARY}22` : 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>
                {a.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: active ? TEXT : MUTED, marginBottom: '0.2rem' }}>
                  {a.label}
                  {!a.available && <span style={{ marginLeft: 8, fontSize: 10, color: MUTED, fontWeight: 400 }}>(hamarosan)</span>}
                </div>
                <div style={{ fontSize: 12, color: MUTED }}>{a.desc}</div>
              </div>
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                border: `2px solid ${active ? PRIMARY : BORDER}`,
                background: active ? PRIMARY : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'white',
              }}>
                {active && '✓'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Lépés 4 — Jóváhagyás ─────────────────────────────────────

const APPROVAL_OPTIONS = [
  { id: 'auto',       label: 'Mindig automatikus', desc: 'Az agent azonnal küld, emberi felülvizsgálat nélkül' },
  { id: 'confidence', label: 'Csak magas konfidenciánál automatikus', desc: 'Alacsony bizonyosságnál emberi jóváhagyás szükséges' },
  { id: 'manual',     label: 'Mindig emberi jóváhagyás', desc: 'Minden válasz jóváhagyásra kerül küldés előtt' },
]

function Step4({ state, setState }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: '0.4rem' }}>Mikor kell emberi jóváhagyás?</h2>
        <p style={{ fontSize: 13, color: MUTED }}>Határozd meg, mennyire legyen autonóm az agent.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {APPROVAL_OPTIONS.map(opt => {
          const active = state.approval_mode === opt.id
          return (
            <label
              key={opt.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
                padding: '1rem 1.125rem', borderRadius: 10, cursor: 'pointer',
                border: active ? `2px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                background: active ? `${PRIMARY}0d` : CARD,
                transition: 'all 0.2s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                border: `2px solid ${active ? PRIMARY : BORDER}`,
                background: active ? PRIMARY : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
              </div>
              <input
                type="radio" value={opt.id}
                checked={active}
                onChange={() => setState(s => ({ ...s, approval_mode: opt.id }))}
                style={{ display: 'none' }}
              />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: active ? TEXT : MUTED, marginBottom: '0.2rem' }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{opt.desc}</div>
              </div>
            </label>
          )
        })}
      </div>

      {state.approval_mode === 'confidence' && (
        <div style={{
          padding: '1.125rem', borderRadius: 10,
          background: 'rgba(26,86,219,0.06)', border: `1px solid ${PRIMARY}33`,
        }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.75rem' }}>
            Confidence küszöb: <span style={{ color: TEXT, fontWeight: 700 }}>{state.confidence_threshold}%</span>
          </label>
          <input
            type="range" min={50} max={99} step={1}
            value={state.confidence_threshold}
            onChange={e => setState(s => ({ ...s, confidence_threshold: +e.target.value }))}
            style={{ width: '100%', accentColor: PRIMARY }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, marginTop: '0.25rem' }}>
            <span>50% — több auto</span>
            <span>99% — több kézi</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Lépés 5 — Stílus és név ───────────────────────────────────

function Step5({ state, setState }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: '0.4rem' }}>Agent neve és stílusa</h2>
        <p style={{ fontSize: 13, color: MUTED }}>Add meg az agent nevét és a kommunikációs stílust.</p>
      </div>

      {/* Név */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.5rem' }}>
          Agent neve <span style={{ color: '#f87171' }}>*</span>
        </label>
        <input
          type="text"
          placeholder="pl. Ügyfélszolgálat Agent"
          value={state.name}
          onChange={e => setState(s => ({ ...s, name: e.target.value }))}
          style={{
            width: '100%', padding: '0.7rem 0.875rem', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${state.name ? PRIMARY : BORDER}`,
            color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.2s',
          }}
        />
      </div>

      {/* Stílus */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.75rem' }}>
          Válasz stílus
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {STYLES.map(st => {
            const active = state.reply_style === st.id
            return (
              <div
                key={st.id}
                onClick={() => setState(s => ({ ...s, reply_style: st.id }))}
                style={{
                  padding: '0.875rem', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  border: active ? `2px solid ${ORANGE}` : `1px solid ${BORDER}`,
                  background: active ? 'rgba(255,120,32,0.08)' : CARD,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600, color: active ? ORANGE : TEXT, marginBottom: '0.3rem' }}>{st.label}</div>
                <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{st.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Összefoglaló */}
      <div style={{
        padding: '1rem 1.125rem', borderRadius: 10,
        background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem' }}>
          Konfiguráció összefoglalója
        </div>
        {[
          ['Trigger', TRIGGERS.find(t => t.id === state.trigger)?.label],
          ['Akciók', state.actions.map(id => ACTIONS.find(a => a.id === id)?.label).join(', ') || '—'],
          ['Jóváhagyás', APPROVAL_OPTIONS.find(o => o.id === state.approval_mode)?.label],
          ['Stílus', STYLES.find(s => s.id === state.reply_style)?.label],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: '0.5rem', fontSize: 12, padding: '0.25rem 0' }}>
            <span style={{ color: MUTED, minWidth: 90 }}>{k}:</span>
            <span style={{ color: TEXT }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Fő komponens ──────────────────────────────────────────────

export default function AgentBuilderPage() {
  const { authFetch } = useAuth()
  const navigate      = useNavigate()
  const { id }        = useParams()
  const isEdit        = !!id

  const [step,   setStep]   = useState(1)
  const [state,  setState]  = useState(defaultState())
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // New fields for edit mode
  const [systemPrompt,   setSystemPrompt]   = useState('')
  const [model,          setModel]          = useState('gpt-4o-mini')
  const [n8nWebhook,     setN8nWebhook]     = useState('')
  const [activating,     setActivating]     = useState(false)
  const [activateResult, setActivateResult] = useState(null)
  const [runs,           setRuns]           = useState([])
  const [runsLoading,    setRunsLoading]    = useState(false)

  // Szerkesztés: meglévő agent betöltése
  useEffect(() => {
    if (!isEdit) return
    authFetch(`${API}/api/agents/${id}`)
      .then(r => r.json())
      .then(data => {
        setState({
          trigger:              data.trigger || 'email',
          filter_domain:        data.filters?.domain || '',
          filter_keywords:      data.filters?.keywords || [],
          filter_categories:    data.filters?.categories || [],
          filter_urgency:       data.filters?.urgency_min || 0,
          actions:              data.actions || ['reply'],
          approval_mode:        data.approval_mode || 'auto',
          confidence_threshold: data.style?.confidence_threshold || 75,
          name:                 data.name || '',
          reply_style:          data.style?.reply_style || 'formal',
        })
        setSystemPrompt(data.system_prompt || '')
        setModel(data.model || 'gpt-4o-mini')
        setN8nWebhook(data.n8n_webhook_url || '')
      })
      .catch(() => setError('Nem sikerült betölteni az agent adatait.'))
  }, [id]) // eslint-disable-line

  function canGoNext() {
    if (step === 3) return state.actions.length > 0
    if (step === 5) return state.name.trim().length > 0
    return true
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        name:          state.name.trim(),
        trigger:       state.trigger,
        filters: {
          domain:       state.filter_domain.trim() || null,
          keywords:     state.filter_keywords,
          categories:   state.filter_categories,
          urgency_min:  state.filter_urgency,
        },
        actions:       state.actions,
        approval_mode: state.approval_mode,
        style: {
          reply_style:          state.reply_style,
          confidence_threshold: state.confidence_threshold,
        },
        is_active:            true,
        system_prompt:        systemPrompt.trim() || null,
        model:                model || 'gpt-4o-mini',
        n8n_webhook_url:      n8nWebhook.trim() || null,
        confidence_threshold: state.confidence_threshold / 100,
      }

      const url    = isEdit ? `${API}/api/agents/${id}` : `${API}/api/agents`
      const method = isEdit ? 'PUT' : 'POST'
      const res    = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      navigate('/agents')
    } catch {
      setError('Mentés sikertelen. Próbáld újra.')
    } finally {
      setSaving(false)
    }
  }

  const loadRuns = useCallback(async () => {
    if (!isEdit) return
    setRunsLoading(true)
    try {
      const d = await api.getAgentRuns(id, 30)
      setRuns(d.runs || [])
    } catch { /* ignore */ } finally {
      setRunsLoading(false)
    }
  }, [id, isEdit])

  useEffect(() => { loadRuns() }, [loadRuns])

  async function handleActivate() {
    setActivating(true)
    setActivateResult(null)
    try {
      const r = await api.activateAgent(id)
      setActivateResult({ ok: true, n8n: r.n8n_ping?.status })
      loadRuns()
    } catch (e) {
      setActivateResult({ ok: false, msg: String(e) })
    } finally {
      setActivating(false)
    }
  }

  const stepProps = { state, setState }

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Fejléc */}
        <div style={{ marginBottom: '2rem' }}>
          <button
            onClick={() => navigate('/agents')}
            style={{ background: 'none', border: 'none', color: MUTED, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: '0.75rem' }}
          >
            ← Vissza az agent listához
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.25rem' }}>
            {isEdit ? 'Agent szerkesztése' : 'Új Agent Builder'}
          </h1>
          <p style={{ fontSize: 13, color: MUTED }}>
            Konfiguráld az AI ügynököt lépésről lépésre.
          </p>
        </div>

        {/* Wizard kártya */}
        <div style={{
          background: CARD, borderRadius: 16,
          border: `1px solid ${BORDER}`,
          padding: '2rem',
          boxShadow: '0 8px 48px rgba(0,0,0,0.4)',
        }}>
          <ProgressBar step={step} />

          {error && (
            <div style={{
              padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1.5rem',
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
              fontSize: 13, color: '#f87171',
            }}>
              ⚠ {error}
            </div>
          )}

          {step === 1 && <Step1 {...stepProps} />}
          {step === 2 && <Step2 {...stepProps} />}
          {step === 3 && <Step3 {...stepProps} />}
          {step === 4 && <Step4 {...stepProps} />}
          {step === 5 && <Step5 {...stepProps} />}

          <NavButtons
            step={step}
            onBack={() => setStep(s => Math.max(1, s - 1))}
            onNext={() => setStep(s => Math.min(5, s + 1))}
            onSave={handleSave}
            saving={saving}
            isLast={step === 5}
            canNext={canGoNext()}
          />
        </div>

        {/* ── AI Runtime settings (edit mode only) ── */}
        {isEdit && (
          <div style={{ background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '1.5rem', marginTop: '1.5rem' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 16 }}>
              AI Runtime beállítások
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Modell</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  style={{ width: '100%', background: '#111827', color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (gyors)</option>
                  <option value="gpt-4o">gpt-4o (pontos)</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>n8n Webhook URL</label>
                <input
                  value={n8nWebhook}
                  onChange={e => setN8nWebhook(e.target.value)}
                  placeholder="https://n8n.../webhook/..."
                  style={{ width: '100%', boxSizing: 'border-box', background: '#111827', color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Rendszer prompt</label>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="Az agent viselkedését meghatározó rendszer prompt..."
                rows={4}
                style={{ width: '100%', boxSizing: 'border-box', background: '#111827', color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>
          </div>
        )}

        {/* ── Activate button (edit mode only) ── */}
        {isEdit && (
          <div style={{ background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '1.5rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>Agent aktiválása</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>is_active=true, n8n webhook ping, run_count++</div>
              </div>
              <button
                onClick={handleActivate}
                disabled={activating}
                style={{ background: activating ? '#374151' : '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: activating ? 'not-allowed' : 'pointer' }}
              >
                {activating ? 'Aktiválás…' : 'Aktiválás'}
              </button>
            </div>
            {activateResult && (
              <div style={{ marginTop: 10, fontSize: 12, color: activateResult.ok ? '#10b981' : '#f87171', padding: '6px 10px', background: activateResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
                {activateResult.ok ? `Aktiválva. n8n: ${activateResult.n8n || 'skipped'}` : `Hiba: ${activateResult.msg}`}
              </div>
            )}
          </div>
        )}

        {/* ── Run history (edit mode only) ── */}
        {isEdit && (
          <div style={{ background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '1.5rem', marginTop: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Futtatási előzmények
              </div>
              <button onClick={loadRuns} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 12, cursor: 'pointer' }}>↻</button>
            </div>
            {runsLoading ? (
              <div style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: 20 }}>Betöltés…</div>
            ) : runs.length === 0 ? (
              <div style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: 20 }}>Nincs futtatási előzmény</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {runs.map(run => (
                  <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px 12px', border: `1px solid ${BORDER}`, fontSize: 12 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: run.status === 'success' ? 'rgba(16,185,129,0.15)' : run.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: run.status === 'success' ? '#10b981' : run.status === 'failed' ? '#ef4444' : '#f59e0b',
                    }}>{run.status || 'unknown'}</span>
                    <span style={{ color: TEXT, flex: 1 }}>{run.action_taken || '—'}</span>
                    {run.confidence != null && <span style={{ color: MUTED }}>{Math.round(run.confidence * 100)}%</span>}
                    {run.processing_time_ms != null && <span style={{ color: MUTED }}>{run.processing_time_ms}ms</span>}
                    <span style={{ color: MUTED }}>{run.created_at ? new Date(run.created_at).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
