import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Skeleton } from '../components/ui'
import { useStore } from '../store'
import clsx from 'clsx'

export default function InsightsPage() {
  const { theme } = useStore()
  const isLight = theme === 'light'
  const [kpis, setKpis]       = useState(null)
  const [ai, setAi]           = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.dashboard().then(d => setKpis(d.kpis)).catch(() => {})
    loadAI()
  }, [])

  async function loadAI() {
    setLoading(true)
    try {
      const d = await api.aiInsights()
      setAi(d.ai)
    } catch {
      setAi({ problems: ['AI nem elérhető'], trends: [], recommendations: [] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-up space-y-4">
      <p className="text-[13px] text-zinc-400 -mb-1">
        Részletes AI elemzés az utolsó 7 napra — azonosított problémák, trendek és javasolt teendők.
        <span className="text-zinc-600 text-[11px] ml-2">Ez az oldal mélyebb betekintést nyújt a Dashboard összefoglalójánál.</span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiMini label="Tanulási korrekciók" value={kpis?.feedback_total?.value} sub="feedback bejegyzés"    color="orange" />
        <KpiMini label="Átlag konfidencia"   value={kpis?.avg_confidence?.value != null ? `${kpis.avg_confidence.value}%` : null} sub="AI döntések minősége" color="green" />
        <KpiMini label="AI megválaszolt"     value={kpis?.ai_answered?.value}    sub="automatikus"           color="purple" />
      </div>

      <div className="glass-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[13px] font-semibold text-white">Részletes AI elemzés</h3>
          <button className="btn-ghost text-[11px] px-3 py-1.5 flex items-center gap-1.5" onClick={loadAI}>
            <span className={loading ? 'animate-spin-slow inline-block' : ''}>↻</span> Frissítés
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <AIBlock label="Azonosított problémák" color="red"   items={ai?.problems}       loading={loading} isLight={isLight} />
          <AIBlock label="Észlelt trendek"       color="amber" items={ai?.trends}          loading={loading} isLight={isLight} />
          <AIBlock label="Ajánlott teendők"      color="green" items={ai?.recommendations} loading={loading} isLight={isLight} />
        </div>
      </div>
    </div>
  )
}

function KpiMini({ label, value, sub, color }) {
  const colors = {
    orange: { bar: 'bg-gradient-to-b from-[#ff7820] to-[#ff4500]', val: 'text-[#ff7820]' },
    green:  { bar: 'bg-green-400',  val: 'text-green-400' },
    purple: { bar: 'bg-purple-400', val: 'text-purple-400' },
  }[color]
  return (
    <div className="glass-card pl-5 relative overflow-hidden">
      <div className={clsx('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl', colors.bar)} />
      <div className="text-[9.5px] text-zinc-500 uppercase tracking-[.10em] font-mono mb-1.5">{label}</div>
      <div className={clsx('text-3xl font-bold tracking-tight', colors.val)}>
        {value != null ? value : <Skeleton className="h-8 w-14 inline-block" />}
      </div>
      <div className="text-[10px] font-mono text-zinc-500 mt-1">{sub}</div>
    </div>
  )
}

function AIBlock({ label, color, items, loading, isLight }) {
  const colors = { red: 'text-red-400', amber: 'text-amber-400', green: 'text-green-400' }
  const arrows = { red: 'text-red-500', amber: 'text-amber-500', green: 'text-green-500' }
  return (
    <div className={clsx('border rounded-lg p-3', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[.03] border-white/7')}>
      <div className={clsx('text-[8.5px] font-bold uppercase tracking-[.14em] font-mono mb-2', colors[color])}>{label}</div>
      {loading
        ? <><Skeleton className="h-2.5 mb-1.5" /><Skeleton className="h-2.5 w-3/4 mb-1.5" /><Skeleton className="h-2.5 w-1/2" /></>
        : (items || []).map((t, i) => (
          <div key={i} className={clsx('flex gap-2 py-1.5 border-b last:border-none text-[12.5px]', isLight ? 'text-slate-600 border-slate-100' : 'text-zinc-400 border-white/5')}>
            <span className={clsx('text-[11px] flex-shrink-0 mt-0.5', arrows[color])}>→</span>
            <span>{t}</span>
          </div>
        ))
      }
    </div>
  )
}
