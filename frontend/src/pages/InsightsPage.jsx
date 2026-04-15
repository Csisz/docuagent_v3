import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { Skeleton } from '../components/ui'
import { useStore } from '../store'
import clsx from 'clsx'

const CATEGORY_LABELS = {
  complaint:   'Panasz',
  inquiry:     'Megkeresés',
  appointment: 'Időpontfoglalás',
  other:       'Egyéb',
}

export default function InsightsPage() {
  const { theme } = useStore()
  const isLight = theme === 'light'
  const [kpis,  setKpis]  = useState(null)
  const [ai,    setAi]    = useState(null)
  const [perf,  setPerf]  = useState(null)
  const [gw,    setGw]    = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [perfLoading,  setPerfLoading]  = useState(false)
  const [gwLoading,    setGwLoading]    = useState(false)
  const [days,  setDays]  = useState(7)

  useEffect(() => {
    api.dashboard().then(d => setKpis(d.kpis)).catch(() => {})
    loadAI()
  }, [])

  useEffect(() => {
    loadPerf()
    loadGateway()
  }, [days]) // eslint-disable-line

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

  async function loadPerf() {
    setPerfLoading(true)
    try {
      const d = await api.agentPerformance(days)
      setPerf(d)
    } catch {
      setPerf(null)
    } finally {
      setPerfLoading(false)
    }
  }

  async function loadGateway() {
    setGwLoading(true)
    try {
      const d = await api.gatewayStats(days)
      setGw(d)
    } catch {
      setGw(null)
    } finally {
      setGwLoading(false)
    }
  }

  return (
    <div className="animate-fade-up space-y-4">
      <p className="text-[13px] text-zinc-400 -mb-1">
        Részletes AI elemzés — azonosított problémák, trendek és javasolt teendők.
        <span className="text-zinc-600 text-[11px] ml-2">Ez az oldal mélyebb betekintést nyújt a Dashboard összefoglalójánál.</span>
      </p>

      {/* KPI mini kártyák */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiMini label="Tanulási korrekciók" value={kpis?.feedback_total?.value} sub="feedback bejegyzés"    color="orange" />
        <KpiMini label="Átlag konfidencia"   value={kpis?.avg_confidence?.value != null ? `${kpis.avg_confidence.value}%` : null} sub="AI döntések minősége" color="green" />
        <KpiMini label="AI megválaszolt"     value={kpis?.ai_answered?.value}    sub="automatikus"           color="purple" />
      </div>

      {/* AI elemzés */}
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

      {/* ── AI Gateway szekció ───────────────────────────────── */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-[13px] font-semibold text-white">AI Gateway</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              A rendszer automatikusan a legolcsóbb modellt választja feladattípus szerint
            </p>
          </div>
          <button className="btn-ghost text-[11px] px-3 py-1.5 flex items-center gap-1.5" onClick={loadGateway}>
            <span className={gwLoading ? 'animate-spin-slow inline-block' : ''}>↻</span>
          </button>
        </div>

        {/* 3 metrika kártya */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <PerfCard
            icon="⚡"
            label="GPT-4o-mini hívások"
            value={gwLoading ? null : (gw?.mini_calls ?? 0)}
            sub="gyors · olcsó"
            color="#60a5fa"
          />
          <PerfCard
            icon="🧠"
            label="GPT-4o hívások"
            value={gwLoading ? null : (gw?.smart_calls ?? 0)}
            sub="okos · insights + fontos válaszok"
            color="#a78bfa"
          />
          <PerfCard
            icon="💰"
            label="Becsült költség"
            value={gwLoading ? null : (gw?.estimated_cost_usd != null ? `$${gw.estimated_cost_usd.toFixed(4)}` : '$0.0000')}
            sub={`utolsó ${days} nap`}
            color="#4ade80"
          />
        </div>

        {/* Pie chart + task-type breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={clsx('rounded-lg p-4', isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/[.02] border border-white/7')}>
            <div className="text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500 mb-3">
              Mini vs Smart arány
            </div>
            {gwLoading
              ? <Skeleton className="h-36 w-full" />
              : <GatewayPieChart mini={gw?.mini_calls || 0} smart={gw?.smart_calls || 0} />
            }
          </div>
          <div className={clsx('rounded-lg p-4', isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/[.02] border border-white/7')}>
            <div className="text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500 mb-3">
              Feladattípusonként
            </div>
            {gwLoading
              ? <><Skeleton className="h-5 mb-2" /><Skeleton className="h-5 mb-2" /><Skeleton className="h-5 w-3/4" /></>
              : <TaskBreakdown rows={gw?.by_task || []} total={gw?.total_calls || 0} isLight={isLight} />
            }
          </div>
        </div>
      </div>

      {/* ── Agent Teljesítmény szekció ────────────────────────── */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-[13px] font-semibold text-white">Agent Teljesítmény</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">AI automatizálási metrikák az emailfeldolgozáshoz</p>
          </div>
          <div className="flex items-center gap-2">
            <DaysSelector value={days} onChange={d => setDays(d)} />
            <button className="btn-ghost text-[11px] px-3 py-1.5 flex items-center gap-1.5" onClick={loadPerf}>
              <span className={perfLoading ? 'animate-spin-slow inline-block' : ''}>↻</span>
            </button>
          </div>
        </div>

        {/* 4 metrika kártya */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <PerfCard
            icon="🤖"
            label="Automatizált válaszok"
            value={perfLoading ? null : perf?.automated_count ?? 0}
            sub="ez a periódusban"
            color="#1a56db"
          />
          <PerfCard
            icon="⏱️"
            label="Becsült időmegtakarítás"
            value={perfLoading ? null : (perf?.time_saved_hours != null ? `${perf.time_saved_hours} ó` : '0 ó')}
            sub="~3 perc/email alapján"
            color="#4ade80"
          />
          <PerfCard
            icon="🎯"
            label="Automatizálási arány"
            value={perfLoading ? null : (perf?.automation_rate != null ? `${perf.automation_rate}%` : '0%')}
            sub={null}
            color="#ff7820"
            extra={perf && !perfLoading ? <AutomationBar rate={perf.automation_rate} /> : null}
          />
          <PerfCard
            icon="📈"
            label="Átlag confidence"
            value={perfLoading ? null : (perf?.avg_confidence != null ? `${perf.avg_confidence}%` : '—')}
            sub="AI_ANSWERED emaileknél"
            color="#a78bfa"
          />
        </div>

        {/* Bar chart + Top kategóriák */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Bar chart — napi trend */}
          <div className={clsx('lg:col-span-3 rounded-lg p-4', isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/[.02] border border-white/7')}>
            <div className="text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500 mb-3">
              Napi emailfeldolgozás (automatizált vs manuális)
            </div>
            {perfLoading
              ? <Skeleton className="h-36 w-full" />
              : <DailyBarChart data={perf?.daily_trend || []} isLight={isLight} />
            }
          </div>

          {/* Top kategóriák táblázat */}
          <div className={clsx('lg:col-span-2 rounded-lg p-4', isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/[.02] border border-white/7')}>
            <div className="text-[10px] font-bold uppercase tracking-[.12em] text-zinc-500 mb-3">
              Top kategóriák
            </div>
            {perfLoading
              ? <><Skeleton className="h-5 mb-2" /><Skeleton className="h-5 mb-2" /><Skeleton className="h-5 mb-2 w-3/4" /></>
              : <CategoryTable rows={perf?.top_categories || []} isLight={isLight} />
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ── KPI mini (meglévő) ────────────────────────────────────────

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

// ── Agent Teljesítmény komponensek ────────────────────────────

function DaysSelector({ value, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/10">
      {[7, 14, 30].map(d => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={clsx(
            'px-3 py-1 text-[11px] font-mono transition-colors',
            value === d
              ? 'bg-[#1a56db] text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          {d}n
        </button>
      ))}
    </div>
  )
}

function PerfCard({ icon, label, value, sub, color, extra }) {
  return (
    <div className="bg-white/[.03] border border-white/7 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-[.10em] font-mono leading-tight">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ color }}>
        {value != null ? value : <Skeleton className="h-7 w-16 inline-block" />}
      </div>
      {sub && <div className="text-[10px] text-zinc-600 mt-1 font-mono">{sub}</div>}
      {extra && <div className="mt-2">{extra}</div>}
    </div>
  )
}

function AutomationBar({ rate }) {
  const pct = Math.min(100, Math.max(0, rate || 0))
  return (
    <div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: '#ff7820' }}
        />
      </div>
      <div className="text-[10px] text-zinc-600 mt-1 font-mono">
        {pct < 50 ? 'Alacsony' : pct < 75 ? 'Közepes' : 'Magas'} automatizálás
      </div>
    </div>
  )
}

function CategoryTable({ rows, isLight }) {
  if (!rows.length) {
    return <div className="text-[12px] text-zinc-600 text-center py-4">Nincs adat a kiválasztott periódusra.</div>
  }
  return (
    <div className="space-y-1">
      {/* Fejléc */}
      <div className="grid grid-cols-3 text-[9px] font-bold uppercase tracking-[.12em] text-zinc-600 pb-1 border-b border-white/7">
        <span>Kategória</span>
        <span className="text-right">Darab</span>
        <span className="text-right">Átlag conf.</span>
      </div>
      {rows.map(r => (
        <div key={r.category} className="grid grid-cols-3 text-[12px] py-1.5 border-b border-white/5 last:border-none items-center">
          <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>
            {CATEGORY_LABELS[r.category] || r.category}
          </span>
          <span className="text-right font-mono text-zinc-400">{r.count}</span>
          <span className="text-right font-mono" style={{ color: confidenceColor(r.avg_confidence) }}>
            {r.avg_confidence.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  )
}

function confidenceColor(pct) {
  if (pct >= 80) return '#4ade80'
  if (pct >= 60) return '#fbbf24'
  return '#f87171'
}

// ── Napi bar chart (Chart.js nélkül, inline canvas) ───────────

function DailyBarChart({ data, isLight }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data.length) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const W = canvas.clientWidth
    const H = canvas.clientHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, W, H)

    const pad   = { top: 8, right: 8, bottom: 28, left: 28 }
    const chartW = W - pad.left - pad.right
    const chartH = H - pad.top  - pad.bottom

    const maxVal = Math.max(...data.map(d => (d.automated || 0) + (d.manual || 0)), 1)
    const barGroup = chartW / data.length
    const barW     = Math.max(4, barGroup * 0.35)
    const gap      = barW * 0.3

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth   = 1
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + chartH - (i / 4) * chartH
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + chartW, y)
      ctx.stroke()
      // Label
      ctx.fillStyle  = 'rgba(255,255,255,0.25)'
      ctx.font       = `${8 * dpr / dpr}px monospace`
      ctx.textAlign  = 'right'
      ctx.fillText(Math.round(maxVal * i / 4), pad.left - 4, y + 3)
    }

    // Bars
    data.forEach((d, i) => {
      const x       = pad.left + i * barGroup + (barGroup - barW * 2 - gap) / 2
      const autoH   = chartH * ((d.automated || 0) / maxVal)
      const manualH = chartH * ((d.manual    || 0) / maxVal)

      // Automated bar (kék)
      ctx.fillStyle = '#1a56db'
      ctx.beginPath()
      ctx.roundRect?.(x, pad.top + chartH - autoH, barW, autoH, [2, 2, 0, 0]) ||
        ctx.rect(x, pad.top + chartH - autoH, barW, autoH)
      ctx.fill()

      // Manual bar (narancs)
      ctx.fillStyle = '#ff7820'
      ctx.beginPath()
      ctx.roundRect?.(x + barW + gap, pad.top + chartH - manualH, barW, manualH, [2, 2, 0, 0]) ||
        ctx.rect(x + barW + gap, pad.top + chartH - manualH, barW, manualH)
      ctx.fill()

      // X-axis label (dátum rövidítve)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font      = `${8 * dpr / dpr}px monospace`
      ctx.textAlign = 'center'
      const label   = d.day ? d.day.slice(5) : ''  // "MM-DD"
      ctx.fillText(label, x + barW + gap / 2, pad.top + chartH + 14)
    })

    // Jelmagyarázat
    const legX = pad.left
    const legY = H - 6
    ;[['#1a56db', 'Automatizált'], ['#ff7820', 'Manuális']].forEach(([col, lbl], i) => {
      const ox = legX + i * 110
      ctx.fillStyle = col
      ctx.fillRect(ox, legY - 5, 8, 5)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font      = `${8 * dpr / dpr}px monospace`
      ctx.textAlign = 'left'
      ctx.fillText(lbl, ox + 10, legY)
    })
  }, [data, isLight])

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-36 text-[12px] text-zinc-600">
        Nincs napi adat a kiválasztott periódusra.
      </div>
    )
  }

  return <canvas ref={canvasRef} style={{ width: '100%', height: 160, display: 'block' }} />
}

// ── AI Gateway komponensek ─────────────────────────────────────

function GatewayPieChart({ mini, smart }) {
  const canvasRef = useRef(null)
  const total = mini + smart

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const cx = W / 2
    const cy = H / 2
    const r  = Math.min(cx, cy) - 20

    if (total === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '11px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Nincs adat', cx, cy + 4)
      return
    }

    const miniAngle  = (mini  / total) * Math.PI * 2
    const smartAngle = (smart / total) * Math.PI * 2
    const start = -Math.PI / 2

    // Mini slice (kék)
    ctx.fillStyle = '#3b82f6'
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, start, start + miniAngle)
    ctx.closePath()
    ctx.fill()

    // Smart slice (lila)
    ctx.fillStyle = '#7c3aed'
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, start + miniAngle, start + miniAngle + smartAngle)
    ctx.closePath()
    ctx.fill()

    // Donut hole
    ctx.fillStyle = '#0a1628'
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
    ctx.fill()

    // Center text
    ctx.fillStyle = '#f1f5f9'
    ctx.font = `bold ${14 * dpr / dpr}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(total, cx, cy + 2)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = `${9 * dpr / dpr}px monospace`
    ctx.fillText('TOTAL', cx, cy + 14)

    // Legend
    const legY = H - 8
    ;[['#3b82f6', `Mini: ${mini} (${total ? Math.round(mini/total*100) : 0}%)`],
      ['#7c3aed', `Smart: ${smart} (${total ? Math.round(smart/total*100) : 0}%)`]
    ].forEach(([col, lbl], i) => {
      const ox = (i === 0 ? W * 0.15 : W * 0.55)
      ctx.fillStyle = col
      ctx.fillRect(ox, legY - 6, 8, 6)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = `${9 * dpr / dpr}px monospace`
      ctx.textAlign = 'left'
      ctx.fillText(lbl, ox + 11, legY)
    })
  }, [mini, smart, total])

  return <canvas ref={canvasRef} style={{ width: '100%', height: 150, display: 'block' }} />
}

const TASK_LABELS = {
  classify:  'Osztályozás',
  reply:     'Válaszgenerálás',
  insights:  'AI Insights',
  summarize: 'Összefoglalás',
  general:   'Általános',
}

const TASK_COLORS = {
  classify:  '#60a5fa',
  reply:     '#4ade80',
  insights:  '#a78bfa',
  summarize: '#fbbf24',
  general:   '#94a3b8',
}

function TaskBreakdown({ rows, total, isLight }) {
  if (!rows.length) {
    return <div className="text-[12px] text-zinc-600 text-center py-6">Nincs adat a kiválasztott periódusra.</div>
  }
  return (
    <div className="space-y-2.5">
      {rows.map(r => {
        const pct   = total > 0 ? Math.round(r.calls / total * 100) : 0
        const color = TASK_COLORS[r.task_type] || '#94a3b8'
        const label = TASK_LABELS[r.task_type] || r.task_type
        return (
          <div key={r.task_type}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>{label}</span>
              <span className="font-mono text-zinc-500">{r.calls} ({pct}%)</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
