import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../../store'
import { useAuth } from '../../context/AuthContext'
import { LiveDot } from '../ui'

const TITLES = {
  '/':             { cat: 'DocuAgent', title: 'Dashboard' },
  '/emails':       { cat: 'DocuAgent', title: 'Email kezelés' },
  '/attention':    { cat: 'DocuAgent', title: 'Figyelmet igényel' },
  '/docs':         { cat: 'DocuAgent', title: 'Dokumentumok' },
  '/insights':     { cat: 'DocuAgent', title: 'AI Insights' },
  '/reports':      { cat: 'DocuAgent', title: 'Riportok' },
  '/chat':         { cat: 'DocuAgent', title: 'Chat asszisztens' },
  '/calendar':     { cat: 'DocuAgent', title: 'Naptár' },
  '/approval':     { cat: 'DocuAgent', title: 'Senior jóváhagyás' },
  '/templates':    { cat: 'DocuAgent', title: 'Sablonok' },
  '/agents':       { cat: 'Rendszer',  title: 'Agent kezelő' },
  '/audit':        { cat: 'Rendszer',  title: 'Audit napló' },
  '/crm':          { cat: 'DocuAgent', title: 'CRM' },
  '/integrations': { cat: 'Rendszer',  title: 'Integrációk' },
  '/errors':       { cat: 'Rendszer',  title: 'Hibák & Újrapróbálás' },
}

export default function Topbar({ onUpload, isDemo }) {
  const { pathname } = useLocation()
  const { liveStatus, liveTime, toggleMobileNav, theme } = useStore()
  const { authFetch } = useAuth()
  const { cat, title } = TITLES[pathname] || { cat: 'DocuAgent', title: pathname }
  const { dotClass, chipClass } = LiveDot({ status: liveStatus })
  const [resetting, setResetting] = useState(false)
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  async function handleDemoReset() {
    if (resetting) return
    setResetting(true)
    try {
      const res = await authFetch(`${apiUrl}/api/demo/reset`, { method: 'POST' })
      if (res.ok) {
        const json = await res.json()
        window.dispatchEvent(new CustomEvent('docuagent:demo-reset', { detail: json.stats }))
        // Reload the page to reflect fresh data
        setTimeout(() => window.location.reload(), 300)
      }
    } catch (e) {
      console.error('Demo reset failed:', e)
    } finally {
      setResetting(false)
    }
  }

  const statusText = {
    ok:      'Live',
    error:   'Offline',
    loading: 'Betöltés...',
  }[liveStatus] || 'Live'

  return (
    <header className={clsx(
      'flex items-center justify-between',
      theme === 'light'
        ? 'bg-white/90 border-b border-slate-200'
        : 'bg-[rgba(7,7,26,0.75)]',
      'backdrop-blur-xl px-4 md:px-6 h-14 flex-shrink-0',
      'relative'
    )}>
      {/* Topbar glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#ff7820] to-transparent opacity-30" />

      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          className={clsx(
            'lg:hidden mr-1 p-1',
            theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-white/50 hover:text-white'
          )}
          onClick={toggleMobileNav}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z"/>
          </svg>
        </button>

        <div>
          <div className={clsx('text-[9.5px] uppercase tracking-[.16em] font-mono hidden sm:block', theme === 'light' ? 'text-slate-400' : 'text-white/35')}>{cat}</div>
          <div className={clsx('text-[17px] font-bold leading-tight tracking-[-0.4px]', theme === 'light' ? 'text-slate-800' : 'text-white')}>{title}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Live status */}
        <div className={clsx('hidden sm:flex items-center gap-1.5 text-[10.5px] font-mono px-2.5 py-1 rounded border', chipClass)}>
          <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} />
          <span>{statusText}</span>
          {liveTime && <span className="opacity-50 ml-0.5">{liveTime}</span>}
        </div>

        {/* Demo reset gomb */}
        {isDemo && (
          <button
            onClick={handleDemoReset}
            disabled={resetting}
            className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-150"
            style={{
              background: resetting ? 'rgba(161,108,0,0.15)' : 'rgba(255,120,32,0.12)',
              color: resetting ? 'rgba(255,120,32,0.5)' : '#ff7820',
              border: '1px solid rgba(255,120,32,0.25)',
              cursor: resetting ? 'not-allowed' : 'pointer',
            }}
          >
            <span>{resetting ? '⏳' : '🔄'}</span>
            <span>{resetting ? 'Reset...' : 'Demo reset'}</span>
          </button>
        )}

        {/* Export */}
        {!isDemo && (
          <button className="btn-ghost text-xs px-3 py-1.5 hidden sm:block">
            ↓ Export
          </button>
        )}

        {/* Upload */}
        <button
          className="btn-neon text-xs px-3 py-1.5"
          onClick={onUpload}
        >
          <span className="hidden sm:inline">+ Dokumentum</span>
          <span className="sm:hidden">+</span>
        </button>
      </div>
    </header>
  )
}
