import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { EmptyState, ErrorState, InfoBanner, LoadingState, PageHeader, SectionHeader } from '../components/ui/primitives'
import { fmtNum, fmtShortDate } from '../lib/format'
import { useTheme } from '../lib/theme'
import { useAsync } from '../lib/useAsync'
import type { EnvHistory, EnvMetric, EnvSummary } from '../types/api'

const LABEL = 'Historical NASA Research Data — Not Live Telemetry'

interface Group { id: string; label: string; metrics: string[] }
const GROUPS: Group[] = [
  { id: 'temperature', label: 'Temperature', metrics: ['temperature_c'] },
  { id: 'humidity', label: 'Humidity', metrics: ['humidity_pct'] },
  { id: 'co2', label: 'CO₂', metrics: ['co2_ppm'] },
  { id: 'radiation', label: 'Radiation', metrics: ['radiation_total_mgy_d', 'radiation_gcr_mgy_d', 'radiation_saa_mgy_d', 'radiation_accumulated_mgy_d', 'radlab_absorbed_dose_rate'] },
]
const SHORT: Record<string, string> = {
  radiation_total_mgy_d: 'Total dose', radiation_gcr_mgy_d: 'GCR dose', radiation_saa_mgy_d: 'SAA dose',
  radiation_accumulated_mgy_d: 'Accumulated dose', radlab_absorbed_dose_rate: 'RadLab dose rate',
}
type Loc = 'iss' | 'ground' | 'both'

