import { useEffect, useState, useCallback } from 'react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Skeleton } from '../components/ui'
import clsx from 'clsx'

function ConfirmModal({ doc, onConfirm, onCancel, deleting }) {
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') onCancel()
  }, [onCancel])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1a2e', borderRadius: 12, padding: '1.5rem',
          width: '90%', maxWidth: 380,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f1f1', marginBottom: '0.5rem' }}>
          Dokumentum törlése
        </div>

        <div style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.55 }}>
          Biztosan törlöd ezt a dokumentumot?
        </div>
        <div style={{ fontWeight: 500, color: '#dc2626', margin: '0.75rem 0', fontSize: 13,
          wordBreak: 'break-word' }}>
          "{doc.filename}"
        </div>
        <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: '1.25rem' }}>
          Ez a művelet nem vonható vissza és a vektoros indexből is törli.
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: 'transparent', color: '#a1a1aa',
              border: '1px solid #e0e0e0', cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            Mégse
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: '#dc2626', color: 'white',
              border: 'none', cursor: deleting ? 'not-allowed' : 'pointer',
              minWidth: 80, opacity: deleting ? 0.7 : 1, transition: 'opacity 0.15s',
            }}
          >
            {deleting ? 'Törlés...' : 'Törlés'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DocsPage() {
  const [docs, setDocs]           = useState(null)
  const [vectors, setVectors]     = useState(0)
  const [dragging, setDragging]   = useState(false)
  const [confirmDoc, setConfirmDoc] = useState(null)   // { id, filename }
  const [deleting, setDeleting]   = useState(false)

  const { authFetch } = useAuth()
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadDocs = () => {
    api.dashboard().then(d => {
      setDocs(d.documents || [])
      setVectors(d.meta?.qdrant_vectors || 0)
    }).catch(() => setDocs([]))
  }

  useEffect(() => {
    loadDocs()
    window.addEventListener('docuagent:uploaded', loadDocs)
    return () => window.removeEventListener('docuagent:uploaded', loadDocs)
  }, [])

  function triggerUpload() {
    document.getElementById('fileIn')?.click()
  }

  async function handleDelete() {
    if (!confirmDoc) return
    const docId = confirmDoc.id

    // Optimistic update — azonnal eltávolítjuk a listából
    setDocs(prev => prev.filter(d => d.id !== docId))
    setConfirmDoc(null)

    try {
      const res = await authFetch(`${apiUrl}/api/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      loadDocs()  // szerver-szinkron frissítés siker esetén
    } catch {
      loadDocs()  // revert: visszatöltjük a tényleges listát hiba esetén
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const files = e.dataTransfer?.files
    if (!files?.length) return
    // Simulate file input change event with the dropped files
    const input = document.getElementById('fileIn')
    if (!input) return
    // Create a new DataTransfer and set files
    const dt = new DataTransfer()
    Array.from(files).forEach(f => dt.items.add(f))
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const extColors = {
    docx: { bg: 'bg-blue-500/10',  text: 'text-blue-400' },
    pdf:  { bg: 'bg-red-500/10',   text: 'text-red-400' },
    xlsx: { bg: 'bg-green-500/10', text: 'text-green-400' },
    txt:  { bg: 'bg-zinc-500/10',  text: 'text-zinc-400' },
    csv:  { bg: 'bg-yellow-500/10',text: 'text-yellow-400' },
    md:   { bg: 'bg-purple-500/10',text: 'text-purple-400' },
  }

  return (
    <div className="animate-fade-up">
      {confirmDoc && (
        <ConfirmModal
          doc={confirmDoc}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => !deleting && setConfirmDoc(null)}
        />
      )}
      <p className="text-[11.5px] text-zinc-500 font-mono mb-3">
        {docs ? `${docs.length} dokumentum · Qdrant: ${vectors} vektor indexelve` : 'Betöltés...'}
      </p>

      {/* ── Drop zone ── */}
      <div
        onClick={triggerUpload}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? 'rgba(251,146,60,0.7)' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: 12,
          padding: '28px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 20,
          background: dragging ? 'rgba(251,146,60,0.05)' : 'rgba(255,255,255,0.02)',
          transition: 'border-color .2s, background .2s',
        }}
      >
        <div style={{ fontSize: 26, marginBottom: 6 }}>📂</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#e4e4e7', marginBottom: 3 }}>
          Húzd ide a fájlokat, vagy kattints a tallózáshoz
        </div>
        <div style={{ fontSize: 11, color: '#52525b' }}>
          PDF, DOCX, XLSX, TXT, CSV, MD · max 20MB/fájl · egyszerre több fájl is
        </div>
      </div>

      {/* ── Doc grid ── */}
      {docs === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3].map(i => (
            <div key={i} className="glass-card">
              <Skeleton className="h-4 mb-2" /><Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="glass-card text-center py-12">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-400/20 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-6 h-6 text-blue-400">
              <path d="M4 4h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" strokeLinejoin="round"/>
              <path d="M12 4v4h4M8 11v4M6 13h4" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="text-[15px] font-medium mb-2">Még nincs feltöltött dokumentum</div>
          <div className="text-zinc-500 text-[13px] mb-4">Töltsd fel a belső szabályzatokat, ÁSZF-et vagy egyéb dokumentumokat, amiket az AI felhasználhat a válaszadáshoz.</div>
          <button
            onClick={triggerUpload}
            className="btn-neon text-[13px] px-4 py-2"
          >
            + Első dokumentum feltöltése
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {docs.map(d => {
            const c = extColors[d.ext] || { bg: 'bg-white/5', text: 'text-zinc-500' }
            return (
              <div key={d.id} className="glass-card hover:border-white/13 transition-all relative group">
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDoc({ id: d.id, filename: d.filename }) }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 text-zinc-500 hover:text-red-400 hover:border-red-400/40 hover:bg-red-500/10"
                  title="Dokumentum törlése"
                >
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3 h-3">
                    <path d="M2 3h8M4.5 3V2h3v1M4.5 5v4M7.5 5v4M2.5 3l.5 7h6l.5-7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <span className={clsx('text-[9px] font-bold font-mono px-2 py-0.5 rounded inline-block mb-2', c.bg, c.text)}>
                  {(d.ext || '?').toUpperCase()}
                </span>
                <div className="text-[13.5px] font-medium text-white truncate group-hover:text-orange-400 transition-colors">{d.filename}</div>
                <div className="text-[11px] text-zinc-500 font-mono mt-1">{d.uploader} · {d.size_kb}KB · {d.lang} · {d.date}</div>
                <div className="mt-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">{d.tag}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
