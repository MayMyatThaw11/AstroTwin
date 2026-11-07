import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ClipboardPlus, Droplets, Gauge, HeartPulse, Pause, Play, Plus, RotateCcw, Wind, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../app/AppContext'
import { HealthChart } from '../components/health/HealthChart'
import { MeasurementDialog } from '../components/health/MeasurementDialog'
import { InfoBanner, PageHeader, SectionHeader, SimBadge, StatusBadge } from '../components/ui/primitives'
import { METRICS, fmtValue } from '../health/metrics'
import { addObservations, adapter, baselineFor, dailyRows, latestOf, resetDemo, useObservations, useStorageOk, type Row } from '../health/service'
import { SOURCE_LABEL, type Metric, type Observation } from '../health/types'
import { useAsync } from '../lib/useAsync'

const STREAM_MS = 4000
const localTime = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function SourceLine({ o }: { o: Observation | null }) {
  if (!o) return <p className="mt-2 text-xs text-ink-dim">No readings yet</p>
  return <p className="mt-2 text-xs text-ink-dim">{SOURCE_LABEL[o.source]} · {localTime(o.measuredAt)}</p>
}

function ReadingCard({ icon: Icon, label, value, unit, sub, o }: { icon: LucideIcon; label: string; value: string; unit: string; sub?: string; o: Observation | null }) {
  return (
    <div className="card flex items-start gap-4 rounded-[18px] !p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Icon className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="card-title !tracking-[.14em]">{label}</p>
        <p className="mt-1 flex items-baseline gap-1.5 font-display text-3xl font-semibold leading-none tabular-nums tracking-tight">
          {value}{value !== '—' && <span className="text-sm font-medium text-ink-dim">{unit}</span>}
        </p>
        {sub && <p className="mt-2 text-xs text-ink-dim">{sub}</p>}
        <SourceLine o={o} />
      </div>
    </div>
  )
}