const fmtStamp = (iso: string | null | undefined) => (iso ? `${fmtShortDate(iso.slice(0, 10))} ${iso.slice(0, 4)}` : '—')
const fmtHour = (iso: string) => (iso.length > 10 ? `${fmtShortDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : fmtShortDate(iso))

interface Series { key: string; name: string; color: string; dash?: string }
interface Chartable { rows: Record<string, number | string | null>[]; series: Series[]; bucket: string; window: EnvHistory['window'] }

function UnitBadge({ m }: { m: EnvMetric }) {
  return m.unit_verified
    ? <span className="rounded-md border border-hair bg-panel2 px-2 py-0.5 text-xs font-semibold text-ink-dim">Unit: {m.unit}</span>
    : <span className="rounded-md border px-2 py-0.5 text-xs font-semibold" style={{ borderColor: 'rgb(var(--st-review) / .6)', color: 'rgb(var(--st-review))' }}>
        Unit requires verification · source: {m.unit}
      </span>
}

export function Environment() {
  const { chart } = useTheme()
  const [group, setGroup] = useState('temperature')
  const [metricId, setMetricId] = useState('temperature_c')
  const [days, setDays] = useState<7 | 30>(7)
  const [loc, setLoc] = useState<Loc>('iss')

  const meta = useAsync(() => api.envMetrics(), [])
  const sum = useAsync(() => api.envSummary(), [])
  const g = GROUPS.find((x) => x.id === group) ?? GROUPS[0]
  const m: EnvMetric | undefined = meta.data?.items.find((x) => x.id === metricId)
  const hasGround = !!m?.locations.includes('ground')
  const effLoc: Loc = hasGround ? loc : 'iss'

  const hist = useAsync<Chartable>(async () => {
    const locs = effLoc === 'both' ? (['iss', 'ground'] as const) : ([effLoc] as const)
    const results: EnvHistory[] = await Promise.all(locs.map((l) => api.envHistory(metricId, days, l)))
    const rows = new Map<string, Record<string, number | string | null>>()
    const series: Series[] = []
    const palette = [chart.hr, chart.sleep, chart.stress, chart.spo2]
    const base = ({ temperature_c: chart.temp, humidity_pct: chart.spo2, co2_ppm: chart.glucose } as Record<string, string>)[metricId] ?? chart.hrv
    results.forEach((r) => {
      const isRad = metricId === 'radlab_absorbed_dose_rate'
      for (const p of r.points) {
        const key = isRad ? (p.instrument_id ?? 'instrument') : r.location ?? 'iss'
        const row = rows.get(p.timestamp) ?? { t: p.timestamp }
        row[key] = p.value
        row[`${key}_n`] = p.n
        row[`${key}_min`] = p.min
        row[`${key}_max`] = p.max
        rows.set(p.timestamp, row)
        if (!series.some((s) => s.key === key)) {
          series.push(isRad
            ? { key, name: `${key}${p.module ? ` · ${p.module}` : ''}`, color: palette[series.length % palette.length] }
            : key === 'ground'
              ? { key, name: 'Ground (control unit)', color: chart.baseline, dash: '5 4' }
              : { key, name: 'ISS', color: base })
        }
      }
    })
    const first = results[0]
    return { rows: [...rows.values()].sort((a, b) => String(a.t).localeCompare(String(b.t))), series, bucket: first?.bucket ?? 'day', window: first?.window ?? null }
  }, [metricId, days, effLoc, chart])

  const stats = useMemo(() => (sum.data as EnvSummary | null)?.metrics.filter((x) => x.id === metricId) ?? [], [sum.data, metricId])
  const win = hist.data?.window ?? null

  function pickGroup(id: string) {
    const next = GROUPS.find((x) => x.id === id)!
    setGroup(id)
    setMetricId(next.metrics[0])
    if (next.id === 'radiation') setLoc('iss')
  }

  const loading = meta.loading || sum.loading
  const failed = meta.error ?? sum.error

  return (
    <div className="space-y-6">
      <PageHeader title="Mission environment" sub="NASA ISS research datasets · environment context, not crew health data"
        right={
          <div role="group" aria-label="Period" className="flex rounded-lg border border-hair bg-panel p-1">
            {([7, 30] as const).map((d) => (
              <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}
                className={`min-h-[40px] rounded-md px-4 text-sm font-semibold ${days === d ? 'bg-cyan text-on-accent' : 'text-ink-dim hover:text-ink'}`}>{d} days</button>
            ))}
          </div>
        } />

      <InfoBanner tone="warn">
        <p className="font-semibold">{LABEL}</p>
        <p className="mt-0.5 text-ink-dim">These are archived measurements from past NASA experiments (2014 and 2022). They are not current spacecraft readings and are not linked to any astronaut or to anyone's personal radiation dose.</p>
      </InfoBanner>

      {loading ? <LoadingState label="Loading NASA datasets…" />
        : failed || !meta.data || !sum.data ? <ErrorState message={failed?.message ?? 'No data.'} onRetry={() => { meta.reload(); sum.reload() }} />
        : (
          <>
            <div role="tablist" aria-label="Environment metric" className="flex flex-wrap gap-2">
              {GROUPS.map((x) => (
                <button key={x.id} role="tab" aria-selected={x.id === group} onClick={() => pickGroup(x.id)}
                  className={`min-h-[40px] rounded-full border px-4 text-sm font-medium transition-colors ${x.id === group ? 'border-cyan bg-cyan/10 text-cyan' : 'border-hair text-ink-dim hover:bg-panel2 hover:text-ink'}`}>{x.label}</button>
              ))}
            </div>

            {g.metrics.length > 1 && (
              <div role="group" aria-label="Radiation measure" className="flex flex-wrap gap-2">
                {g.metrics.map((id) => (
                  <button key={id} aria-pressed={id === metricId} onClick={() => { setMetricId(id); setLoc('iss') }}
                    className={`min-h-[36px] rounded-md border px-3 text-xs font-semibold ${id === metricId ? 'border-cyan bg-cyan/10 text-cyan' : 'border-hair text-ink-dim hover:bg-panel2 hover:text-ink'}`}>
                    {SHORT[id]}{!meta.data?.items.find((i) => i.id === id)?.unit_verified ? ' · unit unverified' : ''}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
              <section className="card" aria-label="Environment trend">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold">{m ? (SHORT[m.id] ?? m.label) : 'Metric'}</h2>
                  {m && <UnitBadge m={m} />}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-hair bg-panel2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-dim">{LABEL}</span>
                  {hasGround ? (
                    <div role="group" aria-label="Location" className="ml-auto flex rounded-lg border border-hair bg-panel p-1">
                      {([['iss', 'ISS'], ['ground', 'Ground'], ['both', 'Compare']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setLoc(v)} aria-pressed={effLoc === v}
                          className={`min-h-[34px] rounded-md px-3 text-xs font-semibold ${effLoc === v ? 'bg-cyan text-on-accent' : 'text-ink-dim hover:text-ink'}`}>{l}</button>
                      ))}
                    </div>
                  ) : <span className="ml-auto text-xs text-ink-dim">ISS series only for this measure</span>}
                </div>

                <div className="mt-3">
                  {hist.loading ? <LoadingState />
                    : hist.error ? <ErrorState message={hist.error.message} onRetry={hist.reload} />
                    : !hist.data || !hist.data.rows.length ? <EmptyState title="No samples in this window" body="The backend returned no readings for this selection." />
                    : (
                      <div style={{ height: 300 }} className="w-full" role="img" aria-label={`${m?.label ?? 'Environment'} history, ${hist.data.rows.length} points`}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={hist.data.rows} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                            <CartesianGrid stroke={chart.grid} vertical={false} />
                            <XAxis dataKey="t" tickFormatter={(v) => (hist.data!.bucket === 'day' ? fmtShortDate(String(v)) : fmtHour(String(v)))}
                              stroke={chart.axis} tick={{ fontSize: 11 }} tickLine={false} minTickGap={36} />
                            <YAxis stroke={chart.axis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={52}
                              tickFormatter={(v) => fmtNum(Number(v), Number.isInteger(Number(v)) ? 0 : Math.abs(Number(v)) < 10 ? 2 : 1)} />
                            <Tooltip content={<Tip unit={m?.unit ?? ''} series={hist.data.series} rows={hist.data.rows} bucket={hist.data.bucket} />} />
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
                <p className="mt-2 text-xs text-ink-dim">
                  {win ? `Window: ${fmtStamp(win.start_exclusive)} → ${fmtStamp(win.end)}. ` : ''}
                  The window ends at the last archived sample, not today. {hist.data?.bucket === 'hour' ? 'Hourly averages. ' : hist.data?.bucket === 'day' ? 'Daily averages. ' : ''}Hover for min/max and sample counts.
                </p>
              </section>

              <section className="card space-y-4" aria-label="Source and units">
                <p className="card-title">Source & measurement</p>
                {m && (
                  <dl className="space-y-3 text-sm">
                    <Row k="Dataset" v={m.dataset} />
                    <Row k="Source field" v={m.description} />
                    <Row k="Unit" v={<><span>{m.unit}</span> {!m.unit_verified && <b style={{ color: 'rgb(var(--st-review))' }}>(requires verification)</b>}</>} />
                    <Row k="Observation dates" v={`${fmtStamp(m.first_timestamp)} → ${fmtStamp(m.last_timestamp)} (UTC)`} />
                    <Row k="Samples in database" v={fmtNum(m.sample_count)} />
                    <Row k="Instrument / location" v={m.id === 'radlab_absorbed_dose_rate' ? 'RadLab dosimeters (DosTel1, DosTel2, Lidal, REM-Lid), Columbus module, ISS' : hasGround ? 'RR-1 EDA unit on the ISS, and a separate ground-control unit' : 'RR-1 EDA, ISS'} />
                  </dl>
                )}
                {m && !m.unit_verified && (
                  <p className="rounded-lg border p-3 text-sm" style={{ borderColor: 'rgb(var(--st-review) / .5)' }}>
                    {m.id === 'radiation_accumulated_mgy_d'
                      ? 'This is a running total, yet the source labels it "mGy/day". The unit is shown exactly as published and needs verification before it is relied on.'
                      : 'The RadLab file does not state a unit for absorbed_dose_rate. None is assumed; values are shown in source-native numbers only.'}
                  </p>
                )}
                {stats.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Dataset statistics</p>
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-xs text-ink-dim"><th className="py-1 pr-3 font-semibold">Series</th><th className="pr-3 font-semibold">Min</th><th className="pr-3 font-semibold">Mean</th><th className="font-semibold">Max</th></tr></thead>
                        <tbody>
                          {stats.map((s) => (
                            <tr key={s.location ?? 'x'} className="border-t border-hair tabular-nums">
                              <td className="py-1.5 pr-3 font-medium">{(s.location ?? 'iss').toUpperCase()}</td>
                              <td className="pr-3">{fmtNum(s.min, 2)}</td><td className="pr-3">{fmtNum(s.mean, 2)}</td><td>{fmtNum(s.max, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <section aria-label="Source datasets">
              <SectionHeader title="Source datasets" sub="Imported from the supplied NASA archive. Original values are kept; nothing is filled in." />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {sum.data.datasets.map((d) => {
                  const files = sum.data!.sources
                  return (
                    <div key={d.name} className="card">
                      <p className="card-title">{d.publisher}</p>
                      <p className="mt-1 font-display text-base font-semibold">{d.name}</p>
                      <p className="mt-1 text-sm text-ink-dim">{d.period} · {d.locations.join(' + ').toUpperCase()}</p>
                      {d.note && <p className="mt-2 text-xs text-ink-dim">{d.note}</p>}
                      <p className="mt-2 text-xs text-ink-dim">{files.length ? `${files.reduce((a, f) => a + f.samples_in_db, 0) > 0 ? 'Imported from ' + files.map((f) => f.source_file).filter((f) => matches(d.name, f)).join(', ') : ''}` : ''}</p>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
    </div>
  )
}

const matches = (dataset: string, file: string) =>
  (dataset.includes('telemetry') && file.includes('Telemetry')) || (dataset.includes('daily radiation') && file.includes('Radiation_table')) || (dataset.includes('RadLab') && file.includes('radiation_readings'))

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
      <p className="opacity-75">Historical NASA data</p>
      {series.map((s) => {
        const v = row[s.key]
        return (
          <div key={s.key} className="mt-1.5">
            <p><span style={{ color: s.color }}>●</span> {s.name}: <b>{typeof v === 'number' ? `${fmtNum(v, Math.abs(v) < 10 ? 2 : 1)} ${unit}` : 'no sample'}</b></p>
            {typeof v === 'number' && <p className="opacity-75">min {fmtNum(row[`${s.key}_min`] as number, 2)} · max {fmtNum(row[`${s.key}_max`] as number, 2)} · n={row[`${s.key}_n`]}</p>}
          </div>
        )
      })}
    </div>
  )
}
