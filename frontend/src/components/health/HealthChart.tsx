import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtShortDate } from '../../lib/format'
import { useTheme } from '../../lib/theme'
import { METRICS } from '../../health/metrics'
import type { Baseline, Row } from '../../health/service'
import type { Metric } from '../../health/types'

interface Props {
  title?: string
  rows: Row[]
  metrics: Metric[]
  baselines?: Partial<Record<Metric, Baseline | null>>
  xKey?: string
  xFormat?: (v: string) => string
  height?: number
}

/** Line chart with real gaps for missing data, sensible y-domain and an honest tooltip. */
export function HealthChart({ title, rows, metrics, baselines, xKey = 'date', xFormat = fmtShortDate, height = 260 }: Props) {
  const { chart } = useTheme()
  const first = METRICS[metrics[0]]
  const values: number[] = []
  rows.forEach((r) => metrics.forEach((m) => { const v = r[m]; if (typeof v === 'number') values.push(v) }))
  metrics.forEach((m) => { const b = baselines?.[m]; if (b) values.push(b.value) })
  const points = rows.filter((r) => metrics.some((m) => typeof r[m] === 'number')).length

  let domain: [number, number] | undefined
  if (values.length) {
    const lo = Math.min(...values), hi = Math.max(...values)
    const span = Math.max(hi - lo, Math.max(...metrics.map((m) => METRICS[m].minSpan)))
    const mid = (hi + lo) / 2
    const d = first.digits
    domain = [Number((mid - span * 0.6).toFixed(d)), Number((mid + span * 0.6).toFixed(d))]
    if (first.unit === '/10' || first.unit === '%') domain = [Math.max(0, domain[0]), Math.min(first.unit === '%' ? 100 : 10, domain[1])]
  }

  if (!values.length) {
    return <div className="flex h-48 items-center justify-center text-sm text-ink-dim">No readings in this period</div>
  }

  return (
    <div>
      {points <= 2 && <p className="mb-2 text-xs text-ink-dim">Only {points} reading{points === 1 ? '' : 's'} available in this period.</p>}
      <div style={{ height }} className="w-full" role="img" aria-label={`${title ?? first.label} chart, ${points} data points`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={(v) => xFormat(String(v))} stroke={chart.axis} tick={{ fontSize: 11 }} tickLine={false} minTickGap={28} />
            <YAxis stroke={chart.axis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={domain ?? ['auto', 'auto']}
              allowDecimals={first.digits > 0} tickFormatter={(v) => Number(v).toFixed(first.digits)} width={46} />
            <Tooltip content={<Tip rows={rows} metrics={metrics} baselines={baselines} xKey={xKey} xFormat={xFormat} />} />
            {metrics.map((m) => {
              const b = baselines?.[m]
              return b ? <ReferenceLine key={`b-${m}`} y={b.value} stroke={chart.baseline} strokeDasharray="4 4" strokeOpacity={0.75} /> : null
            })}
            {metrics.map((m) => (
              <Line key={m} type="linear" dataKey={m} name={METRICS[m].label} stroke={chart[METRICS[m].color]} strokeWidth={1.75}
                connectNulls={false} dot={{ r: points > 40 ? 0 : 3, strokeWidth: 0, fill: chart[METRICS[m].color] }} activeDot={{ r: 5 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface TipProps {
  active?: boolean
  label?: string | number
  rows: Row[]
  metrics: Metric[]
  baselines?: Props['baselines']
  xKey: string
  xFormat: (v: string) => string
}

function Tip({ active, label, rows, metrics, baselines, xKey, xFormat }: TipProps) {
  const { chart } = useTheme()
  if (!active || label == null) return null
  const row = rows.find((r) => r[xKey] === label)
  if (!row) return null
  return (
    <div className="max-w-[260px] rounded-lg border p-3 text-xs shadow-lg" style={{ background: chart.tipBg, borderColor: chart.tipBorder, color: chart.tipText }}>
      <p className="font-semibold">{xFormat(String(label))}</p>
      {metrics.map((m) => {
        const v = row[m]
        const def = METRICS[m]
        const n = row[`${m}_n`] as number | undefined
        const src = row[`${m}_src`] as string | undefined
        const b = baselines?.[m]
        return (
          <div key={m} className="mt-1.5">
            <p><span style={{ color: chart[def.color] }}>●</span> {def.label}: <b>{typeof v === 'number' ? `${v.toFixed(def.digits)} ${def.unit}` : 'not measured'}</b></p>
            {typeof v === 'number' && src && <p className="opacity-75">{src}{n && n > 1 ? ` · median of ${n} readings` : ''}</p>}
            {b && <p className="opacity-75">Baseline {b.value.toFixed(def.digits)} {def.unit} · median of {b.days} days</p>}
          </div>
        )
      })}
    </div>
  )
}
