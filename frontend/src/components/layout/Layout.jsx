import { useRef } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar  from './Topbar'
import { useDashboard, useHealth } from '../../hooks'
import { api } from '../../services/api'
import { useToast } from '../../hooks'
import { useStore } from '../../store'

export default function Layout() {
  const fileRef  = useRef()
  const toast    = useToast()
  const { reload } = useDashboard()
  const { theme } = useStore()
  useHealth()

  // Apply theme class on mount and when theme changes
  // (handled in store.setTheme, but init on mount)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('uploader_name', 'Viktor H.')
    fd.append('tag', 'general')
    toast(`Feltöltés: ${file.name}...`)
    try {
      const d = await api.upload(fd)
      toast(`✓ ${d.filename} (${d.size_kb}KB · Qdrant: ${d.qdrant ? '✓' : '—'})`, 'ok')
      // Immediately reload dashboard data so new doc appears
      await reload()
      // Also dispatch custom event so DocsPage can refresh
      window.dispatchEvent(new CustomEvent('docuagent:uploaded'))
    } catch (err) {
      toast(`Hiba: ${err.message}`, 'err')
    }
    e.target.value = ''
  }

  return (
    <div className="flex min-h-screen bg-cinematic bg-dots">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* ── fileRef passed down so BOTH topbar and docs page can trigger upload ── */}
        <Topbar onUpload={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          id="fileIn"
          type="file"
          className="hidden"
          accept=".pdf,.docx,.xlsx,.txt,.csv,.md"
          onChange={handleUpload}
        />
        <main className="flex-1 overflow-y-auto px-4 md:px-6 py-5 pb-16">
          <Outlet />
        </main>
      </div>

      <div id="toast-root" />
    </div>
  )
}
