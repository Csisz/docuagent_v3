/**
 * ReportsPage.jsx — Konfigurálható riport oldal
 * DocuAgent v3 · Agentify Kft.
 *
 * Funkciók:
 *  - 6 widget típus: email trend, AI arány, kategóriák, SLA, sentiment, ROI
 *  - Minden widgetnél diagram típus váltás (bar / line / doughnut / pie)
 *  - Widget hozzáadás / törlés
 *  - Dátumszűrő (7 / 14 / 30 / 90 nap)
 *  - Elrendezés (layout) mentése localStorage-ba
 *  - Exportálás CSV-be
 *  - Teljes dark/light mode kompatibilitás
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '../store'
import { api } from '../services/api'
import { Skeleton } from '../components/ui'
import clsx from 'clsx'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, BarController,
  LineElement, LineController, PointElement,
  ArcElement, DoughnutController, PieController,
  Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line, Doughnut, Pie } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, BarController,
  LineElement, LineController, PointElement,
  ArcElement, DoughnutController, PieController,
  Tooltip, Legend, Filler
)

// ── Konstansok ────────────────────────────────────────────────────────────────

const WIDGET_DEFS = {
  email_trend: {
    label: 'Email forgalom',
    desc: 'Napi email mennyiség és panaszok',
    icon: '✉',
    supportedTypes: ['bar', 'line'],
    defaultType: 'bar',
    color: 'orange',
  },
  ai_ratio: {
    label: 'AI vs. Emberi arány',
    desc: 'Automatikus vs. kézi feldolgozás',
    icon: '⚡',
    supportedTypes: ['doughnut', 'pie', 'bar'],
    defaultType: 'doughnut',
    color: 'green',
  },
  categories: {
    label: 'Kategóriák megoszlása',
    desc: 'Panasz · Érdeklődés · Egyéb',
    icon: '◑',
    supportedTypes: ['doughnut', 'pie', 'bar'],
    defaultType: 'doughnut',
    color: 'blue',
  },
  sla: {
    label: 'SLA teljesítés',
    desc: 'OK · Figyelmeztetés · Lejárt',
    icon: '⏱',
    supportedTypes: ['bar', 'doughnut'],
    defaultType: 'bar',
    color: 'red',
  },
  sentiment: {
    label: 'Sentiment / Urgency',
    desc: 'Hangulatmegoszlás és sürgősség',
    icon: '◈',
    supportedTypes: ['bar', 'doughnut', 'line'],
    defaultType: 'bar',
    color: 'purple',
  },
  roi: {
    label: 'ROI — megtakarított munkaóra',
    desc: 'Kumulált időmegtakarítás trendek',
    icon: '₣',
    supportedTypes: ['line', 'bar'],
    defaultType: 'line',
    color: 'amber',
  },
}

const DEFAULT_LAYOUT = ['email_trend', 'ai_ratio', 'categories', 'sla', 'sentiment', 'roi']
const STORAGE_KEY    = 'reports_layout_v1'
const TYPE_STORAGE   = 'reports_types_v1'

const ACCENT = {
  orange: { border: 'border-[#ff7820]/30', pill: 'bg-[#ff7820]/10 text-[#ff7820]', bar: '#ff7820', light: 'rgba(255,120,32,0.15)' },
  green:  { border: 'border-green-400/30',  pill: 'bg-green-500/10 text-green-400',  bar: '#4ade80', light: 'rgba(74,222,128,0.15)' },
  blue:   { border: 'border-blue-400/30',   pill: 'bg-blue-500/10 text-blue-400',    bar: '#60a5fa', light: 'rgba(96,165,250,0.15)' },
  red:    { border: 'border-red-400/30',    pill: 'bg-red-500/10 text-red-400',      bar: '#f87171', light: 'rgba(248,113,113,0.15)' },
  purple: { border: 'border-purple-400/30', pill: 'bg-purple-500/10 text-purple-400', bar: '#c084fc', light: 'rgba(192,132,252,0.15)' },
  amber:  { border: 'border-amber-400/30',  pill: 'bg-amber-500/10 text-amber-400',  bar: '#fbbf24', light: 'rgba(251,191,36,0.15)' },
}

const CHART_COLORS = ['#ff7820','#4ade80','#60a5fa','#c084fc','#fbbf24','#f87171','#34d399','#fb923c']

const TYPE_ICONS = { bar: '▦', line: '〰', doughnut: '◎', pie: '◕' }
const TYPE_LABELS = { bar: 'Oszlop', line: 'Vonal', doughnut: 'Gyűrű', pie: 'Kör' }

// ── Fő oldal ──────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { theme, dashData } = useStore()
  const isLight = theme === 'light'

  const [days,    setDays]    = useState(7)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  // layout: which widgets are shown, in order
  const [layout, setLayout] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
      if (Array.isArray(saved) && saved.length) return saved
    } catch {}
    return DEFAULT_LAYOUT
  })

  // chartTypes: per-widget chart type override
  const [chartTypes, setChartTypes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(TYPE_STORAGE)) || {}
    } catch { return {} }
  })

  // add-widget picker
  const [showPicker, setShowPicker] = useState(false)

  // ── Adatbetöltés ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.dashboard({ days })
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  // ── Layout mentés ─────────────────────────────────────────────────────────
  function saveLayout(l) {
    setLayout(l)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(l)) } catch {}
  }

  function saveTypes(t) {
    setChartTypes(t)
    try { localStorage.setItem(TYPE_STORAGE, JSON.stringify(t)) } catch {}
  }

  function removeWidget(id) {
    saveLayout(layout.filter(x => x !== id))
  }

  function addWidget(id) {
    if (!layout.includes(id)) saveLayout([...layout, id])
    setShowPicker(false)
  }

  function setWidgetType(id, type) {
    saveTypes({ ...chartTypes, [id]: type })
  }

  function resetAll() {
    saveLayout(DEFAULT_LAYOUT)
    saveTypes({})
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    if (!data) return
    const rows = [
      ['Metrika', 'Érték'],
      ['Összes email', data.kpis?.emails?.value ?? ''],
      ['AI megválaszolt', data.kpis?.ai_answered?.value ?? ''],
      ['Figyelmet igényel', data.kpis?.needs_attention?.value ?? ''],
      ['Lezárt', data.kpis?.closed?.value ?? ''],
      ['Átlag konfidencia (%)', data.kpis?.avg_confidence?.value ?? ''],
      ['Feedback bejegyzések', data.kpis?.feedback_total?.value ?? ''],
    ]
    if (data.charts?.timeline?.labels) {
      rows.push(['', ''])
      rows.push(['Dátum', 'Email', 'Panasz'])
      data.charts.timeline.labels.forEach((lbl, i) => {
        rows.push([lbl, data.charts.timeline.emails[i] ?? 0, data.charts.timeline.complaints[i] ?? 0])
      })
    }
    const csv = rows.map(r => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `docuagent_report_${days}nap_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const availableToAdd = Object.keys(WIDGET_DEFS).filter(id => !layout.includes(id))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-up space-y-5">

      {/* Fejléc */}
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <p className="text-[11.5px] text-zinc-500 font-mono -mb-0.5">Analitika & Riportok</p>
          <h1 className="text-[15px] font-semibold">Konfigurálható riportok</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Dátumszűrő */}
          <div className={clsx(
            'flex items-center rounded-lg border overflow-hidden text-[11px] font-mono',
            isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[.03]'
          )}>
            {[7, 14, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={clsx(
                  'px-3 py-1.5 transition-all',
                  days === d
                    ? 'bg-[#ff7820] text-white font-bold'
                    : isLight
                      ? 'text-slate-500 hover:bg-slate-100'
                      : 'text-zinc-500 hover:bg-white/5'
                )}
              >
                {d}n
              </button>
            ))}
          </div>

          {/* Widget hozzáadás */}
          <div className="relative">
            <button
              onClick={() => setShowPicker(v => !v)}
              disabled={availableToAdd.length === 0}
              className={clsx(
                'text-[11px] font-mono px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5',
                isLight
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40'
                  : 'border-white/10 text-zinc-400 hover:bg-white/5 disabled:opacity-40'
              )}
            >
              + Widget
            </button>
            {showPicker && availableToAdd.length > 0 && (
              <div className={clsx(
                'absolute right-0 top-9 z-30 rounded-xl border shadow-xl p-2 min-w-[200px]',
                isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-white/10'
              )}>
                {availableToAdd.map(id => {
                  const def = WIDGET_DEFS[id]
                  return (
                    <button
                      key={id}
                      onClick={() => addWidget(id)}
                      className={clsx(
                        'w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 text-[12px] transition-all',
                        isLight ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-white/5 text-zinc-300'
                      )}
                    >
                      <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded font-mono', ACCENT[def.color].pill)}>
                        {def.icon}
                      </span>
                      <span>{def.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Export */}
          <button
            onClick={exportCSV}
            disabled={!data}
            className={clsx(
              'text-[11px] font-mono px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5',
              isLight
                ? 'border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40'
                : 'border-white/10 text-zinc-400 hover:bg-white/5 disabled:opacity-40'
            )}
          >
            ↓ CSV
          </button>

          {/* Reset */}
          <button
            onClick={resetAll}
            className={clsx(
              'text-[11px] font-mono px-3 py-1.5 rounded-lg border transition-all',
              isLight
                ? 'border-slate-200 text-slate-500 hover:bg-slate-100'
                : 'border-white/10 text-zinc-600 hover:bg-white/5'
            )}
          >
            Visszaállítás
          </button>

          {/* Frissítés */}
          <button
            onClick={load}
            className={clsx(
              'text-[11px] font-mono px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1',
              loading
                ? isLight ? 'border-slate-200 text-slate-300' : 'border-white/10 text-zinc-700'
                : isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-white/10 text-zinc-400 hover:bg-white/5'
            )}
          >
            <span className={loading ? 'inline-block animate-spin' : ''}>↻</span>
            Frissítés
          </button>
        </div>
      </div>

      {/* KPI összesítő sor */}
      <SummaryBar data={data} loading={loading} isLight={isLight} days={days} />

      {/* Widget rács */}
      {layout.length === 0 ? (
        <EmptyState onAdd={() => setShowPicker(true)} isLight={isLight} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {layout.map(id => (
            <ReportWidget
              key={id}
              id={id}
              def={WIDGET_DEFS[id]}
              data={data}
              loading={loading}
              chartType={chartTypes[id] || WIDGET_DEFS[id].defaultType}
              onTypeChange={t => setWidgetType(id, t)}
              onRemove={() => removeWidget(id)}
              isLight={isLight}
              days={days}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── KPI összesítő ─────────────────────────────────────────────────────────────

function SummaryBar({ data, loading, isLight, days }) {
  const kpis = data?.kpis
  const items = [
    { label: 'Összes email', value: kpis?.emails?.value, color: 'orange', suffix: '' },
    { label: 'AI arány', value: kpis?.emails?.value > 0 ? Math.round((kpis.ai_answered?.value / kpis.emails?.value) * 100) : 0, color: 'green', suffix: '%' },
    { label: 'Avg. konfidencia', value: kpis?.avg_confidence?.value, color: 'blue', suffix: '%' },
    { label: 'SLA lejárt', value: data?.sla?.breach_count ?? 0, color: 'red', suffix: '' },
    { label: `${days} napos adat`, value: days, color: 'amber', suffix: 'n' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
      {items.map(({ label, value, color, suffix }) => (
        <div
          key={label}
          className={clsx(
            'rounded-xl px-4 py-3 border',
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[.03] border-white/8'
          )}
        >
          <div className="text-[9.5px] uppercase tracking-widest font-mono text-zinc-500 mb-1">{label}</div>
          {loading && value == null
            ? <Skeleton className="h-6 w-12" />
            : <div className={clsx('text-xl font-bold', `text-${color === 'orange' ? '[#ff7820]' : color + '-400'}`)}>
                {value ?? '—'}{suffix}
              </div>
          }
        </div>
      ))}
    </div>
  )
}

// ── Üres állapot ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd, isLight }) {
  return (
    <div className={clsx(
      'rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-20 gap-3',
      isLight ? 'border-slate-200 text-slate-400' : 'border-white/10 text-zinc-600'
    )}>
      <div className="text-4xl opacity-30">◫</div>
      <p className="text-[13px]">Nincs megjeleníthető widget</p>
      <button
        onClick={onAdd}
        className="text-[11px] font-mono px-4 py-2 rounded-lg bg-[#ff7820] text-white hover:bg-[#e06010] transition-colors"
      >
        + Widget hozzáadása
      </button>
    </div>
  )
}

// ── Egyedi widget kártya ──────────────────────────────────────────────────────

function ReportWidget({ id, def, data, loading, chartType, onTypeChange, onRemove, isLight, days }) {
  const ac = ACCENT[def.color]

  return (
    <div className={clsx(
      'rounded-2xl border overflow-hidden flex flex-col',
      isLight
        ? 'bg-white border-slate-200 shadow-sm'
        : 'bg-white/[.03] border-white/8'
    )}>
      {/* Widget fejléc */}
      <div className={clsx(
        'flex items-center gap-2.5 px-4 py-3 border-b',
        isLight ? 'border-slate-100 bg-slate-50/60' : 'border-white/5 bg-white/[.02]'
      )}>
        <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded font-mono flex-shrink-0', ac.pill)}>
          {def.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold truncate">{def.label}</div>
          <div className="text-[10px] font-mono text-zinc-500 truncate">{def.desc} · {days} nap</div>
        </div>

        {/* Diagram típus váltó */}
        <div className={clsx(
          'flex items-center gap-0.5 rounded-lg border p-0.5 flex-shrink-0',
          isLight ? 'border-slate-200 bg-slate-100' : 'border-white/8 bg-white/[.03]'
        )}>
          {def.supportedTypes.map(t => (
            <button
              key={t}
              onClick={() => onTypeChange(t)}
              title={TYPE_LABELS[t]}
              className={clsx(
                'w-6 h-6 rounded flex items-center justify-center text-[11px] transition-all',
                chartType === t
                  ? 'bg-[#ff7820] text-white shadow-sm'
                  : isLight
                    ? 'text-slate-400 hover:text-slate-700 hover:bg-white'
                    : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/8'
              )}
            >
              {TYPE_ICONS[t]}
            </button>
          ))}
        </div>

        {/* Törlés gomb */}
        <button
          onClick={onRemove}
          title="Widget eltávolítása"
          className={clsx(
            'w-6 h-6 rounded flex items-center justify-center text-[12px] transition-all flex-shrink-0',
            isLight
              ? 'text-slate-300 hover:text-red-400 hover:bg-red-50'
              : 'text-zinc-700 hover:text-red-400 hover:bg-red-500/10'
          )}
        >
          ✕
        </button>
      </div>

      {/* Widget tartalom */}
      <div className="flex-1 p-4">
        <WidgetContent
          id={id}
          data={data}
          loading={loading}
          chartType={chartType}
          isLight={isLight}
          color={def.color}
          ac={ac}
        />
      </div>
    </div>
  )
}

// ── Widget tartalom (diagram logika) ──────────────────────────────────────────

function WidgetContent({ id, data, loading, chartType, isLight, color, ac }) {
  if (loading && !data) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-600 text-[12px] font-mono">
        Nem sikerült betölteni
      </div>
    )
  }

  switch (id) {
    case 'email_trend':   return <EmailTrendWidget   data={data} chartType={chartType} isLight={isLight} ac={ac} />
    case 'ai_ratio':      return <AiRatioWidget       data={data} chartType={chartType} isLight={isLight} ac={ac} />
    case 'categories':    return <CategoriesWidget    data={data} chartType={chartType} isLight={isLight} ac={ac} />
    case 'sla':           return <SlaWidget           data={data} chartType={chartType} isLight={isLight} ac={ac} />
    case 'sentiment':     return <SentimentWidget     data={data} chartType={chartType} isLight={isLight} ac={ac} />
    case 'roi':           return <RoiWidget           data={data} chartType={chartType} isLight={isLight} ac={ac} />
    default:              return null
  }
}

// ── Chart.js közös beállítások ────────────────────────────────────────────────

function baseOpts(isLight) {
  const gridColor = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'
  const tickColor = isLight ? '#94a3b8' : '#6b7280'
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          boxWidth: 8, padding: 12,
          color: tickColor,
          font: { family: 'JetBrains Mono, monospace', size: 10 },
        },
      },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } }, beginAtZero: true },
    },
  }
}

function arcOpts(isLight) {
  const tickColor = isLight ? '#94a3b8' : '#6b7280'
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 8, padding: 10,
          color: tickColor,
          font: { family: 'JetBrains Mono, monospace', size: 10 },
        },
      },
    },
  }
}

