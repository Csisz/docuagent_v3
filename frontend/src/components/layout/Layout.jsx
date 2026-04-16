import { useRef, useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar  from './Topbar'
import { useDashboard, useHealth } from '../../hooks'
import { useToast } from '../../hooks'
import { useStore } from '../../store'
import { useAuth } from '../../context/AuthContext'

const TAG_OPTIONS = [
  { value: 'general', label: 'Általános' },
  { value: 'billing', label: 'Számlázás / ÁFA' },
  { value: 'legal',   label: 'Jogi / NAV' },
  { value: 'hr',      label: 'HR / Bérszámfejtés' },
  { value: 'support', label: 'Ügyfélszolgálat' },
]

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function ConfidenceBadge({ confidence }) {
  if (confidence == null) return null
  if (confidence >= 0.8) return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, flexShrink: 0,
      background: 'rgba(74,222,128,0.15)', color: '#4ade80',
      border: '1px solid rgba(74,222,128,0.3)',
    }}>AI javasolt</span>
  )
  if (confidence >= 0.6) return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, flexShrink: 0,
      background: 'rgba(251,191,36,0.15)', color: '#fbbf24',
      border: '1px solid rgba(251,191,36,0.3)',
    }}>Valószínű</span>
  )
  return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, flexShrink: 0,
      background: 'rgba(100,116,139,0.15)', color: '#94a3b8',
      border: '1px solid rgba(100,116,139,0.3)',
    }}>Általános</span>
  )
}

