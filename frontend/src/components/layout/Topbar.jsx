import { useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../../store'
import { LiveDot } from '../ui'

const TITLES = {
  '/':          { cat: 'DocuAgent', title: 'Dashboard' },
  '/emails':    { cat: 'DocuAgent', title: 'Email kezelés' },
  '/attention': { cat: 'DocuAgent', title: 'Figyelmet igényel' },
  '/docs':      { cat: 'DocuAgent', title: 'Dokumentumok' },
  '/insights':  { cat: 'DocuAgent', title: 'AI Insights' },
}

export default function Topbar({ onUpload }) {
  const { pathname } = useLocation()
  const { liveStatus, liveTime, toggleMobileNav, theme } = useStore()
  const { cat, title } = TITLES[pathname] || { cat: 'DocuAgent', title: pathname }
  const { dotClass, chipClass } = LiveDot({ status: liveStatus })

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
        : 'bg-[rgba(7,7,26,0.75)] border-b border-white/7',
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

        {/* Export */}
        <button className="btn-ghost text-xs px-3 py-1.5 hidden sm:block">
          ↓ Export
        </button>

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
