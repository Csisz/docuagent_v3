import { useState, useEffect } from 'react'
import { api } from '../services/api'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function showToast(msg, ok = true) {
  const el = document.getElementById('toast-root')
  if (!el) return
  el.textContent = msg
  el.className = `toast-visible ${ok ? 'toast-ok' : 'toast-err'}`
  setTimeout(() => { el.className = '' }, 3000)
}

function StatusDot({ on, label, labelOff }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: on ? '#22c55e' : '#475569',
        boxShadow: on ? '0 0 6px rgba(34,197,94,.6)' : 'none',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 12, color: on ? '#4ade80' : '#64748b', fontWeight: 500 }}>
        {on ? (label || 'Összekötve') : (labelOff || 'Nincs összekötve')}
      </span>
    </div>
  )
}

function SoonBadge() {
  return (
    <span style={{
      background: 'rgba(245,158,11,.15)', color: '#fbbf24',
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 500,
    }}>Hamarosan</span>
  )
}

const cardStyle = {
  background: 'rgba(255,255,255,.04)',
  border: '1px solid rgba(255,255,255,.09)',
  borderRadius: 14,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

const btnPrimary = {
  background: '#1a56db', color: '#fff', border: 'none',
  borderRadius: 8, padding: '7px 16px', fontSize: 13,
  fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
}

const btnSecondary = {
  background: 'none',
  color: 'rgba(255,255,255,.5)',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 8, padding: '7px 16px', fontSize: 13, cursor: 'pointer',
  whiteSpace: 'nowrap',
}

function CardHeader({ icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,.07)', fontSize: 20,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.3 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,.07)' }} />
}

function CodeBlock({ value }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,.35)', borderRadius: 7, padding: '8px 12px',
      fontFamily: 'monospace', fontSize: 12, color: '#93c5fd',
      wordBreak: 'break-all', userSelect: 'all',
      border: '1px solid rgba(255,255,255,.07)',
    }}>
      {value}
    </div>
  )
}

// ── Gmail card ────────────────────────────────────────────────
function GmailCard({ status, onTest }) {
  const connected = status?.gmail?.connected
  const [testing, setTesting] = useState(false)

  async function test() {
    setTesting(true)
    try {
      await api.health()
      showToast('Backend elérhető ✓')
    } catch {
      showToast('Backend nem elérhető', false)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={cardStyle}>
      <CardHeader icon="📧" title="Gmail" subtitle="Google Workspace / személyes Gmail n8n-en keresztül" />
      <StatusDot on={connected} />
      {status?.gmail?.email && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>
          Összekötött fiók: <span style={{ color: '#e2e8f0' }}>{status.gmail.email}</span>
        </div>
      )}
      <Divider />
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', lineHeight: 1.6 }}>
        A Gmail integráció az n8n <strong style={{ color: 'rgba(255,255,255,.55)' }}>WF1 — Email Monitor</strong> workflow-n
        keresztül működik. Az n8n fogadja az emaileket és továbbítja a <code style={{ color: '#93c5fd' }}>/api/email-log</code> endpointra.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a
          href={`${status?.n8n?.url || 'http://localhost:5678'}/workflow`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}
        >
          n8n megnyitása →
        </a>
        <button style={btnSecondary} onClick={test} disabled={testing}>
          {testing ? 'Tesztelés...' : 'Kapcsolat tesztelése'}
        </button>
      </div>
    </div>
  )
}

