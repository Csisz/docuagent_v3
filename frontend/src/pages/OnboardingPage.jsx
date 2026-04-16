import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ── Konstansok ────────────────────────────────────────────────
const TOTAL_STEPS = 6
const PRIMARY = '#1a56db'
const ACCENT  = '#ff7820'
const BG      = '#050d18'
const CARD    = '#0d1b2e'
const BORDER  = 'rgba(255,255,255,0.08)'
const TEXT    = '#e2e8f0'
const MUTED   = '#64748b'
const GREEN   = '#4ade80'

const STEP_LABELS = ['Üdvözlés', 'Gmail', 'Cégadatok', 'Szabályok', 'Dokumentum', 'Kész']

const inputStyle = {
  width: '100%', padding: '0.625rem 0.875rem',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${BORDER}`,
  borderRadius: 8, fontSize: 13, color: TEXT,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}
const labelStyle = {
  fontSize: 11, fontWeight: 600, color: MUTED,
  display: 'block', marginBottom: '0.375rem',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const btnPrimary = (disabled) => ({
  padding: '0.625rem 1.5rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
  background: disabled ? 'rgba(26,86,219,0.4)' : PRIMARY,
  color: 'white', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'opacity 0.15s', opacity: disabled ? 0.7 : 1,
})
const btnSecondary = {
  padding: '0.625rem 1.25rem', borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: 'transparent', color: MUTED,
  border: `1px solid ${BORDER}`, cursor: 'pointer',
}


// ══════════════════════════════════════════════════════════════
// STEP 1 — Üdvözlés
// ══════════════════════════════════════════════════════════════
function Step1Welcome() {
  return (
    <div>
      <div style={{ fontSize: 36, marginBottom: '0.5rem' }}>📊</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        Csináljunk rendet a könyvelőiroda emailjeiben
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '1.75rem' }}>
        A DocuAgent automatikusan olvassa, kategorizálja és megválaszolja az ügyfelek leveleit.
        A könyvelő csak a tényleg fontos emailekre fordítja az idejét.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.75rem' }}>
        {[
          { icon: '⚡', title: 'Automatikus osztályozás', desc: 'Számla, NAV levél, általános kérdés — az AI azonnal felismeri' },
          { icon: '✍️', title: 'Válaszjavaslat 30 másodperc alatt', desc: 'Professzionális, magyar nyelvű levél — jóváhagyásra vár' },
          { icon: '🔒', title: 'NAV és számlalevelek emberi jóváhagyással', desc: 'Pénzügyi levelekhez mindig ember dönt — nem az AI' },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{
            display: 'flex', gap: '0.875rem', alignItems: 'flex-start',
            padding: '0.875rem', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${BORDER}`,
          }}>
            <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: '0.2rem' }}>{title}</div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'rgba(26,86,219,0.08)', border: `1px solid rgba(26,86,219,0.2)`,
        borderRadius: 10, padding: '0.875rem 1rem', fontSize: 12, color: MUTED, lineHeight: 1.6,
      }}>
        <span style={{ color: PRIMARY, fontWeight: 600 }}>⏱ Beállítási idő:</span> kb. 5–10 perc.
        Menet közben bármikor megállhatsz és folytathatod.
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// STEP 2 — Gmail összekötés
// ══════════════════════════════════════════════════════════════
function Step2Gmail({ data, onChange }) {
  const n8nUrl = import.meta.env.VITE_N8N_PUBLIC_URL || 'http://localhost:5678'

  return (
    <div>
      <div style={{ fontSize: 32, marginBottom: '0.25rem' }}>📧</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        Gmail összekötése
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '1.5rem' }}>
        Az AI olvassa és kategorizálja az ügyfélleveledet. A levelek csak a te rendszeredben tárolódnak —
        harmadik félhez nem kerülnek ki.
      </p>

      <div style={{
        background: 'rgba(26,86,219,0.08)', border: `1px solid rgba(26,86,219,0.25)`,
        borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Csatlakoztatás lépései
        </div>
        {[
          '1. Kattints az „Összekötés megnyitása" gombra',
          '2. Nyisd meg a WF1 — Gmail Sync folyamatot',
          '3. Add meg a Gmail hozzáférést a Gmail mezőknél',
          '4. Kapcsold be a folyamatot (Aktív állapot)',
        ].map((s, i) => (
          <div key={i} style={{ fontSize: 13, color: TEXT, padding: '0.25rem 0', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: PRIMARY }}>›</span> {s}
          </div>
        ))}
      </div>

      <a
        href={n8nUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.625rem 1.25rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: PRIMARY, color: 'white', textDecoration: 'none', marginBottom: '1.5rem',
        }}
      >
        🔗 Összekötés megnyitása
      </a>

      <div>
        <label style={labelStyle}>Figyelendő Gmail cím (opcionális)</label>
        <input
          style={inputStyle}
          type="email"
          placeholder="pl. iroda@konyveloiroda.hu"
          value={data.gmail_address || ''}
          onChange={e => onChange({ ...data, gmail_address: e.target.value })}
        />
        <div style={{ fontSize: 11, color: MUTED, marginTop: '0.375rem' }}>
          Ezt az emailt fogja az automata figyelni. Később is beállítható.
        </div>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// STEP 3 — Cégadatok
// ══════════════════════════════════════════════════════════════
function Step3CompanyData({ data, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 32, marginBottom: '0.25rem' }}>🏢</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        Az iroda adatai
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '1.5rem' }}>
        Ezek az adatok megjelennek az automatikus levelekben és segítenek az AI-nak
        a megfelelő hangnem és szaknyelv megválasztásában.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
        <div>
          <label style={labelStyle}>Iroda neve *</label>
          <input
            style={inputStyle}
            placeholder="pl. Kovács és Társai Könyvelőiroda Kft."
            value={data.company_name || ''}
            onChange={e => onChange({ ...data, company_name: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>Tevékenység</label>
          <select
            style={{ ...inputStyle, appearance: 'none' }}
            value={data.industry || 'accounting'}
            onChange={e => onChange({ ...data, industry: e.target.value })}
          >
            <option value="accounting">Könyvelőiroda / Számviteli szolgáltató</option>
            <option value="tax_advisory">Adótanácsadás</option>
            <option value="audit">Könyvvizsgálat</option>
            <option value="payroll">Bérszámfejtés</option>
            <option value="legal">Jogi / Ügyvédi iroda</option>
            <option value="other">Egyéb</option>
          </select>
          <div style={{ fontSize: 11, color: MUTED, marginTop: '0.375rem' }}>
            Előre beállítva: Könyvelőiroda — ez határozza meg az AI szaknyelvét
          </div>
        </div>
        <div>
          <label style={labelStyle}>Kapcsolattartó neve</label>
          <input
            style={inputStyle}
            placeholder="pl. Nagy Mária"
            value={data.contact_name || ''}
            onChange={e => onChange({ ...data, contact_name: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>Levelek nyelve</label>
          <select
            style={{ ...inputStyle, appearance: 'none' }}
            value={data.language || 'hu'}
            onChange={e => onChange({ ...data, language: e.target.value })}
          >
            <option value="hu">Magyar (alapértelmezett)</option>
            <option value="en">Angol</option>
            <option value="de">Német</option>
          </select>
        </div>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// STEP 4 — Szabályok beállítása
// ══════════════════════════════════════════════════════════════
function Step4Rules({ data, onChange }) {
  const rules = [
    {
      key: 'rule_invoice_human',
      label: 'Számla- és pénzügyi levelek mindig emberi jóváhagyást kapnak',
      desc: 'Számlabeérkező, díjbekérő, fizetési felszólítás — könyvelő hagyja jóvá',
      locked: true,
      default: true,
    },
    {
      key: 'rule_nav_human',
      label: 'NAV-os és adóhatósági levelek mindig emberi jóváhagyást kapnak',
      desc: 'NAV megkeresés, adóbevallás, ellenőrzési értesítés — könyvelő hagyja jóvá',
      locked: true,
      default: true,
    },
    {
      key: 'rule_auto_reply',
      label: 'Általános kérdések automatikus megválaszolása',
      desc: 'Időpontkérés, általános érdeklődés — az AI javaslatot készít, te döntöd el',
      locked: false,
      default: true,
    },
  ]

  // Initialize defaults on first render
  const initData = { ...data }
  let changed = false
  rules.forEach(r => {
    if (initData[r.key] === undefined) {
      initData[r.key] = r.default
      changed = true
    }
  })
  if (changed && Object.keys(data).length === 0) {
    // Only trigger on empty data to avoid infinite loop
    setTimeout(() => onChange(initData), 0)
  }

  return (
    <div>
      <div style={{ fontSize: 32, marginBottom: '0.25rem' }}>⚙️</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        Biztonsági szabályok
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '1.5rem' }}>
        Ezek a szabályok meghatározzák, mikor dönt az AI önállóan, és mikor kell emberi jóváhagyás.
        Könyvelőiroda-specifikus alapbeállítások.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {rules.map(rule => {
          const isOn = data[rule.key] !== false
          return (
            <div key={rule.key} style={{
              display: 'flex', gap: '0.875rem', alignItems: 'flex-start',
              padding: '1rem', borderRadius: 10,
              background: isOn ? 'rgba(74,222,128,0.05)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isOn ? 'rgba(74,222,128,0.2)' : BORDER}`,
              transition: 'all 0.15s',
            }}>
              <button
                disabled={rule.locked}
                onClick={() => !rule.locked && onChange({ ...data, [rule.key]: !isOn })}
                style={{
                  width: 36, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 2,
                  background: isOn ? GREEN : 'rgba(255,255,255,0.1)',
                  border: 'none', cursor: rule.locked ? 'not-allowed' : 'pointer',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2,
                  left: isOn ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'white', transition: 'left 0.2s',
                }} />
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{rule.label}</span>
                  {rule.locked && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: MUTED,
                      background: 'rgba(255,255,255,0.06)', padding: '1px 5px',
                      borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      Rögzített
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{rule.desc}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{
        marginTop: '1.25rem',
        background: 'rgba(255,120,32,0.07)', border: `1px solid rgba(255,120,32,0.2)`,
        borderRadius: 8, padding: '0.75rem 1rem', fontSize: 12, color: MUTED, lineHeight: 1.6,
      }}>
        <span style={{ color: ACCENT, fontWeight: 600 }}>ℹ A rögzített szabályok</span> megfelelnek
        a könyvelői szakmai elvárásoknak — pénzügyi döntésekbe nem avatkozik be az AI önállóan.
        A beállítások később is módosíthatók.
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// STEP 5 — Első dokumentum feltöltése
// ══════════════════════════════════════════════════════════════
function Step5Documents({ data, onChange, authFetch }) {
  const apiUrl    = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const [uploading, setUploading] = useState(false)
  const [uploaded,  setUploaded]  = useState(data.uploaded_docs || [])
  const [error,     setError]     = useState('')
  const fileRef = useRef(null)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await authFetch(`${apiUrl}/api/upload`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const newDocs = [...uploaded, { name: file.name, id: json.doc_id }]
      setUploaded(newDocs)
      onChange({ ...data, uploaded_docs: newDocs })
    } catch {
      setError('Feltöltési hiba. Ellenőrizd a fájl formátumát (PDF, DOCX, TXT).')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const suggestions = [
    'GYIK — Frequently Asked Questions',
    'Általános Szerződési Feltételek',
    'Szolgáltatás lista és díjszabás',
    'Ügyfélkommunikációs útmutató',
  ]

  return (
    <div>
      <div style={{ fontSize: 32, marginBottom: '0.25rem' }}>📄</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        Töltsd fel a GYIK-et vagy az ÁSZF-et
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '1rem' }}>
        Az AI ezekből a dokumentumokból tanulja meg a válaszokat. Minél több dokumentumot
        töltesz fel, annál pontosabb lesz.
      </p>

      <div style={{
        background: 'rgba(255,255,255,0.02)', borderRadius: 8,
        padding: '0.75rem 1rem', marginBottom: '1.25rem', border: `1px solid ${BORDER}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
          Javasolt dokumentumok
        </div>
        {suggestions.map(s => (
          <div key={s} style={{ fontSize: 12, color: MUTED, padding: '0.2rem 0', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: PRIMARY }}>›</span> {s}
          </div>
        ))}
      </div>

      <div
        onClick={() => !uploading && fileRef.current?.click()}
        style={{
          border: `2px dashed ${uploading ? ACCENT : BORDER}`,
          borderRadius: 12, padding: '2rem', textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'border-color 0.2s', marginBottom: '1rem',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: '0.5rem' }}>{uploading ? '⏳' : '☁️'}</div>
        <div style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>
          {uploading ? 'Feltöltés folyamatban...' : 'Kattints a fájl kiválasztásához'}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: '0.25rem' }}>
          PDF, DOCX, TXT — max. 20 MB
        </div>
      </div>
      <input
        ref={fileRef} type="file"
        accept=".pdf,.docx,.doc,.txt,.md"
        onChange={handleUpload} style={{ display: 'none' }}
      />

      {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: '0.75rem' }}>⚠ {error}</div>}

      {uploaded.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {uploaded.map((doc, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.5rem 0.875rem', borderRadius: 8,
              background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)',
            }}>
              <span style={{ color: GREEN, fontSize: 14 }}>✓</span>
              <span style={{ fontSize: 13, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {doc.name}
              </span>
              <span style={{ fontSize: 11, color: GREEN }}>Feltöltve</span>
            </div>
          ))}
        </div>
      )}

      {uploaded.length === 0 && (
        <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: '0.5rem' }}>
          Ez a lépés átugorható — dokumentumokat a feltöltés oldalon bármikor hozzáadhatsz.
        </div>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// STEP 6 — Kész + preview
// ══════════════════════════════════════════════════════════════
function Step6Done({ data, onComplete, completing }) {
  const steps = [
    { label: 'Iroda beállítva', done: !!data.step_3?.company_name },
    { label: 'Gmail kapcsolat', done: !!data.step_2?.gmail_address },
    { label: 'Dokumentum feltöltve', done: (data.step_5?.uploaded_docs?.length || 0) > 0 },
    { label: 'Szabályok beállítva', done: true },
  ]

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 48, marginBottom: '0.5rem' }}>🎉</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
          A DocuAgent készen áll!
        </h2>
        <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7 }}>
          Beállítás kész. Így néz ki, amikor az első ügyfél email megérkezik:
        </p>
      </div>

      {/* Email preview */}
      <div style={{
        background: 'rgba(26,86,219,0.06)', border: `1px solid rgba(26,86,219,0.2)`,
        borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: PRIMARY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.875rem' }}>
          Így fog működni ▾
        </div>
        {[
          { step: '1', icon: '📨', text: 'Ügyfél emailt küld az irodának' },
          { step: '2', icon: '🤖', text: 'Az AI azonnal felismeri: számla, NAV levél, kérdés?' },
          { step: '3', icon: '✍️', text: 'Válaszjavaslatot készít a feltöltött dokumentumok alapján' },
          { step: '4', icon: '👤', text: 'A könyvelő jóváhagyja, módosítja vagy elveti — 1 kattintással' },
          { step: '5', icon: '📤', text: 'Az email elküldésre kerül, a feladat lezárul' },
        ].map(({ step, icon, text }) => (
          <div key={step} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
              background: PRIMARY, color: 'white', fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{step}</div>
            <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
              {icon} {text}
            </div>
          </div>
        ))}
      </div>

      {/* Setup summary */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 10, padding: '1rem', marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          Összefoglaló
        </div>
        {steps.map(({ label, done }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.3rem 0', borderBottom: `1px solid ${BORDER}`,
          }}>
            <span style={{ fontSize: 13, color: done ? GREEN : MUTED }}>{done ? '✓' : '○'}</span>
            <span style={{ fontSize: 13, color: done ? TEXT : MUTED, flex: 1 }}>{label}</span>
            <span style={{ fontSize: 11, color: done ? GREEN : MUTED }}>{done ? 'Kész' : 'Átugorva'}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onComplete}
        disabled={completing}
        style={{
          ...btnPrimary(completing),
          background: completing ? 'rgba(255,120,32,0.4)' : ACCENT,
          padding: '0.75rem 2rem', fontSize: 14, width: '100%',
        }}
      >
        {completing ? 'Betöltés...' : '🚀 Jóváhagyási sor megnyitása'}
      </button>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// FŐ KOMPONENS
// ══════════════════════════════════════════════════════════════
export default function OnboardingPage() {
  const { authFetch, setOnboardingComplete } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const initialStep = parseInt(new URLSearchParams(location.search).get('step') || '0', 10)

  const [step,       setStep]       = useState(1)
  const [stepData,   setStepData]   = useState({})
  const [saving,     setSaving]     = useState(false)
  const [completing, setCompleting] = useState(false)
  const [loaded,     setLoaded]     = useState(false)

  useEffect(() => {
    async function loadState() {
      try {
        const res = await authFetch(`${apiUrl}/api/onboarding/state`)
        if (res.ok) {
          const json = await res.json()
          const ob = json.onboarding
          if (ob.is_complete) {
            navigate('/', { replace: true })
            return
          }
          setStep(initialStep > 0 ? initialStep : (ob.current_step || 1))
          setStepData(ob.metadata || {})
        }

        // Auto-seed accounting templates (idempotent)
        authFetch(`${apiUrl}/api/templates/seed-accounting`, { method: 'POST' }).catch(() => {})
      } catch (e) {
        console.error('Onboarding load error:', e)
      } finally {
        setLoaded(true)
      }
    }
    loadState()
  }, []) // eslint-disable-line

  const currentData = stepData[`step_${step}`] || {}

  function updateCurrentStep(data) {
    setStepData(prev => ({ ...prev, [`step_${step}`]: data }))
  }

  async function handleNext() {
    setSaving(true)
    try {
      const res = await authFetch(`${apiUrl}/api/onboarding/step`, {
        method: 'POST',
        body: JSON.stringify({ step, data: currentData }),
      })
      if (res.ok) {
        const json = await res.json()
        const ob = json.onboarding
        setStepData(ob.metadata || {})
        setStep(prev => Math.min(prev + 1, TOTAL_STEPS))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      await authFetch(`${apiUrl}/api/onboarding/step`, {
        method: 'POST',
        body: JSON.stringify({ step, data: currentData }),
      })
      await authFetch(`${apiUrl}/api/onboarding/complete`, { method: 'POST' })
      setOnboardingComplete(true)
      navigate('/approval', { replace: true })
    } catch (e) {
      console.error(e)
      setCompleting(false)
    }
  }

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: MUTED, fontSize: 14 }}>Betöltés...</div>
      </div>
    )
  }

  const progressPct = ((step - 1) / (TOTAL_STEPS - 1)) * 100
  const step1NextDisabled = step === 1 && false  // step 1 has no required fields
  const step3NextDisabled = step === 3 && !currentData.company_name?.trim()

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: 'inherit' }}>

      {/* Fejléc */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 16 }}>📊</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>DocuAgent</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED }}>Könyvelőiroda beállítási varázsló</div>
      </div>

      {/* Kártya */}
      <div style={{ width: '100%', maxWidth: 540, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{
            height: '100%', background: `linear-gradient(90deg, ${PRIMARY}, ${ACCENT})`,
            width: `${progressPct}%`, transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Lépés jelölők */}
        <div style={{ padding: '1.25rem 1.75rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => {
              const n = i + 1
              const done    = n < step
              const current = n === step
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? GREEN : current ? PRIMARY : 'rgba(255,255,255,0.08)',
                    color: done || current ? 'white' : MUTED,
                    transition: 'all 0.25s', flexShrink: 0,
                  }}>
                    {done ? '✓' : n}
                  </div>
                  {n < TOTAL_STEPS && (
                    <div style={{ width: 16, height: 1, background: done ? 'rgba(74,222,128,0.3)' : BORDER }} />
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace', flexShrink: 0, marginLeft: '0.5rem' }}>
            {step}/{TOTAL_STEPS} — {STEP_LABELS[step - 1]}
          </div>
        </div>

        {/* Tartalom */}
        <div style={{ padding: '1.75rem' }}>
          {step === 1 && <Step1Welcome />}
          {step === 2 && <Step2Gmail data={currentData} onChange={updateCurrentStep} />}
          {step === 3 && <Step3CompanyData data={currentData} onChange={updateCurrentStep} />}
          {step === 4 && <Step4Rules data={currentData} onChange={updateCurrentStep} />}
          {step === 5 && <Step5Documents data={currentData} onChange={updateCurrentStep} authFetch={authFetch} />}
          {step === 6 && <Step6Done data={stepData} onComplete={handleComplete} completing={completing} />}
        </div>

        {/* Navigáció (1–5. lépésnél) */}
        {step < TOTAL_STEPS && (
          <div style={{
            padding: '1rem 1.75rem 1.5rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: `1px solid ${BORDER}`,
          }}>
            <button
              onClick={() => setStep(prev => Math.max(prev - 1, 1))}
              disabled={step === 1}
              style={{ ...btnSecondary, opacity: step === 1 ? 0.4 : 1, cursor: step === 1 ? 'not-allowed' : 'pointer' }}
            >
              ← Vissza
            </button>
            <button
              onClick={handleNext}
              disabled={saving || step3NextDisabled}
              style={btnPrimary(saving || step3NextDisabled)}
            >
              {saving ? 'Mentés...' : step === TOTAL_STEPS - 1 ? 'Befejezés →' : 'Következő →'}
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', fontSize: 11, color: MUTED, textAlign: 'center' }}>
        {step < TOTAL_STEPS ? `Következő: ${STEP_LABELS[step]}` : 'Utolsó lépés'}
      </div>
    </div>
  )
}
