import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui/primitives'
import { fmtNum, fmtShortDate } from '../lib/format'
import { useTheme } from '../lib/theme'
import { useAsync } from '../lib/useAsync'
import type { EnvHistory, EnvMetric, EnvSummary } from '../types/api'

const NOTE = 'Historical NASA research measurements. Not live spacecraft data.'

interface Group { id: string; label: string; title: string; metrics: string[]; card: string }
const GROUPS: Group[] = [
  { id: 'temperature', label: 'Temperature', title: 'Cabin Temperature', metrics: ['temperature_c'], card: 'temperature_c' },
  { id: 'humidity', label: 'Humidity', title: 'Cabin Humidity', metrics: ['humidity_pct'], card: 'humidity_pct' },
  { id: 'co2', label: 'CO₂', title: 'Carbon Dioxide (CO₂)', metrics: ['co2_ppm'], card: 'co2_ppm' },
  { id: 'radiation', label: 'Radiation', title: 'Radiation Levels', card: 'radiation_total_mgy_d',
    metrics: ['radiation_total_mgy_d', 'radiation_gcr_mgy_d', 'radiation_saa_mgy_d', 'radiation_accumulated_mgy_d', 'radlab_absorbed_dose_rate'] },
]
const SHORT: Record<string, string> = {
  radiation_total_mgy_d: 'Daily total', radiation_gcr_mgy_d: 'Deep-space (cosmic rays)', radiation_saa_mgy_d: 'South Atlantic zone',
  radiation_accumulated_mgy_d: 'Running total', radlab_absorbed_dose_rate: 'Dose-rate sensors',
}
const EXPLAIN: Record<string, string> = {
  temperature_c: 'Air temperature inside the cabin.',
  humidity_pct: 'How much moisture is in the cabin air.',
  co2_ppm: 'Carbon dioxide in the cabin air. It builds up as people breathe in an enclosed space.',
  radiation_total_mgy_d: 'Radiation absorbed in the cabin over one day, from all sources combined.',
  radiation_gcr_mgy_d: 'The part of the daily dose that comes from high-energy particles arriving from deep space.',
  radiation_saa_mgy_d: 'The part of the daily dose picked up while passing over the South Atlantic Anomaly, where Earth’s magnetic shielding is weaker.',
  radiation_accumulated_mgy_d: 'A running total of the daily readings.',
  radlab_absorbed_dose_rate: 'Radiation measured by dose-rate sensors inside the cabin.',
}
type Loc = 'iss' | 'ground' | 'both'

