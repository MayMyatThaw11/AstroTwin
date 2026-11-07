import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2, CircleHelp, Info, Loader2, SearchX, ShieldAlert, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { Status } from '../../types/api'
import { STATUS_LABEL } from '../../lib/format'

const STATUS_STYLE: Record<Status, { v: string; Icon: typeof CheckCircle2 }> = {
  stable: { v: '--st-stable', Icon: CheckCircle2 },
  review: { v: '--st-review', Icon: AlertTriangle },
  escalate: { v: '--st-escalate', Icon: ShieldAlert },
  insufficient_data: { v: '--st-na', Icon: CircleHelp },
}

/** CSS colour for a status, optionally with alpha. */
export function statusColor(s: Status, alpha = 1) {
  return `rgb(var(${STATUS_STYLE[s].v}) / ${alpha})`
}

export function StatusBadge({ status, large }: { status: Status; large?: boolean }) {
  const { Icon } = STATUS_STYLE[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-semibold ${large ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'}`}
      style={{ color: statusColor(status), borderColor: statusColor(status, 0.4), background: statusColor(status, 0.1) }}
    >
      <Icon className={large ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}
export const StatusPill = StatusBadge

export function SimBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-hair bg-panel2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
      {label}
    </span>
  )
}

export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-3 font-display text-lg font-semibold"><span className="h-0.5 w-8 rounded bg-cyan" aria-hidden />{title}</h2>
        {sub && <p className="mt-0.5 pl-11 text-sm text-ink-dim">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-dim">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function InfoBanner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'note'}
      className="flex items-start gap-2.5 rounded-lg border border-hair bg-panel px-3.5 py-2.5 text-sm text-ink-dim"
      style={tone === 'warn' ? { borderColor: statusColor('review', 0.5), color: 'rgb(var(--ink))' } : undefined}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tone === 'warn' ? statusColor('review') : 'rgb(var(--accent))' }} aria-hidden />
      <div>{children}</div>
    </div>
  )
}

/** Inline sparkline with a soft area fill; null values leave gaps. */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length < 2) return null
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1
  const w = 100, h = 36
  const x = (i: number) => (i / (values.length - 1)) * w
  const y = (v: number) => h - 4 - ((v - min) / span) * (h - 10)
  let line = '', area = '', pen = false, first = 0, last = 0
  values.forEach((v, i) => {
    if (v == null) {
      if (pen) { area += `L${x(last).toFixed(1)} ${h} L${x(first).toFixed(1)} ${h} Z `; pen = false }
      return
    }
    line += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
    area += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
    if (!pen) first = i
    last = i; pen = true
  })
  if (pen) area += `L${x(last).toFixed(1)} ${h} L${x(first).toFixed(1)} ${h} Z`
  const id = `sp-${label.replace(/\W/g, '')}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-9 w-full" role="img" aria-label={`${label}, last ${values.length} days`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--accent))" stopOpacity=".22" />
          <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function MetricTile({
  label, value, unit, baseline, delta, digits = 0, spark, icon: Icon,
}: {
  icon?: LucideIcon; label: string; value: number | null | undefined; unit: string
  baseline?: number | null; delta?: string | null; digits?: number; spark?: (number | null)[]
}) {
  const hasValue = value != null
  const Arrow = delta == null || delta === '±0' ? Minus : delta.startsWith('+') ? ArrowUpRight : ArrowDownRight
  return (
    <div className="card fade-in flex flex-col rounded-[18px] !p-5">
      <div className="flex items-start gap-4">
        {Icon && <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Icon className="h-5 w-5" aria-hidden /></span>}
        <div className="min-w-0">
          <p className="card-title !tracking-[.14em]">{label}</p>
          <p className="mt-1 flex items-baseline gap-1.5 font-display text-4xl font-semibold leading-none tabular-nums tracking-tight">
            {hasValue ? value.toFixed(digits) : <span className="text-2xl font-medium text-ink-dim">No data</span>}
            {hasValue && <span className="text-base font-medium text-ink-dim">{unit}</span>}
          </p>
          {delta != null && baseline != null ? (
            <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-panel2 px-2 py-1 text-xs text-ink-dim">
              <Arrow className="h-3.5 w-3.5" aria-hidden /><span className="font-semibold text-ink">{delta}</span> vs baseline {baseline.toFixed(digits)}
            </p>
          ) : (
            <p className="mt-2.5 text-xs text-ink-dim">Baseline: not enough data</p>
          )}
        </div>
      </div>
      {spark && <div className="mt-4">{<Sparkline values={spark} label={label} />}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="card flex items-center justify-center gap-3 py-12 text-sm text-ink-dim">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label}
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-1.5 py-8 text-center">
      <SearchX className="h-7 w-7 text-ink-dim" aria-hidden />
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-md text-sm text-ink-dim">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-1.5 py-8 text-center" style={{ borderColor: statusColor('escalate', 0.5) }}>
      <AlertTriangle className="h-7 w-7" style={{ color: statusColor('escalate') }} aria-hidden />
      <p className="font-semibold">Couldn't load this view</p>
      <p className="max-w-md text-sm text-ink-dim">{message}</p>
      {onRetry && <button className="btn-ghost mt-2" onClick={onRetry}>Retry</button>}
    </div>
  )
}
