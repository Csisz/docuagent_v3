import { useStore } from '../store'
import { Chip, Skeleton } from '../components/ui'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, BarController,
         LineElement, LineController, PointElement, ArcElement, DoughnutController,
        Tooltip, Legend, Filler } from 'chart.js'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../services/api'
import { STATUS_LABELS } from '../constants/labels'

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement,
  LineController, PointElement, ArcElement, DoughnutController, Tooltip, Legend, Filler)

let aiCache = null
let aiCacheEmailCount = -1

const DEFAULT_LAYOUT = ['kpi_cards','status_cards','roi_card','sla_card','charts','ai_panel','bottom_row']
const BLOCK_LABELS   = {
  kpi_cards:   'KPI kártyák',
  status_cards:'Státusz kártyák',
  roi_card:    'ROI Kalkulátor',
  charts:      'Email aktivitás & Kategóriák',
  ai_panel:    'AI Elemzés',
  bottom_row:  'Aktivitás / Dokumentumok / Rendszer',
  sla_card:    'SLA Monitor',
}

function SortableBlock({ id, anyDragging, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
         className="relative group/block">
      <div {...attributes} {...listeners}
           className={clsx(
             'absolute -left-7 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-[3px] px-1.5 py-2 rounded-lg',
             'cursor-grab active:cursor-grabbing opacity-0 group-hover/block:opacity-100 transition-opacity',
             'bg-white/5 border border-white/10 hover:bg-white/10',
             anyDragging && 'pointer-events-none',
           )}
           title="Húzd a sorrend megváltoztatásához">
        {[0,1,2,3,4,5].map(i => (
          <div key={i} className={clsx('w-[3px] h-[3px] rounded-full bg-zinc-500', i%2===0?'mr-[5px]':'ml-[5px]')} />
        ))}
      </div>
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const { dashData } = useStore()
  const d = dashData
  const [layout, setLayout]     = useState(DEFAULT_LAYOUT)
  const [activeId, setActiveId] = useState(null)
  const saveTimeout = useRef(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dashboard_layout')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length) setLayout(parsed)
      }
    } catch {}
  }, [])

  const saveLayout = useCallback((nl) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      try { localStorage.setItem('dashboard_layout', JSON.stringify(nl)) } catch {}
    }, 600)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    setLayout(prev => {
      const next = arrayMove(prev, prev.indexOf(active.id), prev.indexOf(over.id))
      saveLayout(next)
      return next
    })
  }

  const blocks = {
    kpi_cards: (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Kezelt emailek"    value={d?.kpis?.emails?.value}          sub={`${d?.kpis?.feedback_total?.value||0} feedback tárolt`} accent="orange" />
        <KpiCard label="AI megválaszolta"  value={d?.kpis?.ai_answered?.value}     sub="automatikus" accent="green" />
        <KpiCard label="Figyelmet igényel" value={d?.kpis?.needs_attention?.value} sub={d?.kpis?.feedback_total?.value>0?`tanul ${d.kpis.feedback_total.value} mintából`:'nincs tanulás'} accent="red" />
        <KpiCard label="Átlag konfidencia" value={d?.kpis?.avg_confidence?.value}  sub="AI döntések" accent="purple" suffix="%" />
      </div>
    ),
    status_cards: (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatusCard label={STATUS_LABELS.NEW}             subLabel="Feldolgozásra vár"  count={d?.status_breakdown?.NEW}             badge="new"       filter="NEW" />
        <StatusCard label={STATUS_LABELS.AI_ANSWERED}     subLabel="AI válaszolt"       count={d?.status_breakdown?.AI_ANSWERED}     badge="ai"        filter="AI_ANSWERED" />
        <StatusCard label={STATUS_LABELS.NEEDS_ATTENTION} subLabel="Emberi beavatkozás" count={d?.status_breakdown?.NEEDS_ATTENTION} badge="attention" filter="NEEDS_ATTENTION" highlighted={d?.status_breakdown?.NEEDS_ATTENTION > 0} />
        <StatusCard label={STATUS_LABELS.CLOSED}          subLabel="Lezárva"            count={d?.status_breakdown?.CLOSED}          badge="closed"    filter="CLOSED" />
      </div>
    ),
    roi_card:  <ROICard aiAnswered={d?.kpis?.ai_answered?.value} />,
    charts: (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 glass-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold">Email aktivitás — 7 nap</h3>
            <Chip color="orange">Live</Chip>
          </div>
          <div className="h-44"><TimelineChart data={d?.charts?.timeline} /></div>
        </div>
        <div className="glass-card">
          <h3 className="text-[13px] font-semibold mb-3">Kategóriák</h3>
          <div className="h-44"><CategoryChart data={d?.charts?.category} /></div>
        </div>
      </div>
    ),
    ai_panel:  <AIPanel emailCount={d?.kpis?.emails?.value} />,
    sla_card:  <SLACard />,
    bottom_row: (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <ActivityFeed items={d?.activity} />
        <DocMini docs={d?.documents} />
        <SystemStatus />
      </div>
    ),
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <p className="text-[11.5px] text-zinc-500 font-mono -mb-1">Valós idejű AI aktivitás</p>

      {d?.alerts?.map((a,i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-400/20 bg-red-400/[.08] text-[13px]">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-red-400 flex-shrink-0">
            <path d="M8 2L14.5 13H1.5L8 2z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 6v4M8 11.5v.5" strokeLinecap="round"/>
          </svg>
          <span className="text-zinc-300">{a.message}</span>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-zinc-600 select-none">
          <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 opacity-50"><circle cx="4" cy="3" r="1"/><circle cx="8" cy="3" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="4" cy="9" r="1"/><circle cx="8" cy="9" r="1"/></svg>
          <span>Fogd meg a kártyák bal szélét és húzd át a sorrend módosításához</span>
        </div>
        <button
          onClick={() => {
            setLayout(DEFAULT_LAYOUT)
            saveLayout(DEFAULT_LAYOUT)
          }}
          className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 border border-white/8 rounded px-2 py-1 transition-colors"
        >
          Visszaállítás
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter}
                  onDragStart={({active}) => setActiveId(active.id)}
                  onDragEnd={handleDragEnd}>
        <SortableContext items={layout} strategy={verticalListSortingStrategy}>
          <div className="space-y-4 pl-8">
            {layout.map(id => (
              <SortableBlock key={id} id={id} anyDragging={!!activeId}>
                {blocks[id]}
              </SortableBlock>
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeId && (
            <div className="opacity-80 ring-1 ring-[#ff7820]/40 rounded-xl">
              <div className="px-4 py-3 glass-card text-[12px] font-mono text-zinc-400 flex items-center gap-2">
                <span>⠿</span><span>{BLOCK_LABELS[activeId]}</span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function SLACard() {
  const [summary,    setSummary]    = useState(null)
  const [config,     setConfig]     = useState({ warning_hours: 4, breach_hours: 24 })
  const [saved,      setSaved]      = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [isNewBreach, setIsNewBreach] = useState(false)
  const debounceRef = useRef(null)
  const prevBreachRef = useRef(null)

  useEffect(() => {
    api.getSlaConfig().then(setConfig).catch(() => {})
    api.getSlaSummary().then(data => {
      prevBreachRef.current = data.breach_count
      setSummary(data)
    }).catch(() => {})
    const iv = setInterval(() => api.getSlaSummary().then(data => {
      if (prevBreachRef.current !== null && data.breach_count > prevBreachRef.current) {
        setIsNewBreach(true)
        setTimeout(() => setIsNewBreach(false), 10000)
      }
      prevBreachRef.current = data.breach_count
      setSummary(data)
    }).catch(() => {}), 30000)
    return () => clearInterval(iv)
  }, [])

  function updateConfig(patch) {
    const next = { ...config, ...patch }
    setConfig(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await api.setSlaConfig(next)
        const s = await api.getSlaSummary()
        setSummary(s)
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      } catch {}
    }, 800)
  }

  const sl = `w-full h-2 rounded-full appearance-none cursor-pointer
    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
    [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
    [&::-webkit-slider-thumb]:bg-[#ff7820] [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,120,32,.7)]
    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20
    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
    [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#ff7820] [&::-moz-range-thumb]:border-none`

  const breach = summary?.breach_count ?? null

  return (
    <div className="glass-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[13px] font-semibold">SLA Monitor</h3>
          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
            Válaszidő tracking — warning: {config.warning_hours}h · breach: {config.breach_hours}h
          </p>
        </div>
        <div className="flex items-center gap-2">
          {breach > 0 && (
            <span className={clsx(
              'text-[9.5px] font-bold font-mono px-2 py-1 rounded bg-red-500/15 text-red-400 border border-red-400/25',
              isNewBreach && 'animate-pulse'
            )}>
              {breach} lejárt SLA
            </span>
          )}
          {saved && (
            <span className="text-[9.5px] font-mono text-green-400 transition-opacity">✓ Mentve</span>
          )}
          <span className="text-[9.5px] font-bold font-mono px-2 py-1 rounded bg-blue-500/15 text-blue-400 border border-blue-400/20">⏱ ÉLŐBEN</span>
          <button
            onClick={() => setShowConfig(v => !v)}
            title="SLA határok beállítása"
            className={clsx(
              'w-7 h-7 rounded-lg flex items-center justify-center transition-all border text-[13px]',
              showConfig
                ? 'bg-orange-500/20 border-orange-400/40 text-orange-400'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-orange-400 hover:border-orange-400/30'
            )}
          >⚙</button>
        </div>
      </div>

      {/* Summary counters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 bg-green-500/[.07] border border-green-400/20 rounded-xl px-4 py-3 text-center">
          <div className="text-[9px] text-green-600 dark:text-green-500 font-mono uppercase tracking-widest mb-1 font-semibold">OK</div>
          <div className="text-2xl font-bold text-green-500 dark:text-green-400">{summary?.ok_count ?? '—'}</div>
        </div>
        <div className="flex-1 bg-amber-500/[.07] border border-amber-400/20 rounded-xl px-4 py-3 text-center">
          <div className="text-[9px] text-amber-600 dark:text-amber-500 font-mono uppercase tracking-widest mb-1 font-semibold">Figyelmeztetés</div>
          <div className="text-2xl font-bold text-amber-500 dark:text-amber-400">{summary?.warning_count ?? '—'}</div>
        </div>
        <div className="flex-1 bg-red-500/[.07] border border-red-400/20 rounded-xl px-4 py-3 text-center">
          <div className="text-[9px] text-red-600 dark:text-red-500 font-mono uppercase tracking-widest mb-1 font-semibold">Lejárt</div>
          <div className="text-2xl font-bold text-red-500 dark:text-red-400">{summary?.breach_count ?? '—'}</div>
        </div>
      </div>

      {/* Collapsible config panel */}
      {showConfig && (
        <div className="border-t border-slate-200 dark:border-white/8 pt-4 mt-1">
          <p className="text-[10px] font-mono text-zinc-500 mb-3 uppercase tracking-widest">SLA határok — automatikusan ment</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[11px] text-slate-600 dark:text-zinc-400">Figyelmeztetés határidő</span>
                <span className="text-[11px] font-mono font-bold text-amber-500 dark:text-amber-400">{config.warning_hours} óra</span>
              </div>
              <input type="range" min={1} max={23} step={1} value={config.warning_hours}
                onChange={e => {
                  const v = +e.target.value
                  if (v < config.breach_hours) updateConfig({ warning_hours: v })
                }}
                className={sl} style={{background:'#e2e8f0'}} />
              <div className="flex justify-between text-[9px] text-slate-400 dark:text-zinc-600 font-mono mt-1.5"><span>1h</span><span>23h</span></div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[11px] text-slate-600 dark:text-zinc-400">SLA megsértés határidő</span>
                <span className="text-[11px] font-mono font-bold text-red-500 dark:text-red-400">{config.breach_hours} óra</span>
              </div>
              <input type="range" min={2} max={72} step={1} value={config.breach_hours}
                onChange={e => {
                  const v = +e.target.value
                  if (v > config.warning_hours) updateConfig({ breach_hours: v })
                }}
                className={sl} style={{background:'#e2e8f0'}} />
              <div className="flex justify-between text-[9px] text-slate-400 dark:text-zinc-600 font-mono mt-1.5"><span>2h</span><span>72h</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


function ROICard({ aiAnswered }) {
  const [hourlyRate,      setHourlyRate]      = useState(() => {
    try { return Number(localStorage.getItem('roi_hourly_rate'))      || 5000 } catch { return 5000 }
  })
  const [minutesPerEmail, setMinutesPerEmail] = useState(() => {
    try { return Number(localStorage.getItem('roi_minutes_per_email')) || 12   } catch { return 12   }
  })
  const [showConfig, setShowConfig] = useState(false)

  function updateHourlyRate(v) {
    setHourlyRate(v)
    try { localStorage.setItem('roi_hourly_rate', v) } catch {}
  }
  function updateMinutes(v) {
    setMinutesPerEmail(v)
    try { localStorage.setItem('roi_minutes_per_email', v) } catch {}
  }

  const count    = aiAnswered ?? 0
  const hours    = (count * minutesPerEmail) / 60
  const savedHuf = Math.round(hours * hourlyRate)
  const savedFmt = savedHuf.toLocaleString('hu-HU')

  const sl = `w-full h-2 rounded-full appearance-none cursor-pointer
    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
    [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
    [&::-webkit-slider-thumb]:bg-[#ff7820] [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,120,32,.7)]
    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20
    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
    [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#ff7820] [&::-moz-range-thumb]:border-none`

  return (
    <div className="glass-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[13px] font-semibold">ROI Kalkulátor</h3>
          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
            Az AI által megtakarított idő és költség
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-bold font-mono px-2 py-1 rounded bg-green-500/15 text-green-600 dark:text-green-400 border border-green-400/25">⚡ ÉLŐBEN</span>
          <button
            onClick={() => setShowConfig(v => !v)}
            title="Kalkulátor beállítása"
            className={clsx(
              'w-7 h-7 rounded-lg flex items-center justify-center transition-all border text-[13px]',
              showConfig
                ? 'bg-orange-500/20 border-orange-400/40 text-orange-400'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-orange-400 hover:border-orange-400/30'
            )}
          >⚙</button>
        </div>
      </div>

      {/* Summary boxes */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 rounded-xl px-5 py-4 text-center border"
             style={{background:'color-mix(in srgb, #22c55e 8%, transparent)', borderColor:'color-mix(in srgb, #22c55e 25%, transparent)'}}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-1 font-semibold text-green-600 dark:text-green-500">Megtakarított idő</div>
          <div className="text-3xl font-bold tracking-tight text-green-600 dark:text-green-400">{hours.toFixed(1)} h</div>
          <div className="text-[10px] font-mono mt-1 text-green-800/50 dark:text-zinc-500">{count} email × {minutesPerEmail} perc</div>
        </div>
        <div className="flex-1 rounded-xl px-5 py-4 text-center border"
             style={{background:'color-mix(in srgb, #ff7820 8%, transparent)', borderColor:'color-mix(in srgb, #ff7820 25%, transparent)'}}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-1 font-semibold text-orange-700 dark:text-orange-400">Pénzben kifejezve</div>
          <div className="text-3xl font-bold tracking-tight text-orange-700 dark:text-[#ff7820]">{savedFmt} Ft</div>
          <div className="text-[10px] font-mono mt-1 text-orange-800/50 dark:text-zinc-500">{hourlyRate.toLocaleString('hu-HU')} Ft/óra</div>
        </div>
      </div>

      {/* Footer összefoglaló mondat */}
      {count > 0 && (
        <div className={clsx(
          'text-center text-[11.5px] border-t pt-3 mb-1',
          showConfig ? 'mb-4' : '',
          'text-slate-500 dark:text-zinc-500 border-slate-200 dark:border-white/5'
        )}>
          Az AI eddig{' '}
          <span className="text-green-600 dark:text-green-400 font-semibold">{savedFmt} Ft</span>{' '}
          értékű munkát vett le a csapatodról.
        </div>
      )}

      {/* Collapsible config panel */}
      {showConfig && (
        <div className="border-t border-slate-200 dark:border-white/8 pt-4">
          <p className="text-[10px] font-mono text-zinc-500 mb-3 uppercase tracking-widest">Kalkulátor paraméterei</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[11px] text-slate-600 dark:text-zinc-400">Válaszidő emailenként</span>
                <span className="text-[11px] font-mono font-bold text-[#e06010] dark:text-[#ff7820]">{minutesPerEmail} perc</span>
              </div>
              <input type="range" min={3} max={60} step={1} value={minutesPerEmail}
                onChange={e => updateMinutes(+e.target.value)} className={sl} style={{background:'#e2e8f0'}} />
              <div className="flex justify-between text-[9px] text-slate-400 dark:text-zinc-600 font-mono mt-1.5"><span>3 perc</span><span>60 perc</span></div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[11px] text-slate-600 dark:text-zinc-400">Munkaerő-költség</span>
                <span className="text-[11px] font-mono font-bold text-[#e06010] dark:text-[#ff7820]">{hourlyRate.toLocaleString('hu-HU')} Ft/h</span>
              </div>
              <input type="range" min={2000} max={15000} step={500} value={hourlyRate}
                onChange={e => updateHourlyRate(+e.target.value)} className={sl} style={{background:'#e2e8f0'}} />
              <div className="flex justify-between text-[9px] text-slate-400 dark:text-zinc-600 font-mono mt-1.5"><span>2 000 Ft</span><span>15 000 Ft</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, sub, accent, suffix='' }) {
  const ac = { orange:{bar:'bg-gradient-to-b from-[#ff7820] to-[#ff4500]',val:'text-[#ff7820]'}, green:{bar:'bg-green-400',val:'text-green-400'}, red:{bar:'bg-red-400',val:'text-red-400'}, purple:{bar:'bg-purple-400',val:'text-purple-400'} }[accent]||{bar:'bg-blue-400',val:'text-blue-400'}
  return (
    <div className="glass-card relative pl-5 overflow-hidden animate-fade-up">
      <div className={clsx('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl',ac.bar)} />
      <div className={clsx('absolute bottom-[-30px] right-[-30px] w-20 h-20 rounded-full blur-2xl opacity-10',ac.bar)} />
      <div className="text-[9.5px] text-zinc-500 uppercase tracking-[.10em] font-mono mb-2">{label}</div>
      <div className={clsx('text-3xl font-bold tracking-tight leading-none mb-1.5',ac.val)}>{value!=null?`${value}${suffix}`:<Skeleton className="h-8 w-16"/>}</div>
      <div className="text-[10px] font-mono text-zinc-500">{sub}</div>
    </div>
  )
}

function StatusCard({ label, subLabel, count, badge, filter, highlighted }) {
  const navigate = useNavigate()
  const bs = { new:'bg-blue-500/15 text-blue-400 border border-blue-400/20', ai:'bg-green-500/15 text-green-400 border border-green-400/20', attention:'bg-amber-500/15 text-amber-400 border border-amber-400/20', closed:'bg-zinc-500/15 text-zinc-400 border border-zinc-400/20' }
  return (
    <button
      onClick={()=>navigate('/emails',{state:{filter}})}
      className={clsx(
        'glass rounded-xl px-4 py-3 flex items-center gap-2.5 transition-all text-left w-full cursor-pointer',
        highlighted
          ? 'hover:border-amber-400/40 hover:scale-[1.02] ring-1 ring-amber-400/20'
          : 'hover:border-white/20 hover:scale-[1.02]'
      )}
    >
      <span className={clsx('text-[9.5px] font-bold font-mono px-2 py-1 rounded flex-shrink-0 whitespace-nowrap',bs[badge])}>{label}</span>
      <span className="text-[10.5px] text-zinc-500 truncate flex-1 hidden sm:block">{subLabel}</span>
      {highlighted && count > 0 && (
        <span className="text-[9px] font-mono text-amber-400 animate-pulse hidden lg:block">Teendő van</span>
      )}
      <span className="text-xl font-bold ml-auto">{count??'—'}</span>
    </button>
  )
}

function TimelineChart({ data }) {
  if (!data?.labels?.length) return <div className="h-full flex items-center justify-center text-zinc-600 text-sm">Nincs adat</div>
  return <Bar data={{ labels:data.labels, datasets:[{label:'Összes',data:data.emails,backgroundColor:'rgba(255,120,32,.15)',borderColor:'rgba(255,120,32,.6)',borderWidth:1.5,borderRadius:4},{label:'Figyelmet',data:data.complaints,type:'line',tension:0.4,fill:true,backgroundColor:'rgba(251,191,36,.08)',borderColor:'#fbbf24',borderWidth:1.5,pointRadius:3,pointBackgroundColor:'#fbbf24'}]}} options={{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{boxWidth:8,padding:12,color:'#9ca3af',font:{family:'JetBrains Mono',size:10}}}},scales:{x:{grid:{color:'rgba(255,255,255,.05)'},ticks:{color:'#6b7280'}},y:{grid:{color:'rgba(255,255,255,.05)'},ticks:{color:'#6b7280',stepSize:1},beginAtZero:true}}}} />
}

function CategoryChart({ data }) {
  if (!data) return <div className="h-full flex items-center justify-center text-zinc-600 text-sm">Nincs adat</div>
  return <Doughnut data={{labels:['Panasz','Érdeklődés','Egyéb'],datasets:[{data:[data.complaint||0,data.inquiry||0,data.other||0],backgroundColor:['rgba(248,113,113,.7)','rgba(255,120,32,.7)','rgba(113,113,122,.5)'],borderColor:['#f87171','#ff7820','#71717a'],borderWidth:1.5,hoverOffset:5}]}} options={{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,color:'#9ca3af',font:{family:'JetBrains Mono',size:10}}}}}} />
}

function AIPanel({ emailCount }) {
  const [ai,setAi]         = useState(aiCache)
  const [ts,setTs]         = useState(null)
  const [loading,setLoading] = useState(false)
  const { theme } = useStore()
  const isLight = theme === 'light'
  const load = useCallback(async(force=false)=>{
    if(!force&&aiCache&&aiCacheEmailCount===emailCount){setAi(aiCache);return}
    setLoading(true)
    try{const d=await api.aiInsights();aiCache=d.ai;aiCacheEmailCount=emailCount;setAi(d.ai);setTs(new Date(d.generated_at).toLocaleString('hu-HU'))}
    catch{setAi({problems:['AI nem elérhető'],trends:[],recommendations:[]})}
    finally{setLoading(false)}
  },[emailCount])
  useEffect(()=>{load()},[load])
  return (
    <div className="glass-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold">AI Elemzés</h3>
        <div className="flex items-center gap-2">
          {ts&&<span className="text-[10px] text-zinc-500 font-mono">{ts}</span>}
          <button className="text-[11px] text-zinc-500 hover:text-orange-400 font-mono border border-white/10 rounded px-2 py-1 transition-colors flex items-center gap-1" onClick={()=>load(true)}>
            <span className={loading?'inline-block animate-spin-slow':''}>↻</span> Frissítés
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AIBlock label="Problémák" color="red"   items={ai?.problems}        loading={loading&&!ai} isLight={isLight} />
        <AIBlock label="Trendek"   color="amber" items={ai?.trends}          loading={loading&&!ai} isLight={isLight} />
        <AIBlock label="Teendők"   color="green" items={ai?.recommendations} loading={loading&&!ai} isLight={isLight} />
      </div>
    </div>
  )
}
function AIBlock({ label, color, items, loading, isLight }) {
  const cs = { red: 'text-red-400', amber: 'text-amber-400', green: 'text-green-400' }
  return (
    <div className={clsx('border rounded-lg p-3', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[.03] border-white/7')}>
      <div className={clsx('text-[8.5px] font-bold uppercase tracking-[.14em] font-mono mb-2', cs[color])}>{label}</div>
      {loading
        ? <><Skeleton className="h-2.5 mb-1.5"/><Skeleton className="h-2.5 w-3/4"/></>
        : (items||[]).map((t,i) => (
          <div key={i} className={clsx('text-[12px] py-1 border-b last:border-none leading-snug', isLight ? 'text-slate-600 border-slate-100' : 'text-zinc-400 border-white/5')}>{t}</div>
        ))
      }
    </div>
  )
}

function ActivityFeed({ items }) {
  const icons={alert:'⚠',ok:'✓',email:'✉',doc:'◻'}
  const bgs={alert:'bg-amber-500/10',ok:'bg-green-500/10',email:'bg-orange-500/10',doc:'bg-blue-500/10'}
  return (
    <div className="glass-card">
      <div className="flex items-center justify-between mb-3"><h3 className="text-[13px] font-semibold">Legutóbbi aktivitás</h3><Chip color="green">Élő</Chip></div>
      {!items?.length?<><Skeleton className="h-3 mb-2"/><Skeleton className="h-3 w-3/4"/></>:items.map((a,i)=>(
        <div key={i} className="flex gap-2.5 items-start py-2 border-b border-white/5 last:border-none">
          <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center text-[13px] flex-shrink-0',bgs[a.type]||'bg-white/5')}>{icons[a.type]||'•'}</div>
          <div><div className="text-[12.5px] leading-snug">{a.title}</div><div className="text-[10px] text-zinc-500 font-mono mt-0.5">{a.meta}</div></div>
        </div>
      ))}
    </div>
  )
}
function DocMini({ docs }) {
  const ec={docx:'text-blue-400 bg-blue-500/10',pdf:'text-red-400 bg-red-500/10',xlsx:'text-green-400 bg-green-500/10'}
  return (
    <div className="glass-card">
      <div className="flex items-center justify-between mb-3"><h3 className="text-[13px] font-semibold">Dokumentumok</h3><Chip color="blue">{docs?.length||0} db</Chip></div>
      {!docs?.length?<div className="text-zinc-600 text-sm">Nincs dokumentum</div>:docs.slice(0,5).map((d,i)=>{
        const c=ec[d.ext]||'text-zinc-500 bg-white/5'
        return <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-none"><span className={clsx('text-[9px] font-bold font-mono px-1.5 py-0.5 rounded w-9 text-center',c)}>{(d.ext||'?').toUpperCase()}</span><span className="text-[12.5px] flex-1 truncate">{d.filename}</span><span className="text-[10px] text-zinc-500 font-mono flex-shrink-0">{d.size_kb}KB</span></div>
      })}
    </div>
  )
}
function SystemStatus() {
  const { health } = useStore()
  const rows=[{label:'PostgreSQL',ok:health?.db?.ok,val:health?.db?.ok?'Csatlakozva':'Offline'},{label:'Qdrant',ok:health?.qdrant?.ok,val:health?.qdrant?.ok?`${health.qdrant.vectors} v`:'Offline'},{label:'n8n',ok:health?.n8n?.ok,val:health?.n8n?.ok?'Aktív':'Offline'},{label:'OpenAI',ok:health?.openai?.configured,val:health?.openai?.configured?'OK':'Hiányzik'},{label:'Backend',ok:health!==null,val:health?'Online':'Offline'}]
  return (
    <div className="glass-card">
      <h3 className="text-[13px] font-semibold mb-3">Rendszer</h3>
      {rows.map(r=>(
        <div key={r.label} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-none text-[12.5px] text-zinc-400">
          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0 transition-all',health===null?'bg-zinc-600':r.ok?'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,.7)]':'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,.7)]')} />
          <span>{r.label}</span>
          <span className={clsx('ml-auto text-[10px] font-mono',health===null?'text-zinc-600':r.ok?'text-green-400':'text-red-400')}>{health===null?'—':r.val}</span>
        </div>
      ))}
      <div className="flex gap-2 mt-3">
        <button
          className="btn-ghost text-[11px] px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => {
            const url = import.meta.env.VITE_N8N_PUBLIC_URL
            if (url) {
              window.open(url, '_blank')
            } else {
              alert('Az n8n URL nincs konfigurálva. Kérd meg a rendszergazdát, hogy állítsa be a VITE_N8N_PUBLIC_URL környezeti változót.')
            }
          }}
          title={import.meta.env.VITE_N8N_PUBLIC_URL ? 'n8n megnyitása' : 'n8n URL nincs beállítva'}
        >
          n8n ↗
        </button>
        <button className="btn-ghost text-[11px] px-3 py-1.5" onClick={()=>window.location.reload()}>↻ Sync</button>
      </div>
    </div>
  )
}