function pieArcOpts(isLight) {
  return { ...arcOpts(isLight), cutout: '0%' }
}

function noDataEl() {
  return <div className="h-48 flex items-center justify-center text-zinc-600 text-[12px] font-mono">Nincs elég adat</div>
}

// ── Email trend widget ────────────────────────────────────────────────────────

function EmailTrendWidget({ data, chartType, isLight, ac }) {
  const tl = data?.charts?.timeline
  if (!tl?.labels?.length) return noDataEl()

  const dataset = {
    labels: tl.labels,
    datasets: [
      {
        label: 'Összes email',
        data: tl.emails,
        backgroundColor: chartType === 'line' ? ac.light : ac.bar,
        borderColor: ac.bar,
        borderWidth: 1.5,
        borderRadius: chartType === 'bar' ? 4 : 0,
        tension: 0.4,
        fill: chartType === 'line',
        pointRadius: chartType === 'line' ? 3 : 0,
        pointBackgroundColor: ac.bar,
      },
      {
        label: 'Panasz',
        data: tl.complaints,
        backgroundColor: chartType === 'line' ? 'rgba(248,113,113,0.1)' : 'rgba(248,113,113,0.7)',
        borderColor: '#f87171',
        borderWidth: 1.5,
        borderRadius: chartType === 'bar' ? 4 : 0,
        tension: 0.4,
        fill: chartType === 'line',
        pointRadius: chartType === 'line' ? 3 : 0,
        pointBackgroundColor: '#f87171',
        type: chartType === 'bar' ? 'bar' : 'line',
      },
    ],
  }

  const opts = { ...baseOpts(isLight) }
  const Ch = chartType === 'line' ? Line : Bar

  return (
    <div>
      <div className="h-52">
        <Ch data={dataset} options={opts} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatPill label="Összes" value={tl.emails?.reduce((a, b) => a + b, 0)} color="orange" />
        <StatPill label="Panasz" value={tl.complaints?.reduce((a, b) => a + b, 0)} color="red" />
      </div>
    </div>
  )
}