const fmtDay = (iso: string | null | undefined) => (iso ? `${fmtShortDate(iso.slice(0, 10))} ${iso.slice(0, 4)}` : '—')
const fmtHour = (iso: string) => (iso.length > 10 ? `${fmtShortDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : fmtShortDate(iso))
/** Only a verified unit is ever shown next to a number. */
const unitOf = (m?: { unit: string; unit_verified: boolean }) => (m && m.unit_verified ? m.unit : '')

interface Series { key: string; name: string; color: string; dash?: string }
interface Chartable { rows: Record<string, number | string | null>[]; series: Series[]; bucket: string; window: EnvHistory['window']; avg: number | null }

export function Environment() {
  const { chart } = useTheme()
  const [group, setGroup] = useState('temperature')
  const [metricId, setMetricId] = useState('temperature_c')
  const [days, setDays] = useState<7 | 30>(7)
  const [loc, setLoc] = useState<Loc>('iss')
  const [period, setPeriod] = useState<string>('')

  const meta = useAsync(() => api.envMetrics(), [])
  const sum = useAsync(() => api.envSummary(), [])
  const periods = useAsync(() => api.envDatasets(metricId), [metricId])
  const g = GROUPS.find((x) => x.id === group) ?? GROUPS[0]
  const m: EnvMetric | undefined = meta.data?.items.find((x) => x.id === metricId)
  const hasGround = !!m?.locations.includes('ground')
  const effLoc: Loc = hasGround ? loc : 'iss'
  // newest observation period is the default, so the chart always has data to show
  const periodList = useMemo(() => (periods.data?.items ?? []).filter((p) => effLoc === 'both' || p.locations.length === 0 || p.locations.includes(effLoc)), [periods.data, effLoc])
  const activePeriod = periodList.find((p) => p.period_id === period)?.period_id ?? periodList[0]?.period_id

  const hist = useAsync<Chartable>(async () => {
    const locs = effLoc === 'both' ? (['iss', 'ground'] as const) : ([effLoc] as const)
    const results: EnvHistory[] = await Promise.all(locs.map((l) => api.envHistory(metricId, days, l, activePeriod)))
    const rows = new Map<string, Record<string, number | string | null>>()
    const series: Series[] = []
    const palette = [chart.hr, chart.sleep, chart.stress, chart.spo2, chart.hrv, chart.fatigue]
    const base = ({ temperature_c: chart.temp, humidity_pct: chart.spo2, co2_ppm: chart.glucose } as Record<string, string>)[metricId] ?? chart.hrv
    const isRad = metricId === 'radlab_absorbed_dose_rate'
    let sumV = 0, nV = 0
    results.forEach((r) => {
      for (const p of r.points) {
        const key = isRad ? (p.instrument_id ?? 'sensor') : r.location ?? 'iss'
        const row = rows.get(p.timestamp) ?? { t: p.timestamp }
        row[key] = p.value; row[`${key}_n`] = p.n; row[`${key}_min`] = p.min; row[`${key}_max`] = p.max
        rows.set(p.timestamp, row)
        if (!series.some((s) => s.key === key)) {
          series.push(isRad ? { key, name: key, color: palette[series.length % palette.length] }
            : key === 'ground' ? { key, name: 'Ground', color: chart.baseline, dash: '5 4' } : { key, name: 'ISS', color: base })
        }
        if (!isRad && key !== 'ground') { sumV += p.value; nV += 1 }
        if (isRad) { sumV += p.value; nV += 1 }
      }
    })
    const first = results[0]
    return { rows: [...rows.values()].sort((a, b) => String(a.t).localeCompare(String(b.t))), series, bucket: first?.bucket ?? 'day',
      window: first?.window ?? null, avg: nV ? sumV / nV : null }
  }, [metricId, days, effLoc, activePeriod, chart])

  const stats = (id: string) => (sum.data as EnvSummary | null)?.metrics.find((x) => x.id === id && (x.location === 'iss' || x.location == null))
  const unit = unitOf(m)

  function pickGroup(id: string) {
    const next = GROUPS.find((x) => x.id === id)!
    setGroup(id); setMetricId(next.metrics[0]); setPeriod('')
    if (next.id === 'radiation') setLoc('iss')
  }

  const loading = meta.loading || sum.loading
  const failed = meta.error ?? sum.error

  return (
    <div className="space-y-6">
      <PageHeader title="Environmental Trends" sub="Cabin conditions recorded during past NASA research"
        right={
          <div role="group" aria-label="Period" className="flex rounded-lg border border-hair bg-panel p-1">
            {([7, 30] as const).map((d) => (
              <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}
                className={`min-h-[40px] rounded-md px-4 text-sm font-semibold ${days === d ? 'bg-cyan text-on-accent' : 'text-ink-dim hover:text-ink'}`}>{d} days</button>
            ))}
          </div>
        } />
      <p className="-mt-3 text-xs text-ink-dim">{NOTE}</p>

      {loading ? <LoadingState label="Loading NASA records…" />
        : failed || !meta.data || !sum.data ? <ErrorState message={failed?.message ?? 'No data.'} onRetry={() => { meta.reload(); sum.reload() }} />
        : (
          <>
            <div role="tablist" aria-label="Environment measurement" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {GROUPS.map((x) => {
                const cm = meta.data!.items.find((i) => i.id === x.card)
                const st = stats(x.card)
                return (
                  <button key={x.id} role="tab" aria-selected={x.id === group} onClick={() => pickGroup(x.id)}
                    className={`card text-left transition-colors hover:bg-panel2 ${x.id === group ? '!border-cyan/60' : ''}`}>
                    <p className="card-title">{x.title}</p>
                    <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
                      {st ? fmtNum(st.mean, st.mean < 10 ? 2 : 0) : '—'}
                      {st && unitOf(cm) && <span className="ml-1 text-sm font-medium text-ink-dim">{unitOf(cm)}</span>}
                    </p>
                    <p className="mt-1 text-xs text-ink-dim">Typical level · latest record {fmtDay(cm?.last_timestamp)}</p>
                  </button>
                )
              })}
            </div>

            {g.metrics.length > 1 && (
              <div role="group" aria-label="Radiation measure" className="flex flex-wrap gap-2">
                {g.metrics.map((id) => (
                  <button key={id} aria-pressed={id === metricId} onClick={() => { setMetricId(id); setLoc('iss'); setPeriod('') }}
                    className={`min-h-[36px] rounded-md border px-3 text-xs font-semibold ${id === metricId ? 'border-cyan bg-cyan/10 text-cyan' : 'border-hair text-ink-dim hover:bg-panel2 hover:text-ink'}`}>
                    {SHORT[id]}{!meta.data?.items.find((i) => i.id === id)?.unit_verified ? ' · unit not verified' : ''}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
              <section className="card" aria-label="Environmental trend">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold">{g.metrics.length > 1 ? `${g.title} · ${SHORT[metricId]}` : g.title}</h2>
                  {m && !m.unit_verified && <span className="rounded-md border px-2 py-0.5 text-xs font-semibold" style={{ borderColor: 'rgb(var(--st-review) / .6)', color: 'rgb(var(--st-review))' }}>Unit not verified</span>}
                  {m && m.unit_verified && <span className="rounded-md border border-hair bg-panel2 px-2 py-0.5 text-xs font-semibold text-ink-dim">{m.unit}</span>}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {periodList.length > 1 && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-ink-dim">
                      Observation period
                      <select className="field !min-h-[36px] !w-auto !py-1 text-sm" value={activePeriod} onChange={(e) => setPeriod(e.target.value)}>
                        {periodList.map((p) => <option key={p.period_id} value={p.period_id}>{fmtDay(p.first_timestamp)} – {fmtDay(p.last_timestamp)}</option>)}
                      </select>
                    </label>
                  )}
                  {hasGround ? (
                    <div role="group" aria-label="Location" className="ml-auto flex rounded-lg border border-hair bg-panel p-1">
                      {([['iss', 'ISS'], ['ground', 'Ground'], ['both', 'Compare']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setLoc(v)} aria-pressed={effLoc === v}
                          className={`min-h-[34px] rounded-md px-3 text-xs font-semibold ${effLoc === v ? 'bg-cyan text-on-accent' : 'text-ink-dim hover:text-ink'}`}>{l}</button>
                      ))}
                    </div>
                  ) : <span className="ml-auto text-xs text-ink-dim">ISS only</span>}
                </div>

                <div className="mt-3">
                  {hist.loading ? <LoadingState />
                    : hist.error ? <ErrorState message={hist.error.message} onRetry={hist.reload} />
                    : !hist.data || !hist.data.rows.length ? <EmptyState title="No records in this period" body="Try another observation period or time range." />
                    : (
                      <div style={{ height: 300 }} className="w-full" role="img" aria-label={`${g.title} history, ${hist.data.rows.length} points`}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={hist.data.rows} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                            <CartesianGrid stroke={chart.grid} vertical={false} />
                            <XAxis dataKey="t" tickFormatter={(v) => (hist.data!.bucket === 'day' ? fmtShortDate(String(v)) : fmtHour(String(v)))}
                              stroke={chart.axis} tick={{ fontSize: 11 }} tickLine={false} minTickGap={36} />
                            <YAxis stroke={chart.axis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={52}
                              tickFormatter={(v) => fmtNum(Number(v), Number.isInteger(Number(v)) ? 0 : Math.abs(Number(v)) < 10 ? 2 : 1)} />
                            <Tooltip content={<Tip unit={unit} series={hist.data.series} rows={hist.data.rows} bucket={hist.data.bucket} />} />
                            {hist.data.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                            {hist.data.series.map((s) => (
                              <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeDasharray={s.dash} strokeWidth={1.75}
                                dot={hist.data!.rows.length > 40 ? false : { r: 3, strokeWidth: 0, fill: s.color }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                </div>
              </section>

              <section className="card space-y-4" aria-label="About this measurement">
                <p className="card-title">About this measurement</p>
                {m && (
                  <dl className="space-y-3 text-sm">
                    <Row k="Measurement" v={g.metrics.length > 1 ? `${g.title} · ${SHORT[m.id]}` : g.title} />
                    <Row k={`Average in view`} v={hist.data?.avg != null
                      ? <>{fmtNum(hist.data.avg, Math.abs(hist.data.avg) < 10 ? 2 : 1)}{unit && ` ${unit}`}{!m.unit_verified && <span className="text-ink-dim"> · unit not verified</span>}</>
                      : '—'} />
                    <Row k="Observation dates" v={hist.data?.window ? `${fmtDay(hist.data.window.start)} → ${fmtDay(hist.data.window.end)}` : '—'} />
                    <Row k="What it shows" v={EXPLAIN[m.id]} />
                  </dl>
                )}
                {m && !m.unit_verified && (
                  <p className="rounded-lg border p-3 text-sm" style={{ borderColor: 'rgb(var(--st-review) / .5)' }}>
                    The unit for this measurement has not been verified, so numbers are shown without one.
                  </p>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-ink-dim">Data information</summary>
                  <div className="mt-2 space-y-1.5 text-ink-dim">
                    <p>Latest NASA record for this measurement: <b className="text-ink">{fmtDay(m?.last_timestamp)}</b>.</p>
                    <p>{sum.data.no_data_after_note}</p>
                    <p>{hist.data?.bucket === 'hour' ? 'Hourly averages are shown.' : hist.data?.bucket === 'day' ? 'Daily averages are shown.' : ''} Hover the chart for the lowest and highest reading in each step.</p>
                    {periods.data?.items[0]?.source_url && <p>Source: <a className="underline" href={periods.data.items.find((p) => p.period_id === activePeriod)?.source_url ?? periods.data.items[0].source_url ?? '#'} target="_blank" rel="noreferrer">NASA Open Science Data Repository</a></p>}
                  </div>
                </details>
              </section>
            </div>
          </>
        )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wider text-ink-dim">{k}</dt><dd className="mt-0.5 break-words">{v}</dd></div>
}

interface TipProps {
  active?: boolean; label?: string | number; unit: string; series: Series[]; bucket: string
  rows: Record<string, number | string | null>[]
}
function Tip({ active, label, unit, series, rows, bucket }: TipProps) {
  const { chart } = useTheme()
  if (!active || label == null) return null
  const row = rows.find((r) => r.t === label)
  if (!row) return null
  return (
    <div className="max-w-[270px] rounded-lg border p-3 text-xs shadow-lg" style={{ background: chart.tipBg, borderColor: chart.tipBorder, color: chart.tipText }}>
      <p className="font-semibold">{bucket === 'day' ? fmtShortDate(String(label)) : fmtHour(String(label))} UTC</p>
      {series.map((s) => {
        const v = row[s.key]
        return (
          <div key={s.key} className="mt-1.5">
            <p><span style={{ color: s.color }}>●</span> {s.name}: <b>{typeof v === 'number' ? `${fmtNum(v, Math.abs(v) < 10 ? 2 : 1)}${unit ? ` ${unit}` : ''}` : 'no record'}</b></p>
            {typeof v === 'number' && <p className="opacity-75">low {fmtNum(row[`${s.key}_min`] as number, 2)} · high {fmtNum(row[`${s.key}_max`] as number, 2)}</p>}
          </div>
        )
      })}
    </div>
  )
}
