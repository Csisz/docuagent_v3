import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Skeleton } from '../components/ui'
import clsx from 'clsx'

export default function DocsPage() {
  const [docs, setDocs] = useState(null)
  const [vectors, setVectors] = useState(0)

  const loadDocs = () => {
    api.dashboard().then(d => {
      setDocs(d.documents || [])
      setVectors(d.meta?.qdrant_vectors || 0)
    }).catch(() => setDocs([]))
  }

  useEffect(() => {
    loadDocs()
    // Refresh when a new file is uploaded from topbar
    window.addEventListener('docuagent:uploaded', loadDocs)
    return () => window.removeEventListener('docuagent:uploaded', loadDocs)
  }, [])

  const extColors = {
    docx: { bg: 'bg-blue-500/10',  text: 'text-blue-400' },
    pdf:  { bg: 'bg-red-500/10',   text: 'text-red-400' },
    xlsx: { bg: 'bg-green-500/10', text: 'text-green-400' },
  }

  return (
    <div className="animate-fade-up">
      <p className="text-[11.5px] text-zinc-500 font-mono mb-1">
        {docs ? `${docs.length} dokumentum · Qdrant: ${vectors} vektor indexelve` : 'Betöltés...'}
      </p>
      <div className="flex items-center gap-3 mb-5">
        <button className="btn-neon text-sm" onClick={() => document.getElementById('fileIn')?.click()}>
          + Dokumentum feltöltése
        </button>
        <span className="text-[12px] text-zinc-600">PDF, DOCX, XLSX, TXT · max 20MB</span>
      </div>

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
          <div className="text-3xl mb-3">📄</div>
          <div className="text-zinc-500">Még nincs feltöltött dokumentum</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {docs.map(d => {
            const c = extColors[d.ext] || { bg: 'bg-white/5', text: 'text-zinc-500' }
            return (
              <div key={d.id} className="glass-card hover:border-white/13 cursor-pointer group transition-all">
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