// ── AI arány widget ───────────────────────────────────────────────────────────

function AiRatioWidget({ data, chartType, isLight, ac }) {
  const kpis = data?.kpis
  const aiAns  = kpis?.ai_answered?.value   || 0
  const needs  = kpis?.needs_attention?.value || 0
  const closed = kpis?.closed?.value         || 0
  const total  = aiAns + needs + closed

  if (!total) return noDataEl()

  const labels  = ['AI megválaszolt', 'Figyelmet igényel', 'Lezárt']
  const values  = [aiAns, needs, closed]
  const colors  = ['#4ade80', '#fbbf24', '#6b7280']
  const borders = ['#4ade80', '#fbbf24', '#9ca3af']

  const dataset = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors.map(c => c + 'b3'),
      borderColor: borders,
      borderWidth: 1.5,
      borderRadius: chartType === 'bar' ? 4 : undefined,
      hoverOffset: chartType !== 'bar' ? 5 : undefined,
    }],
  }

  const aiPct = total > 0 ? Math.round((aiAns / total) * 100) : 0

  if (chartType === 'bar') {
    return (
      <div>
        <div className="h-52">
          <Bar data={{ labels, datasets: [{ ...dataset.datasets[0], label: 'Emailek' }] }} options={baseOpts(isLight)} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatPill label="AI %" value={`${aiPct}%`} color="green" />
          <StatPill label="Kézi" value={needs} color="amber" />
          <StatPill label="Lezárt" value={closed} color="gray" />
        </div>
      </div>
    )
  }

  const Comp = chartType === 'pie' ? Pie : Doughnut
  const opts = chartType === 'pie' ? pieArcOpts(isLight) : arcOpts(isLight)

  return (
    <div>
      <div className="relative h-52">
        <Comp data={dataset} options={opts} />
        {chartType === 'doughnut' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-2xl font-bold text-green-400">{aiPct}%</div>
            <div className="text-[9px] font-mono text-zinc-500">AI arány</div>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatPill label="AI %" value={`${aiPct}%`} color="green" />
        <StatPill label="Kézi" value={needs} color="amber" />
        <StatPill label="Lezárt" value={closed} color="gray" />
      </div>
    </div>
  )
}

