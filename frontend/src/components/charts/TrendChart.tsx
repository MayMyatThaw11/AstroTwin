import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from '../../types/api'
import { fmtShortDate } from '../../lib/format'
import { useTheme, type ChartPalette } from '../../lib/theme'

type Key = 'resting_heart_rate_bpm' | 'sleep_hours' | 'temperature_c' | 'stress_score'

interface Props {
  title: string
  points: TrendPoint[]
  dataKey: Key
  unit: string
  color: keyof Pick<ChartPalette, 'hr' | 'sleep' | 'temp' | 'stress'>
  digits?: number
  baseline?: number | null
  domain?: [number | 'auto', number | 'auto']
}

export function TrendChart({ title, points, dataKey, unit, color, digits = 0, baseline, domain }: Props) {
  const { chart } = useTheme()
  const stroke = chart[color]
  const withData = points.filter((p) => p[dataKey] != null)
  const gid = `g-${dataKey}`
  return (
    <section className="card" aria-label={`${title} trend`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="card-title">{title}</h3>
        <span className="text-xs text-ink-dim">{unit}{baseline != null && ' · dashed line = baseline'}</span>
      </div>
      {withData.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-ink-dim">No data for this period</div>
      ) : (
        <div className="mt-3 h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtShortDate} stroke={chart.axis} tick={{ fontSize: 11 }} tickLine={false} minTickGap={24} />
              <YAxis stroke={chart.axis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={domain ?? ['auto', 'auto']} width={44} />
              <Tooltip
                contentStyle={{ background: chart.tipBg, border: `1px solid ${chart.tipBorder}`, borderRadius: 8, color: chart.tipText, fontSize: 12 }}
                labelFormatter={(l) => fmtShortDate(String(l))}
                formatter={(v) => [`${Number(v).toFixed(digits)} ${unit}`, title]}
              />
              {baseline != null && <ReferenceLine y={baseline} stroke={chart.baseline} strokeDasharray="4 4" strokeOpacity={0.8} />}
              <Area
                type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={1.75} fill={`url(#${gid})`}
                connectNulls={false} dot={{ r: 2, fill: stroke, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
