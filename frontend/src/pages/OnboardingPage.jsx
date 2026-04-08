import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TEMPLATE_META = {
  accounting: { icon: '📊', color: '#4ade80', label: 'Könyvelés' },
  legal:      { icon: '⚖️', color: '#a78bfa', label: 'Jog' },
  sales:      { icon: '📈', color: '#fbbf24', label: 'Sales' },
  hr:         { icon: '👥', color: '#38bdf8', label: 'HR' },
}

// ── Konstansok ────────────────────────────────────────────────
const TOTAL_STEPS = 5
const ACCENT  = '#ff7820'
const PRIMARY = '#1a56db'
const BG      = '#050d18'
const CARD    = '#0d1b2e'
const BORDER  = 'rgba(255,255,255,0.08)'
const TEXT    = '#e2e8f0'
const MUTED   = '#64748b'

const STEP_LABELS = ['Üdvözlő', 'Gmail', 'Dokumentum', 'AI Teszt', 'Kész']

// ── Stílus segédfüggvények ────────────────────────────────────
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
// STEP 1 — Üdvözlő + sablon választó + cégadatok
// ══════════════════════════════════════════════════════════════
function Step1Welcome({ data, onChange, templates, onApplyTemplate }) {
  return (
    <div>
      <div style={{ fontSize: 28, marginBottom: '0.25rem' }}>👋</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        Üdvözlünk a DocuAgentben!
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '1.5rem' }}>
        Pár perc alatt beállítjuk a rendszert. Kezdd egy iparági sablonnal vagy add meg a cégadatokat manuálisan.
      </p>

      {/* Sablon választó */}
      {templates.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem' }}>
            Gyors indulás — válassz sablont
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {templates.map(t => {
              const meta = TEMPLATE_META[t.category] || { icon: '🤖', color: PRIMARY, label: t.category }
              const isSelected = data.template_id === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => onApplyTemplate(t)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                    padding: '0.625rem 0.875rem', borderRadius: 9, cursor: 'pointer',
                    background: isSelected ? `${meta.color}18` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isSelected ? meta.color + '44' : BORDER}`,
                    transition: 'all 0.15s', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: 10, color: meta.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {meta.label}
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ marginLeft: 'auto', color: meta.color, fontSize: 13, flexShrink: 0 }}>✓</span>
                  )}
                </button>
              )
            })}
          </div>
          {data.template_id && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: '0.5rem', textAlign: 'center' }}>
              Sablon kiválasztva — a beállítások automatikusan érvényesülnek.
              <button
                onClick={() => onChange({ ...data, template_id: undefined, template_name: undefined })}
                style={{ marginLeft: '0.5rem', color: MUTED, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}
              >
                Törlés
              </button>
            </div>
          )}
          <div style={{ height: 1, background: BORDER, margin: '1.25rem 0' }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
        <div>
          <label style={labelStyle}>Cégnév *</label>
          <input
            style={inputStyle}
            placeholder="pl. Agentify Kft."
            value={data.company_name || ''}
            onChange={e => onChange({ ...data, company_name: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>Iparág</label>
          <select
            style={{ ...inputStyle, appearance: 'none' }}
            value={data.industry || ''}
            onChange={e => onChange({ ...data, industry: e.target.value })}
          >
            <option value="">Válassz iparágat...</option>
            <option value="tech">Technológia / SaaS</option>
            <option value="legal">Jog / Ügyvédi iroda</option>
            <option value="finance">Pénzügy / Számvitel</option>
            <option value="hr">HR / Munkaerő</option>
            <option value="logistics">Logisztika</option>
            <option value="retail">Kereskedelem</option>
            <option value="other">Egyéb</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Kapcsolattartó neve</label>
          <input
            style={inputStyle}
            placeholder="pl. Nagy János"
            value={data.contact_name || ''}
            onChange={e => onChange({ ...data, contact_name: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>Telefon (opcionális)</label>
          <input
            style={inputStyle}
            placeholder="+36 30 123 4567"
            value={data.phone || ''}
            onChange={e => onChange({ ...data, phone: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// STEP 2 — Gmail összekötés (n8n-re mutat)
// ══════════════════════════════════════════════════════════════
function Step2Gmail({ data, onChange }) {
  const n8nUrl = import.meta.env.VITE_N8N_PUBLIC_URL || 'http://localhost:5678'

  return (
    <div>
      <div style={{ fontSize: 28, marginBottom: '0.25rem' }}>📧</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        Gmail összekötése
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '1.5rem' }}>
        Az automatikus email-feldolgozáshoz össze kell kötnöd a Gmail fiókodat az n8n workflow-val.
      </p>

      <div style={{
        background: 'rgba(26,86,219,0.08)', border: `1px solid rgba(26,86,219,0.25)`,
        borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Hogyan csatlakozz?
        </div>
        {[
          '1. Kattints az "n8n megnyitása" gombra',
          '2. Nyisd meg a WF1 — Gmail Sync workflow-t',
          '3. Gmail credential-t add hozzá a Gmail node-okhoz',
          '4. Aktiváld a workflow-t (Toggle: Active)',
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
        🔗 n8n megnyitása
      </a>

      <div>
        <label style={labelStyle}>Figyelendő Gmail cím</label>
        <input
          style={inputStyle}
          type="email"
          placeholder="pl. info@cegem.hu"
          value={data.gmail_address || ''}
          onChange={e => onChange({ ...data, gmail_address: e.target.value })}
        />
        <div style={{ fontSize: 11, color: MUTED, marginTop: '0.375rem' }}>
          Ezt az emailt fogja az n8n figyelni. Megadása opcionális, átugorható.
        </div>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// STEP 3 — Dokumentum feltöltés
// ══════════════════════════════════════════════════════════════
function Step3Documents({ data, onChange, authFetch }) {
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
      const res = await authFetch(`${apiUrl}/api/upload`, {
        method: 'POST', body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const newDocs = [...uploaded, { name: file.name, id: json.document?.id }]
      setUploaded(newDocs)
      onChange({ ...data, uploaded_docs: newDocs })
    } catch (err) {
      setError('Feltöltési hiba. Ellenőrizd a fájl formátumát (PDF, DOCX, TXT).')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <div style={{ fontSize: 28, marginBottom: '0.25rem' }}>📄</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        Tudásbázis feltöltése
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '1.5rem' }}>
        Töltsd fel az első dokumentumokat, amiket az AI felhasználhat az email-válaszokhoz.
        Legalább egy dokumentumot ajánlott feltölteni.
      </p>

      {/* Feltöltés gomb */}
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
        <div style={{ fontSize: 32, marginBottom: '0.5rem' }}>
          {uploading ? '⏳' : '☁️'}
        </div>
        <div style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>
          {uploading ? 'Feltöltés folyamatban...' : 'Kattints a fájl kiválasztásához'}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: '0.25rem' }}>
          PDF, DOCX, TXT, XLSX — max. 20 MB
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.csv,.md"
        onChange={handleUpload}
        style={{ display: 'none' }}
      />

      {error && (
        <div style={{ fontSize: 12, color: '#f87171', marginBottom: '0.75rem' }}>⚠ {error}</div>
      )}

      {/* Feltöltött fájlok listája */}
      {uploaded.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {uploaded.map((doc, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.5rem 0.875rem', borderRadius: 8,
              background: 'rgba(74,222,128,0.07)',
              border: '1px solid rgba(74,222,128,0.2)',
            }}>
              <span style={{ color: '#4ade80', fontSize: 14 }}>✓</span>
              <span style={{ fontSize: 13, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {doc.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {uploaded.length === 0 && (
        <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: '0.5rem' }}>
          Ez a lépés átugorható — dokumentumokat később is feltölthetsz.
        </div>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// STEP 4 — AI teszt email
// ══════════════════════════════════════════════════════════════
function Step4AiTest({ data, onChange, authFetch }) {
  const apiUrl  = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const [testing,  setTesting]  = useState(false)
  const [result,   setResult]   = useState(data.test_result || null)
  const [subject,  setSubject]  = useState(data.test_subject || 'Szeretnék érdeklődni a szolgáltatásaitokról')
  const [body,     setBody]     = useState(data.test_body || 'Üdvözletem! Érdeklődni szeretnék önöknél, milyen lehetőségek vannak az együttműködésre.')

  async function runTest() {
    setTesting(true)
    setResult(null)
    try {
      const res = await authFetch(`${apiUrl}/classify`, {
        method: 'POST',
        body: JSON.stringify({ subject, body, sender: 'teszt@pelda.hu' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setResult({ ok: true, ...json })
      onChange({ ...data, test_result: { ok: true, ...json }, test_subject: subject, test_body: body })
    } catch (e) {
      setResult({ ok: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 28, marginBottom: '0.25rem' }}>🤖</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        AI osztályozás tesztelése
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '1.5rem' }}>
        Küldj egy teszt emailt az AI rendszernek, és nézd meg hogyan osztályozza.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Email tárgy</label>
          <input
            style={inputStyle}
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Email szöveg</label>
          <textarea
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, minHeight: 80 }}
            rows={4}
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </div>
      </div>

      <button
        onClick={runTest}
        disabled={testing || !subject.trim()}
        style={btnPrimary(testing || !subject.trim())}
      >
        {testing ? '⏳ Feldolgozás...' : '▶ Teszt futtatása'}
      </button>

      {result && (
        <div style={{
          marginTop: '1.25rem', padding: '1rem 1.25rem',
          borderRadius: 10,
          background: result.ok ? 'rgba(74,222,128,0.07)' : 'rgba(248,113,113,0.07)',
          border: `1px solid ${result.ok ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
        }}>
          {result.ok ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4ade80', marginBottom: '0.625rem' }}>
                ✓ Az AI sikeresen osztályozta az emailt
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {[
                  ['Kategória', result.category],
                  ['Státusz',   result.status],
                  ['Urgencia',  result.urgent ? 'Sürgős' : 'Nem sürgős'],
                  ['Confidence', result.confidence != null ? `${(result.confidence * 100).toFixed(0)}%` : '—'],
                ].map(([label, val]) => val && (
                  <div key={label} style={{
                    padding: '0.25rem 0.75rem', borderRadius: 6, fontSize: 12,
                    background: 'rgba(255,255,255,0.06)', color: TEXT,
                  }}>
                    <span style={{ color: MUTED }}>{label}: </span>{val}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#f87171' }}>
              ⚠ Hiba: {result.error} — Az AI teszt kihagyható, később is elvégezhető.
            </div>
          )}
        </div>
      )}

      {!result && (
        <div style={{ fontSize: 12, color: MUTED, marginTop: '0.75rem' }}>
          Ez a lépés átugorható, ha az OpenAI kulcs még nincs beállítva.
        </div>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════
// STEP 5 — Kész
// ══════════════════════════════════════════════════════════════
function Step5Done({ data, onComplete, completing }) {
  const steps = [
    { label: 'Cégadatok', done: !!data.step_1?.company_name },
    { label: 'Gmail',     done: !!data.step_2?.gmail_address },
    { label: 'Dokumentumok', done: (data.step_3?.uploaded_docs?.length || 0) > 0 },
    { label: 'AI teszt',  done: !!data.step_4?.test_result?.ok },
  ]

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: '0.75rem' }}>🎉</div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: TEXT, marginBottom: '0.5rem' }}>
        Minden készen áll!
      </h2>
      <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: '2rem' }}>
        A DocuAgent be van állítva. A dashboardon nyomon követheted az emaileket, dokumentumokat és az AI teljesítményét.
      </p>

      {/* Összefoglaló */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: '1.25rem', marginBottom: '2rem', textAlign: 'left',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.875rem' }}>
          Beállítási összefoglaló
        </div>
        {steps.map(({ label, done }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.375rem 0',
            borderBottom: `1px solid ${BORDER}`,
          }}>
            <span style={{ fontSize: 14, color: done ? '#4ade80' : MUTED }}>
              {done ? '✓' : '○'}
            </span>
            <span style={{ fontSize: 13, color: done ? TEXT : MUTED, flex: 1 }}>{label}</span>
            <span style={{ fontSize: 11, color: done ? '#4ade80' : MUTED }}>
              {done ? 'Kész' : 'Átugorva'}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onComplete}
        disabled={completing}
        style={{
          ...btnPrimary(completing),
          background: completing ? 'rgba(255,120,32,0.4)' : ACCENT,
          padding: '0.75rem 2rem', fontSize: 14,
        }}
      >
        {completing ? 'Betöltés...' : '🚀 Dashboard megnyitása'}
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
  const [stepData,   setStepData]   = useState({})  // { step_1: {}, step_2: {}, ... }
  const [saving,     setSaving]     = useState(false)
  const [completing, setCompleting] = useState(false)
  const [loaded,     setLoaded]     = useState(false)
  const [templates,  setTemplates]  = useState([])

  // Állapot + sablonok betöltése
  useEffect(() => {
    async function loadAll() {
      try {
        const [stateRes, tplRes] = await Promise.all([
          authFetch(`${apiUrl}/api/onboarding/state`),
          authFetch(`${apiUrl}/api/templates`),
        ])
        if (stateRes.ok) {
          const json = await stateRes.json()
          const ob = json.onboarding
          if (ob.is_complete) {
            navigate('/', { replace: true })
            return
          }
          setStep(initialStep > 0 ? initialStep : (ob.current_step || 1))
          setStepData(ob.metadata || {})
        }
        if (tplRes.ok) {
          const tJson = await tplRes.json()
          setTemplates(tJson.templates || [])
        }
      } catch (e) {
        console.error('Onboarding load error:', e)
      } finally {
        setLoaded(true)
      }
    }
    loadAll()
  }, []) // eslint-disable-line

  async function handleApplyTemplate(template) {
    // Sablon azonnal alkalmazza a backend config-ba
    try {
      await authFetch(`${apiUrl}/api/templates/${template.id}/apply`, { method: 'POST' })
    } catch (e) {
      console.error('Template apply error:', e)
    }
    // Step1 adatba mentjük a sablon infot
    updateCurrentStep({ ...currentData, template_id: template.id, template_name: template.name })
  }

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
      // Utolsó lépés mentése
      await authFetch(`${apiUrl}/api/onboarding/step`, {
        method: 'POST',
        body: JSON.stringify({ step, data: currentData }),
      })
      await authFetch(`${apiUrl}/api/onboarding/complete`, { method: 'POST' })
      setOnboardingComplete(true)
      navigate('/', { replace: true })
    } catch (e) {
      console.error(e)
      setCompleting(false)
    }
  }

  // ── Betöltés ─────────────────────────────────────────────
  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: MUTED, fontSize: 14 }}>Betöltés...</div>
      </div>
    )
  }

  const progressPct = ((step - 1) / (TOTAL_STEPS - 1)) * 100

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: 'inherit' }}>

      {/* Fejléc */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 16 16" fill="none" style={{ width: 16, height: 16 }}>
              <path d="M3 8h5M9 4l4 4-4 4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="4.5" cy="8" r="1.5" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>DocuAgent</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED, fontFamily: 'monospace' }}>Beállítási varázsló</div>
      </div>

      {/* Kártya */}
      <div style={{ width: '100%', maxWidth: 520, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{
            height: '100%', background: `linear-gradient(90deg, ${PRIMARY}, ${ACCENT})`,
            width: `${progressPct}%`, transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Lépés számozás */}
        <div style={{ padding: '1.25rem 1.75rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => {
              const n = i + 1
              const done    = n < step
              const current = n === step
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? '#4ade80' : current ? PRIMARY : 'rgba(255,255,255,0.08)',
                    color: done || current ? 'white' : MUTED,
                    transition: 'all 0.25s',
                    flexShrink: 0,
                  }}>
                    {done ? '✓' : n}
                  </div>
                  {n < TOTAL_STEPS && (
                    <div style={{ width: 20, height: 1, background: done ? '#4ade8044' : BORDER }} />
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace' }}>
            {step}/{TOTAL_STEPS} — {STEP_LABELS[step - 1]}
          </div>
        </div>

        {/* Tartalom */}
        <div style={{ padding: '1.75rem' }}>
          {step === 1 && <Step1Welcome data={currentData} onChange={updateCurrentStep} templates={templates} onApplyTemplate={handleApplyTemplate} />}
          {step === 2 && <Step2Gmail data={currentData} onChange={updateCurrentStep} />}
          {step === 3 && <Step3Documents data={currentData} onChange={updateCurrentStep} authFetch={authFetch} />}
          {step === 4 && <Step4AiTest data={currentData} onChange={updateCurrentStep} authFetch={authFetch} />}
          {step === 5 && (
            <Step5Done
              data={stepData}
              onComplete={handleComplete}
              completing={completing}
            />
          )}
        </div>

        {/* Navigációs gombok (1-4 lépésnél) */}
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
              disabled={saving || (step === 1 && !currentData.company_name?.trim())}
              style={btnPrimary(saving || (step === 1 && !currentData.company_name?.trim()))}
            >
              {saving ? 'Mentés...' : step === TOTAL_STEPS - 1 ? 'Befejezés →' : 'Következő →'}
            </button>
          </div>
        )}
      </div>

      {/* Lépés neve alul */}
      <div style={{ marginTop: '1.25rem', fontSize: 11, color: MUTED, textAlign: 'center' }}>
        {step < TOTAL_STEPS ? `${STEP_LABELS[step]} következik` : 'Az utolsó lépésnél jársz'}
      </div>
    </div>
  )
}