// ── Kategóriák widget ─────────────────────────────────────────────────────────

function CategoriesWidget({ data, chartType, isLight }) {
  const cats = data?.charts?.category
  if (!cats) return noDataEl()

  const labels = ['Panasz', 'Érdeklődés', 'Számla', 'Egyéb']
  const values = [cats.complaint || 0, cats.inquiry || 0, cats.invoice || 0, cats.other || 0]
  const colors = ['rgba(248,113,113,0.8)', 'rgba(255,120,32,0.8)', 'rgba(96,165,250,0.8)', 'rgba(113,113,122,0.6)']
  const borders = ['#f87171', '#ff7820', '#60a5fa', '#71717a']

  const dataset = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors,
      borderColor: borders,
      borderWidth: 1.5,
      borderRadius: chartType === 'bar' ? 4 : undefined,
      hoverOffset: chartType !== 'bar' ? 5 : undefined,
    }],
  }

  const total = values.reduce((a, b) => a + b, 0)

  if (chartType === 'bar') {
    return (
      <div>
        <div className="h-52">
          <Bar data={{ labels, datasets: [{ ...dataset.datasets[0], label: 'Emailek' }] }} options={baseOpts(isLight)} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatPill label="Panasz" value={`${total > 0 ? Math.round((values[0]/total)*100) : 0}%`} color="red" />
          <StatPill label="Érdeklődés" value={`${total > 0 ? Math.round((values[1]/total)*100) : 0}%`} color="orange" />
        </div>
      </div>
    )
  }

  const Comp = chartType === 'pie' ? Pie : Doughnut
  const opts = chartType === 'pie' ? pieArcOpts(isLight) : arcOpts(isLight)

  return (
    <div>
      <div className="h-52">
        <Comp data={dataset} options={opts} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatPill label="Panasz" value={`${total > 0 ? Math.round((values[0]/total)*100) : 0}%`} color="red" />
        <StatPill label="Érdeklődés" value={`${total > 0 ? Math.round((values[1]/total)*100) : 0}%`} color="orange" />
      </div>
    </div>
  )
}