function deltaText(metric: Metric, latest: Observation | null, base: number | null | undefined): string | undefined {
  if (!latest) return undefined
  if (base == null) return 'Baseline unavailable — insufficient observations'
  const d = latest.value - base
  const def = METRICS[metric]
  return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(def.digits)} ${def.unit} vs personal reference ${fmtValue(metric, base)}`
}

export function Monitoring() {
  const { selectedId, selected, go, version } = useApp()
  const obs = useObservations(selectedId)
  const storageOk = useStorageOk()
  const ov = useAsync(() => (selectedId ? api.overview(selectedId) : Promise.reject(new Error('none'))), [selectedId, version])
  const [dialog, setDialog] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [ctx, setCtx] = useState<'sleep_hours' | 'spo2_pct' | 'hrv_ms' | 'stress_score'>('sleep_hours')

  // --- simulated wearable: one interval, always cleaned up ---
  const hr = useRef(72)
  const tick = useRef(0)
  const seed = useRef(12345)
  const rand = () => { seed.current = (Math.imul(seed.current, 1664525) + 1013904223) >>> 0; return seed.current / 4294967296 * 2 - 1 }

  useEffect(() => {
    if (!running || !selectedId) return
    const emit = () => {
      tick.current += 1
      hr.current = Math.max(40, Math.min(180, hr.current + (start.current - hr.current) * 0.1 + rand() * 1.4))
      const at = new Date().toISOString()
      const base = { astronautId: selectedId, measuredAt: at, source: 'simulated_wearable' as const }
      const items: Omit<Observation, 'id'>[] = [
        { ...base, metric: 'heart_rate_bpm', value: Math.round(hr.current), unit: 'bpm' },
        { ...base, metric: 'spo2_pct', value: Math.round(Math.min(100, 97.5 + rand() * 0.9)), unit: '%' },
      ]
      if (tick.current % 5 === 0) items.push({ ...base, metric: 'temperature_c', value: Math.round((36.6 + rand() * 0.1) * 10) / 10, unit: '°C' })
      addObservations(items)
    }
    const start = { current: hr.current }
    const last = latestOf(adapter.list(selectedId), 'heart_rate_bpm')
    if (last) { hr.current = last.value; start.current = last.value }
    emit()
    const id = window.setInterval(emit, STREAM_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, selectedId])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  const latest = (m: Metric) => latestOf(obs, m)
  const hrBase = useMemo(() => baselineFor(obs, 'heart_rate_bpm'), [obs])
  const lastAny = obs.length ? obs[obs.length - 1] : null

  const hrRows: Row[] = useMemo(
    () => obs.filter((o) => o.metric === 'heart_rate_bpm').slice(-60).map((o) => ({
      date: o.measuredAt, heart_rate_bpm: o.value, heart_rate_bpm_n: 1, heart_rate_bpm_src: SOURCE_LABEL[o.source],
    })),
    [obs],
  )
  const ctxRows = useMemo(() => dailyRows(obs, [ctx], 7), [obs, ctx])
  const hasHrv = obs.some((o) => o.metric === 'hrv_ms')

  const a = ov.data?.assessment
  const bp = [latest('systolic_bp_mmhg'), latest('diastolic_bp_mmhg')]

  if (!selected) return <PageHeader title="Health monitoring" sub="Select an astronaut first." />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Health monitoring"
        sub={`${selected.name} · ${adapter.label}`}
        right={<button className="btn-primary" onClick={() => setDialog(true)}><Plus className="h-4 w-4" aria-hidden /> Manual entry</button>}
      />

      {toast && <div role="status" className="rounded-lg border px-4 py-2.5 text-sm font-medium" style={{ borderColor: 'rgb(var(--st-stable) / .5)', background: 'rgb(var(--st-stable) / .1)' }}>{toast}</div>}
      {!storageOk && <InfoBanner tone="warn">Browser storage is unavailable, so new entries will be lost when you reload.</InfoBanner>}

      <div className="card flex flex-wrap items-center gap-3 !py-3">
        <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${running ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-hair text-ink-dim'}`}>
          <span className={`h-2 w-2 rounded-full ${running ? 'bg-cyan' : 'bg-ink-dim/50'}`} aria-hidden />
          {running ? 'Simulated stream running' : 'Simulated stream off'}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Simulated · not a real sensor</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setRunning((r) => !r)} aria-pressed={running}>
            {running ? <><Pause className="h-4 w-4" aria-hidden /> Pause</> : <><Play className="h-4 w-4" aria-hidden /> Start demo stream</>}
          </button>
          <button className="btn-ghost" onClick={() => { if (window.confirm('Remove all manual and simulated entries for this astronaut?')) { setRunning(false); resetDemo(selected.id); setToast('Demo entries removed for this astronaut.') } }}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset demo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <section className="card relative overflow-hidden !p-6 md:col-span-2 xl:row-span-2" aria-label="Health at a glance">
          <svg className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 text-cyan opacity-20" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
            <circle cx="100" cy="100" r="30" /><circle cx="100" cy="100" r="55" /><circle cx="100" cy="100" r="80" strokeDasharray="3 5" />
            <circle cx="180" cy="100" r="4" fill="currentColor" />
          </svg>
          <p className="card-title !text-cyan">Your health at a glance</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">{selected.name}</h2>
          <p className="mt-1 text-sm text-ink-dim">{selected.role} · {selected.mission} · Day {selected.mission_day}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {a ? <StatusBadge status={a.status} large /> : <SimBadge label="Assessment loading" />}
            {ov.data && <SimBadge label={ov.data.source_label} />}
          </div>
          {a && (
            <div className="mt-4 max-w-xl">
              <p className="font-semibold">{a.title}</p>
              <p className="mt-1 text-sm text-ink-dim">{a.summary}</p>
              <p className="mt-3 text-sm"><span className="font-semibold text-cyan">Next: </span>{a.next_action}</p>
            </div>
          )}
          <p className="mt-5 text-xs text-ink-dim">Last measurement: {lastAny ? `${localTime(lastAny.measuredAt)} · ${SOURCE_LABEL[lastAny.source]}` : 'none yet'}</p>
          <button className="btn-primary mt-5" onClick={() => go('checkin')}><ClipboardPlus className="h-4 w-4" aria-hidden /> Start daily check-in</button>
        </section>

        <ReadingCard icon={HeartPulse} label="Heart rate" value={fmtValue('heart_rate_bpm', latest('heart_rate_bpm')?.value)} unit="bpm" sub={deltaText('heart_rate_bpm', latest('heart_rate_bpm'), hrBase?.value)} o={latest('heart_rate_bpm')} />
        <ReadingCard icon={Wind} label="SpO₂" value={fmtValue('spo2_pct', latest('spo2_pct')?.value)} unit="%" o={latest('spo2_pct')} />
        <ReadingCard icon={Zap} label="Stress (self-report)" value={fmtValue('stress_score', latest('stress_score')?.value)} unit="/ 10" sub={latest('fatigue_score') ? `Fatigue ${fmtValue('fatigue_score', latest('fatigue_score')?.value)} / 10` : undefined} o={latest('stress_score')} />
        <ReadingCard icon={Gauge} label="Blood pressure" value={bp[0] && bp[1] ? `${fmtValue('systolic_bp_mmhg', bp[0].value)} / ${fmtValue('diastolic_bp_mmhg', bp[1].value)}` : '—'} unit="mmHg" o={bp[0]} />

        <section className="card md:col-span-2" aria-label="Heart rate readings">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="card-title">Heart rate · recent readings</h3>
            <span className="text-xs text-ink-dim">bpm · last {hrRows.length}</span>
          </div>
          <p className="mb-2 text-xs text-ink-dim">Readings are shown in order, not to time scale. Dashed line: personal reference.</p>
          <HealthChart rows={hrRows} metrics={['heart_rate_bpm']} baselines={{ heart_rate_bpm: hrBase }} xFormat={localTime} height={240} />
        </section>

        <section className="card md:col-span-2" aria-label="Context chart">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="card-title">Last 7 days</h3>
            <div role="group" aria-label="Metric" className="flex rounded-lg border border-hair p-0.5">
              {([['sleep_hours', 'Sleep'], ['spo2_pct', 'SpO₂'], ['hrv_ms', 'HRV'], ['stress_score', 'Stress']] as const).map(([m, l]) => (
                <button key={m} onClick={() => setCtx(m)} aria-pressed={ctx === m} className={`min-h-[36px] rounded-md px-3 text-xs font-semibold ${ctx === m ? 'bg-cyan text-on-accent' : 'text-ink-dim hover:text-ink'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            {ctx === 'hrv_ms' && !hasHrv
              ? <div className="flex h-48 items-center justify-center text-center text-sm text-ink-dim">No HRV readings for this astronaut. Add one with Manual entry.</div>
              : <HealthChart rows={ctxRows} metrics={[ctx]} baselines={{ [ctx]: baselineFor(obs, ctx) }} height={240} />}
          </div>
        </section>

        <section className="md:col-span-2 xl:col-span-4" aria-label="All measurements">
          <SectionHeader title="All measurements" sub="Latest value per metric, with source and time" />
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-5">
            {([['temperature_c', Activity], ['sleep_hours', Activity], ['glucose_mg_dl', Droplets], ['hrv_ms', HeartPulse], ['fatigue_score', Zap]] as [Metric, LucideIcon][]).map(([m]) => {
              const o = latest(m)
              const d = METRICS[m]
              return (
                <div key={m} className="card !p-4">
                  <p className="card-title">{d.label}</p>
                  <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{fmtValue(m, o?.value)}{o && <span className="ml-1 text-sm font-medium text-ink-dim">{d.unit}</span>}</p>
                  {o ? <SourceLine o={o} /> : <p className="mt-2 text-xs text-ink-dim">{m === 'hrv_ms' ? 'No HRV readings' : 'Not measured'}</p>}
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {dialog && <MeasurementDialog astronautId={selected.id} onClose={() => setDialog(false)} onSaved={setToast} />}
    </div>
  )
}
