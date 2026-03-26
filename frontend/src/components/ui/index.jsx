import clsx from 'clsx'

export function Badge({ variant = 'default', children, className }) {
  const variants = {
    new:       'bg-blue-500/15 text-blue-300 border border-blue-400/25',
    ai:        'bg-green-500/15 text-green-400 border border-green-400/25',
    attention: 'bg-amber-500/15 text-amber-400 border border-amber-400/25',
    closed:    'bg-white/5 text-zinc-400 border border-white/10',
    learned:   'bg-orange-500/10 text-orange-400 border border-orange-400/25',
    default:   'bg-white/5 text-zinc-400 border border-white/10',
  }
  return (
    <span className={clsx('badge', variants[variant], className)}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }) {
  const map = {
    NEW:              { variant: 'new',       label: 'NEW' },
    AI_ANSWERED:      { variant: 'ai',        label: '✓ AI' },
    NEEDS_ATTENTION:  { variant: 'attention', label: '⚠ NEEDS' },
    CLOSED:           { variant: 'closed',    label: 'CLOSED' },
  }
  const cfg = map[status] || { variant: 'default', label: status }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

export function Chip({ color = 'orange', children }) {
  const colors = {
    orange: 'bg-orange-500/10 text-orange-400 border-orange-400/25',
    green:  'bg-green-500/10 text-green-400 border-green-400/25',
    blue:   'bg-blue-500/10 text-blue-400 border-blue-400/25',
    amber:  'bg-amber-500/10 text-amber-400 border-amber-400/25',
    red:    'bg-red-500/10 text-red-400 border-red-400/25',
  }
  return (
    <span className={clsx('text-[10px] font-mono font-semibold px-2 py-0.5 rounded border', colors[color])}>
      {children}
    </span>
  )
}

export function Skeleton({ className }) {
  return <span className={clsx('skeleton block', className)} />
}

export function Spinner({ className }) {
  return (
    <span className={clsx('inline-block animate-spin-slow', className)}>↻</span>
  )
}

export function LiveDot({ status }) {
  const cfg = {
    ok:      { dot: 'bg-green-400', text: 'text-green-400 bg-green-500/10 border-green-400/25' },
    error:   { dot: 'bg-red-400',   text: 'text-red-400 bg-red-500/10 border-red-400/25' },
    loading: { dot: 'bg-amber-400', text: 'text-amber-400 bg-amber-500/10 border-amber-400/25' },
  }[status] || { dot: 'bg-amber-400', text: 'text-amber-400 bg-amber-500/10 border-amber-400/25' }

  return { dotClass: clsx(cfg.dot, 'animate-pulse-dot'), chipClass: cfg.text }
}

export function ConfBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 70 ? 'bg-green-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-11 h-0.5 bg-white/10 rounded-full overflow-hidden flex-shrink-0">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10.5px] text-zinc-500">{pct}%</span>
    </div>
  )
}