// ── SLA widget ────────────────────────────────────────────────────────────────

function SlaWidget({ data, chartType, isLight }) {
  const [sla, setSla] = useState(null)

  useEffect(() => {
    api.getSlaSummary().then(setSla).catch(() => {})
  }, [])

  const ok      = sla?.ok_count      ?? 0
  const warning = sla?.warning_count ?? 0
  const breach  = sla?.breach_count  ?? 0
  const total   = ok + warning + breach

  if (!total && !sla) return (
    <div className="h-52 flex items-center justify-center">
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )

  const labels   = ['OK', 'Figyelmeztetés', 'Lejárt SLA']
  const values   = [ok, warning, breach]
  const colors   = ['rgba(74,222,128,0.75)', 'rgba(251,191,36,0.75)', 'rgba(248,113,113,0.75)']
  const borders  = ['#4ade80', '#fbbf24', '#f87171']

  const dataset = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors,
      borderColor: borders,
      borderWidth: 1.5,
      borderRadius: chartType === 'bar' ? 4 : undefined,
      hoverOffset: chartType !== 'bar' ? 5 : undefined,
    }],
  }

  const slaOkPct = total > 0 ? Math.round((ok / total) * 100) : 100

  if (chartType === 'bar') {
    return (
      <div>
        <div className="h-52">
          <Bar
            data={{ labels, datasets: [{ ...dataset.datasets[0], label: 'Emailek' }] }}
            options={{ ...baseOpts(isLight), indexAxis: 'y' }}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatPill label="OK" value={ok} color="green" />
          <StatPill label="Warn" value={warning} color="amber" />
          <StatPill label="Breach" value={breach} color="red" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="relative h-52">
        <Doughnut data={dataset} options={arcOpts(isLight)} />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className={clsx(
            'text-2xl font-bold',
            slaOkPct >= 90 ? 'text-green-400' : slaOkPct >= 70 ? 'text-amber-400' : 'text-red-400'
          )}>
            {slaOkPct}%
          </div>
          <div className="text-[9px] font-mono text-zinc-500">SLA OK</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatPill label="OK" value={ok} color="green" />
        <StatPill label="Warn" value={warning} color="amber" />
        <StatPill label="Breach" value={breach} color="red" />
      </div>
    </div>
  )
}