export default function Layout() {
  const fileRef     = useRef()
  const openModalFn = useRef(null)   // always-fresh ref to avoid stale closure in event listener
  const toast       = useToast()
  const { reload }  = useDashboard()
  const { theme }   = useStore()
  const { authFetch, isDemo, user } = useAuth()

  const [uploadQueue,    setUploadQueue]    = useState([])
  const [pendingFiles,   setPendingFiles]   = useState([])
  const [fileTags,       setFileTags]       = useState({})   // { filename: tag }
  const [suggestions,    setSuggestions]    = useState({})   // { filename: { suggested_tag, confidence } }
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [syncAll,        setSyncAll]        = useState(false)
  const [showTagModal,   setShowTagModal]   = useState(false)

  useHealth()

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }

  // Opens the tag modal and kicks off AI tag suggestions for each file
  async function openModal(files) {
    const initTags = {}
    files.forEach(f => { initTags[f.name] = 'general' })
    setPendingFiles(files)
    setFileTags(initTags)
    setSuggestions({})
    setSyncAll(false)
    setShowTagModal(true)
    setSuggestLoading(true)

    await Promise.all(files.map(async (f) => {
      try {
        const res = await authFetch(`${BASE_URL}/api/documents/suggest-tag`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: f.name }),
        })
        if (res.ok) {
          const data = await res.json()
          setSuggestions(prev => ({ ...prev, [f.name]: data }))
          setFileTags(prev => ({ ...prev, [f.name]: data.suggested_tag }))
        }
      } catch {
        // keep 'general' on error
      }
    }))

    setSuggestLoading(false)
  }

  // Keep ref fresh every render so the useEffect listener never captures a stale version
  openModalFn.current = openModal

  // Listen for 'docuagent:triggerupload' dispatched by DocsPage drop zone and Topbar button
  useEffect(() => {
    function handleTrigger(e) {
      if (e.detail?.files?.length) {
        openModalFn.current(e.detail.files)
      } else {
        fileRef.current?.click()
      }
    }
    window.addEventListener('docuagent:triggerupload', handleTrigger)
    return () => window.removeEventListener('docuagent:triggerupload', handleTrigger)
  }, [])

  function handleFileSelect(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    e.target.value = ''
    openModal(files)
  }

  function setFileTag(filename, tag) {
    setFileTags(prev => ({ ...prev, [filename]: tag }))
  }

  function handleSyncAllToggle(checked) {
    setSyncAll(checked)
    if (checked) {
      // Sync all files to first file's current tag
      const firstTag = fileTags[pendingFiles[0]?.name] || 'general'
      const synced = {}
      pendingFiles.forEach(f => { synced[f.name] = firstTag })
      setFileTags(synced)
    }
  }

  function handleSyncTagChange(tag) {
    const synced = {}
    pendingFiles.forEach(f => { synced[f.name] = tag })
    setFileTags(synced)
  }

  async function handleUpload() {
    setShowTagModal(false)
    const files = pendingFiles
    if (!files.length) return

    const queue = files.map(f => ({
      name: f.name,
      size: Math.round(f.size / 1024),
      state: 'waiting',
      info: '',
    }))
    setUploadQueue(queue)

    let doneCount = 0, errCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const tag  = fileTags[file.name] || 'general'

      setUploadQueue(q => q.map((item, idx) =>
        idx === i ? { ...item, state: 'uploading', info: 'Feltöltés...' } : item
      ))

      const fd = new FormData()
      fd.append('file', file)
      fd.append('uploader_name', user?.full_name || user?.email || 'Ismeretlen')
      fd.append('tag', tag)

      try {
        const res = await authFetch(`${BASE_URL}/api/upload`, {
          method: 'POST',
          body: fd,
          signal: AbortSignal.timeout(60000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const d = await res.json()
        setUploadQueue(q => q.map((item, idx) =>
          idx === i ? { ...item, state: 'processing', info: 'Qdrant indexelés...' } : item
        ))
        await new Promise(r => setTimeout(r, 400))
        setUploadQueue(q => q.map((item, idx) =>
          idx === i ? { ...item, state: 'done', info: `${d.size_kb}KB · ${d.lang} · Qdrant: ${d.qdrant ? '✓' : '–'}` } : item
        ))
        doneCount++
      } catch (err) {
        setUploadQueue(q => q.map((item, idx) =>
          idx === i ? { ...item, state: 'error', info: err.message.slice(0, 40) } : item
        ))
        errCount++
      }
    }

    if (doneCount > 0) {
      toast(`✅ ${doneCount} dokumentum feltöltve`, 'ok')
      await reload()
      window.dispatchEvent(new CustomEvent('docuagent:uploaded'))
    }
    if (errCount > 0) toast(`⚠️ ${errCount} fájl feltöltése sikertelen`, 'err')
    if (errCount === 0) setTimeout(() => setUploadQueue([]), 5000)
  }

  const stateIcon  = { waiting: '⏳', uploading: '🔄', processing: '⚙️', done: '✅', error: '❌' }
  const stateColor = { waiting: '#71717a', uploading: '#60a5fa', processing: '#60a5fa', done: '#4ade80', error: '#f87171' }
  const barWidth   = { waiting: '0%', uploading: '55%', processing: '85%', done: '100%', error: '100%' }
  const barBg      = { waiting: '#3f3f46', uploading: '#3b82f6', processing: '#3b82f6', done: '#22c55e', error: '#ef4444' }

  const isSingle   = pendingFiles.length === 1
  const singleFile = isSingle ? pendingFiles[0] : null
  const singleTag  = singleFile ? (fileTags[singleFile.name] || 'general') : 'general'
  const singleSugg = singleFile ? suggestions[singleFile.name] : null
  // For the sync-all selector, read back from fileTags so it stays in sync
  const syncTagValue = fileTags[pendingFiles[0]?.name] || 'general'

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', color: 'var(--text)', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar button dispatches the same event as DocsPage */}
        <Topbar
          onUpload={() => window.dispatchEvent(new CustomEvent('docuagent:triggerupload'))}
          isDemo={isDemo}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.csv,.md"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {/* ── Tag / category modal ── */}
        {showTagModal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}>
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 28,
              width: isSingle ? 360 : 480, maxWidth: '92vw',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              maxHeight: '85vh', overflowY: 'auto',
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                Dokumentum kategória
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                {pendingFiles.length} fájl · Melyik kategóriába kerüljön?
              </div>

              {/* AI loading indicator */}
              {suggestLoading && (
                <div style={{
                  fontSize: 12, color: '#60a5fa', marginBottom: 14,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{
                    display: 'inline-block',
                    animation: 'spin 1.2s linear infinite',
                  }}>⟳</span>
                  AI elemzi a fájlt...
                </div>
              )}

              {/* ── Single file: full radio list ── */}
              {isSingle && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {TAG_OPTIONS.map(opt => {
                    const isSelected  = singleTag === opt.value
                    const isSuggested = singleSugg?.suggested_tag === opt.value
                    return (
                      <label key={opt.value} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                        transition: 'border-color 0.12s, background 0.12s',
                      }}>
                        <input
                          type="radio"
                          name="tag"
                          value={opt.value}
                          checked={isSelected}
                          onChange={() => setFileTag(singleFile.name, opt.value)}
                          style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 14, flex: 1 }}>{opt.label}</span>
                        {isSuggested && !suggestLoading && singleSugg && (
                          <ConfidenceBadge confidence={singleSugg.confidence} />
                        )}
                        <span style={{
                          fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace',
                        }}>
                          {opt.value}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}

              {/* ── Multiple files: compact per-file selects ── */}
              {!isSingle && (
                <div style={{ marginBottom: 20 }}>
                  {/* Sync-all checkbox */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginBottom: 12, padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={syncAll}
                        onChange={e => handleSyncAllToggle(e.target.checked)}
                        style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                      />
                      Mindegyik ugyanolyan
                    </label>
                    {syncAll && (
                      <select
                        value={syncTagValue}
                        onChange={e => handleSyncTagChange(e.target.value)}
                        style={{
                          background: 'var(--card)', border: '1px solid var(--accent)',
                          borderRadius: 6, color: 'var(--text)', padding: '4px 8px',
                          fontSize: 13, outline: 'none', cursor: 'pointer',
                        }}
                      >
                        {TAG_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* File rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pendingFiles.map(f => {
                      const sugg = suggestions[f.name]
                      const tag  = fileTags[f.name] || 'general'
                      return (
                        <div key={f.name} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'rgba(255,255,255,0.02)',
                        }}>
                          <span style={{ fontSize: 15, flexShrink: 0 }}>📄</span>
                          <span style={{
                            fontSize: 12, flex: 1, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            color: 'var(--text)',
                          }} title={f.name}>{f.name}</span>
                          {sugg && !suggestLoading && (
                            <ConfidenceBadge confidence={sugg.confidence} />
                          )}
                          <select
                            value={tag}
                            disabled={syncAll}
                            onChange={e => setFileTag(f.name, e.target.value)}
                            style={{
                              background: 'var(--card)',
                              border: `1px solid ${syncAll ? 'var(--border)' : 'var(--accent)'}`,
                              borderRadius: 6,
                              color: syncAll ? 'var(--muted)' : 'var(--text)',
                              padding: '4px 8px', fontSize: 12, outline: 'none',
                              flexShrink: 0,
                              cursor: syncAll ? 'not-allowed' : 'pointer',
                              opacity: syncAll ? 0.6 : 1,
                            }}
                          >
                            {TAG_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowTagModal(false)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--muted)',
                    cursor: 'pointer', fontSize: 14,
                  }}
                >
                  Mégse
                </button>
                <button
                  onClick={handleUpload}
                  style={{
                    flex: 2, padding: '9px 0', borderRadius: 8, border: 'none',
                    background: 'var(--accent)', color: '#fff',
                    cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  }}
                >
                  Feltöltés
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Upload progress toasts ── */}
        {uploadQueue.length > 0 && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {uploadQueue.map((item, i) => (
              <div key={i} style={{
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 14px', minWidth: 260, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span>{stateIcon[item.state]}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: '#27272a', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: barWidth[item.state], background: barBg[item.state], transition: 'width 0.4s ease' }} />
                </div>
                {item.info && (
                  <div style={{ fontSize: 11, color: stateColor[item.state], marginTop: 4 }}>
                    {item.info}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