// ── Outlook card ──────────────────────────────────────────────
function OutlookCard({ status, onSave }) {
  const connected = status?.outlook?.connected
  const [email, setEmail]       = useState(status?.outlook?.email || '')
  const [webhook, setWebhook]   = useState(status?.outlook?.webhook_url || '')
  const [enabled, setEnabled]   = useState(connected || false)
  const [saving, setSaving]     = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)

  useEffect(() => {
    if (status?.outlook) {
      setEmail(status.outlook.email || '')
      setWebhook(status.outlook.webhook_url || '')
      setEnabled(status.outlook.connected || false)
    }
  }, [status])

  const inboundWebhook = `${BASE}/api/integrations/outlook/webhook`

  async function save() {
    setSaving(true)
    try {
      await api.saveOutlookConfig({ email, webhook_url: webhook, enabled })
      showToast('Outlook konfig mentve')
      onSave?.()
    } catch (e) {
      showToast(`Hiba: ${e.message}`, false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <CardHeader icon="🪟" title="Outlook / Microsoft 365" subtitle="Microsoft 365 support n8n-en keresztül" />
        {!connected && <SoonBadge />}
      </div>
      <StatusDot on={connected} />
      <Divider />

      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', lineHeight: 1.6 }}>
        Konfiguráld az n8n <strong style={{ color: 'rgba(255,255,255,.55)' }}>Outlook Monitor</strong> workflow-t,
        hogy a beérkező emaileket a DocuAgent <strong style={{ color: '#93c5fd' }}>Inbound Webhook</strong> URL-re küldje.
        A rendszer ugyanolyan AI classify + válasz pipeline-t futtat, mint a Gmail esetén.
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Outlook email cím
        </label>
        <input
          style={inputStyle}
          placeholder="pl. support@ceg.hu"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            DocuAgent Inbound Webhook (n8n-be másolandó)
          </label>
          <button
            style={{ fontSize: 11, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onClick={() => setShowWebhook(v => !v)}
          >
            {showWebhook ? 'Elrejt' : 'Megmutat'}
          </button>
        </div>
        {showWebhook && <CodeBlock value={inboundWebhook} />}
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          n8n → Outlook kimenő webhook URL (opcionális)
        </label>
        <input
          style={inputStyle}
          placeholder="pl. http://n8n:5678/webhook/outlook-send"
          value={webhook}
          onChange={e => setWebhook(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setEnabled(v => !v)}
          style={{
            width: 36, height: 20, borderRadius: 10, position: 'relative',
            background: enabled ? '#1a56db' : 'rgba(255,255,255,.15)',
            border: 'none', cursor: 'pointer', transition: 'background .2s', flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: 3, width: 14, height: 14,
            borderRadius: '50%', background: '#fff',
            left: enabled ? 18 : 3, transition: 'left .2s',
          }} />
        </button>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>Integráció {enabled ? 'engedélyezve' : 'letiltva'}</span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btnPrimary} onClick={save} disabled={saving}>
          {saving ? 'Mentés...' : 'Beállítások mentése'}
        </button>
        <a
          href={`${status?.n8n?.url || 'http://localhost:5678'}/workflow`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}
        >
          n8n workflow →
        </a>
      </div>
    </div>
  )
}

// ── Calendar card ─────────────────────────────────────────────
function CalendarCard({ status }) {
  const connected = status?.calendar?.connected
  const lastSync  = status?.calendar?.last_sync
  const [syncing, setSyncing] = useState(false)

  async function triggerSync() {
    setSyncing(true)
    try {
      await api.calendarTriggerSync()
      showToast('Naptár szinkronizálás elindítva')
    } catch (e) {
      showToast(`Szinkronizálás nem indítható: ${e.message}`, false)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={cardStyle}>
      <CardHeader icon="📅" title="Google Calendar" subtitle="Esemény szinkronizálás n8n WF4-en keresztül" />
      <StatusDot on={connected} />
      {lastSync && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
          Utolsó szinkron: <span style={{ color: '#e2e8f0' }}>{new Date(lastSync).toLocaleString('hu-HU')}</span>
        </div>
      )}
      <Divider />
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', lineHeight: 1.6 }}>
        Az n8n <strong style={{ color: 'rgba(255,255,255,.55)' }}>WF4 — Calendar Sync</strong> workflow
        szinkronizálja a Google Calendar eseményeket. Az{' '}
        <code style={{ color: '#93c5fd' }}>N8N_CALENDAR_SYNC_WEBHOOK</code> env változóval konfigurálható.
      </div>
      <div>
        <button style={connected ? btnPrimary : btnSecondary} onClick={triggerSync} disabled={syncing || !connected}>
          {syncing ? 'Szinkronizálás...' : 'Szinkronizálás most'}
        </button>
        {!connected && (
          <div style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>
            Állítsd be az <code>N8N_CALENDAR_SYNC_WEBHOOK</code> értéket a .env fájlban.
          </div>
        )}
      </div>
    </div>
  )
}

// ── n8n card ──────────────────────────────────────────────────
function N8nCard({ status }) {
  const online = status?.n8n?.online
  const url    = status?.n8n?.url || 'http://localhost:5678'

  return (
    <div style={cardStyle}>
      <CardHeader icon="⚙️" title="n8n Automation" subtitle="Workflow automation engine" />
      <StatusDot on={online} label="Online" labelOff="Offline / nem elérhető" />
      <Divider />
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', lineHeight: 1.6 }}>
        Az n8n orchestrálja az összes email integráció logikáját: Gmail figyelés,
        Outlook fogadás, Calendar szinkron, válasz-küldés.
        Az URL az <code style={{ color: '#93c5fd' }}>N8N_BASE_URL</code> env változóból olvasódik.
      </div>
      <div>
        <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          n8n URL
        </label>
        <CodeBlock value={url} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block', opacity: online ? 1 : 0.5 }}
        >
          n8n megnyitása →
        </a>
        <a
          href={`${url}/workflow`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}
        >
          Workflow-k
        </a>
      </div>
    </div>
  )
}

// ── Widget configurator card ──────────────────────────────────
function WidgetCard({ status }) {
  const FRONTEND_BASE = window.location.origin
  const API_BASE      = BASE

  // Tenant slug az integráció státuszból (legelső elérhető)
  const defaultSlug = 'demo'

  const [color,   setColor]   = useState('#1a56db')
  const [welcome, setWelcome] = useState('Szia! Miben segíthetek?')
  const [slug,    setSlug]    = useState(defaultSlug)
  const [saving,  setSaving]  = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const widgetSrc = `${FRONTEND_BASE}/widget.html?tenant=${encodeURIComponent(slug)}&color=${encodeURIComponent(color)}&api_url=${encodeURIComponent(API_BASE)}`

  const snippet = `<!-- DocuAgent Chat Widget -->
<style>
  #da-iframe {
    position: fixed; bottom: 0; right: 0;
    width: 400px; height: 580px;
    border: none; z-index: 9999;
    background: transparent;
  }
  @media (max-width: 480px) {
    #da-iframe { width: 100vw; height: 100vh; }
  }
</style>
<iframe
  id="da-iframe"
  src="${widgetSrc}"
  title="Chat"
></iframe>`

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Másolás sikertelen', false)
    }
  }

  async function saveWidgetConfig() {
    setSaving(true)
    try {
      await api.saveWidgetConfig({ slug, color, welcome_message: welcome })
      showToast('Widget beállítások mentve')
    } catch (e) {
      showToast(`Hiba: ${e.message}`, false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
      <CardHeader icon="💬" title="Beágyazható Chat Widget" subtitle="Ügyfelek chat widgetje — embed kód generátor" />
      <Divider />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Bal: konfig */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Tenant slug
            </label>
            <input
              style={inputStyle}
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="pl. demo"
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Elsődleges szín
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ width: 40, height: 34, borderRadius: 6, border: '1px solid rgba(255,255,255,.2)', cursor: 'pointer', padding: 2, background: 'none' }}
              />
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={color}
                onChange={e => setColor(e.target.value)}
                placeholder="#1a56db"
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Üdvözlő üzenet
            </label>
            <input
              style={inputStyle}
              value={welcome}
              onChange={e => setWelcome(e.target.value)}
              placeholder="Szia! Miben segíthetek?"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btnPrimary} onClick={saveWidgetConfig} disabled={saving}>
              {saving ? 'Mentés...' : 'Beállítások mentése'}
            </button>
            <button
              style={{ ...btnSecondary }}
              onClick={() => setShowPreview(v => !v)}
            >
              {showPreview ? 'Előnézet elrejtése' : 'Előnézet'}
            </button>
          </div>
        </div>

        {/* Jobb: snippet + preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Embed kód
            </label>
            <button
              onClick={copySnippet}
              style={{ fontSize: 11, color: copied ? '#4ade80' : '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {copied ? '✓ Másolva!' : '📋 Másolás'}
            </button>
          </div>
          <div style={{
            background: 'rgba(0,0,0,.4)', borderRadius: 8, padding: '10px 14px',
            fontFamily: 'monospace', fontSize: 11, color: '#93c5fd',
            border: '1px solid rgba(255,255,255,.08)', lineHeight: 1.7,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 200, overflowY: 'auto',
          }}>
            {snippet}
          </div>

          {showPreview && (
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginBottom: 6 }}>
                Mini előnézet (csak localhost-on működik):
              </div>
              <div style={{ position: 'relative', height: 320, background: 'rgba(0,0,0,.3)', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
                <iframe
                  src={widgetSrc}
                  style={{ width: '100%', height: '100%', border: 'none', transform: 'scale(0.75)', transformOrigin: 'bottom right', width: '133%', height: '133%' }}
                  title="Widget előnézet"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function IntegrationsPage() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const s = await api.integrationsStatus()
      setStatus(s)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#050d18', color: '#e2e8f0', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>Integrációk</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.35)', marginTop: 3 }}>
            Külső rendszerek és automatizációk kezelése
          </div>
        </div>
        <button
          onClick={load}
          style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 6 }}
          disabled={loading}
        >
          <span style={{ fontSize: 14 }}>↻</span>
          {loading ? 'Frissítés...' : 'Frissítés'}
        </button>
      </div>

      {loading && !status ? (
        <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
          Státuszok betöltése...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
          gap: 20,
          maxWidth: 1100,
        }}>
          <GmailCard    status={status} />
          <OutlookCard  status={status} onSave={load} />
          <CalendarCard status={status} />
          <N8nCard      status={status} />
          <WidgetCard   status={status} />
        </div>
      )}
    </div>
  )
}