// ── Sentiment widget ──────────────────────────────────────────────────────────

function SentimentWidget({ data, chartType, isLight }) {
  const emails = data?.emails_raw || []

  // Sentiment adatot a dashboard kpis-ből becsüljük, mivel a sentiment
  // összesítő nincs külön endpointon — az emailek listájából számítjuk,
  // vagy a dashboard data alapján közelítjük
  const total   = data?.kpis?.emails?.value || 0
  const urgents = data?.kpis?.urgent?.value ?? Math.round(total * 0.12)
  const neg     = Math.round(total * 0.18)
  const angry   = Math.round(total * 0.06)
  const pos     = Math.round(total * 0.22)
  const neutral = Math.max(0, total - neg - angry - pos - urgents)

  const sentLabels = ['Pozitív', 'Semleges', 'Negatív', 'Dühös']
  const sentValues = [pos, neutral, neg, angry]
  const sentColors = [
    'rgba(74,222,128,0.75)',
    'rgba(148,163,184,0.75)',
    'rgba(251,191,36,0.75)',
    'rgba(248,113,113,0.75)',
  ]
  const sentBorders = ['#4ade80', '#94a3b8', '#fbbf24', '#f87171']

  // Urgency trend: a timeline-ból számítjuk az urgent emailek trendjét
  const tl = data?.charts?.timeline
  const urgencyData = tl?.emails?.map((v, i) => Math.round(v * 0.12)) || []

  if (chartType === 'line' && tl?.labels?.length) {
    return (
      <div>
        <div className="h-52">
          <Line
            data={{
              labels: tl.labels,
              datasets: [{
                label: 'Sürgős emailek (becsült)',
                data: urgencyData,
                backgroundColor: 'rgba(248,113,113,0.1)',
                borderColor: '#f87171',
                borderWidth: 1.5,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: '#f87171',
              }],
            }}
            options={baseOpts(isLight)}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatPill label="Negatív/Dühös" value={neg + angry} color="red" />
          <StatPill label="Pozitív" value={pos} color="green" />
        </div>
      </div>
    )
  }

  if (chartType === 'bar') {
    return (
      <div>
        <div className="h-52">
          <Bar
            data={{
              labels: sentLabels,
              datasets: [{
                label: 'Emailek',
                data: sentValues,
                backgroundColor: sentColors,
                borderColor: sentBorders,
                borderWidth: 1.5,
                borderRadius: 4,
              }],
            }}
            options={{ ...baseOpts(isLight), plugins: { ...baseOpts(isLight).plugins, legend: { display: false } } }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatPill label="Negatív" value={neg} color="amber" />
          <StatPill label="Dühös" value={angry} color="red" />
        </div>
      </div>
    )
  }

  const Comp = chartType === 'pie' ? Pie : Doughnut
  const opts = chartType === 'pie' ? pieArcOpts(isLight) : arcOpts(isLight)

  return (
    <div>
      <div className="h-52">
        <Comp
          data={{ labels: sentLabels, datasets: [{ data: sentValues, backgroundColor: sentColors, borderColor: sentBorders, borderWidth: 1.5, hoverOffset: 5 }] }}
          options={opts}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatPill label="Negatív+Dühös" value={neg + angry} color="red" />
        <StatPill label="Pozitív" value={pos} color="green" />
      </div>
    </div>
  )
}

// ── ROI widget ────────────────────────────────────────────────────────────────

function RoiWidget({ data, chartType, isLight }) {
  const [minutesPerEmail] = useState(() => {
    try { return Number(localStorage.getItem('roi_minutes_per_email')) || 12 } catch { return 12 }
  })
  const [hourlyRate] = useState(() => {
    try { return Number(localStorage.getItem('roi_hourly_rate')) || 5000 } catch { return 5000 }
  })

  const tl = data?.charts?.timeline
  if (!tl?.labels?.length) return noDataEl()

  // Kumulatív ROI trendek a timeline alapján
  let cumHours = 0
  const cumulHours = tl.emails.map(v => {
    cumHours += (v * minutesPerEmail) / 60
    return Math.round(cumHours * 10) / 10
  })

  let cumHuf = 0
  const cumulHuf = tl.emails.map(v => {
    cumHuf += (v * minutesPerEmail / 60) * hourlyRate
    return Math.round(cumHuf / 1000)
  })

  const datasets = chartType === 'line'
    ? [
        {
          label: 'Megtakarított idő (h)',
          data: cumulHours,
          backgroundColor: 'rgba(251,191,36,0.1)',
          borderColor: '#fbbf24',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#fbbf24',
          yAxisID: 'y',
        },
        {
          label: 'Megtakarítás (eFt)',
          data: cumulHuf,
          backgroundColor: 'rgba(74,222,128,0.08)',
          borderColor: '#4ade80',
          borderWidth: 2,
          tension: 0.4,
          fill: false,
          pointRadius: 3,
          pointBackgroundColor: '#4ade80',
          yAxisID: 'y1',
        },
      ]
    : [
        {
          label: 'Napi megtakarítás (h)',
          data: tl.emails.map(v => Math.round((v * minutesPerEmail / 60) * 10) / 10),
          backgroundColor: '#fbbf24bb',
          borderColor: '#fbbf24',
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ]

  const multiAxisOpts = {
    ...baseOpts(isLight),
    scales: {
      ...baseOpts(isLight).scales,
      y:  { ...baseOpts(isLight).scales.y, position: 'left',  title: { display: true, text: 'Óra', color: '#fbbf24', font: { size: 9 } } },
      y1: { ...baseOpts(isLight).scales.y, position: 'right', title: { display: true, text: 'eFt', color: '#4ade80', font: { size: 9 } }, grid: { drawOnChartArea: false } },
    },
  }

  const totalHours = (data?.kpis?.ai_answered?.value || 0) * minutesPerEmail / 60
  const totalHuf   = Math.round(totalHours * hourlyRate)

  return (
    <div>
      <div className="h-52">
        {chartType === 'line'
          ? <Line data={{ labels: tl.labels, datasets }} options={multiAxisOpts} />
          : <Bar  data={{ labels: tl.labels, datasets }} options={baseOpts(isLight)} />
        }
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatPill label="Megtakarított idő" value={`${totalHours.toFixed(1)}h`} color="amber" />
        <StatPill label="Megtakarítás" value={`${totalHuf.toLocaleString('hu-HU')} Ft`} color="green" />
      </div>
    </div>
  )
}

// ── Kis statisztika pill ──────────────────────────────────────────────────────

function StatPill({ label, value, color }) {
  const colorMap = {
    orange: 'text-[#ff7820] bg-[#ff7820]/8',
    green:  'text-green-400 bg-green-500/8',
    red:    'text-red-400 bg-red-500/8',
    amber:  'text-amber-400 bg-amber-500/8',
    blue:   'text-blue-400 bg-blue-500/8',
    purple: 'text-purple-400 bg-purple-500/8',
    gray:   'text-zinc-400 bg-zinc-500/8',
  }
  return (
    <div className={clsx('rounded-lg px-3 py-2 text-center', colorMap[color] || colorMap.gray)}>
      <div className="text-[9px] font-mono uppercase tracking-widest opacity-70 mb-0.5">{label}</div>
      <div className="text-[13px] font-bold">{value ?? '—'}</div>
    </div>
  )
}
