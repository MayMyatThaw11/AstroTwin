import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../app/AppContext'
import { HealthChart } from '../components/health/HealthChart'
import { AssessmentCard } from '../components/ui/AssessmentCard'
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionHeader } from '../components/ui/primitives'
import { METRICS, TREND_VIEWS, fmtValue } from '../health/metrics'
import { adapter, baselineFor, dailyRows, explainTrend, latestOf, toCsv, useObservations } from '../health/service'
import { useAsync } from '../lib/useAsync'

export function Trends() {
  const { selectedId, selected, version } = useApp()
  const [days, setDays] = useState<7 | 30>(7)
  const [viewId, setViewId] = useState('hr')
  const obs = useObservations(selectedId)
  const ov = useAsync(() => (selectedId ? api.overview(selectedId) : Promise.reject(new Error('none'))), [selectedId, version])
  const al = useAsync(() => (selectedId ? api.alerts(selectedId) : Promise.reject(new Error('none'))), [selectedId, version])

  const view = TREND_VIEWS.find((v) => v.id === viewId) ?? TREND_VIEWS[0]
  const rows = useMemo(() => dailyRows(obs, view.metrics, days), [obs, view, days])
  const baselines = useMemo(() => Object.fromEntries(view.metrics.map((m) => [m, baselineFor(obs, m)])), [obs, view])
  const explain = useMemo(() => explainTrend(obs, view.metrics[0]), [obs, view])
  const inWindow = useMemo(() => {
    const cutoff = Date.now() - days * 86_400_000
    return obs.filter((o) => new Date(o.measuredAt).getTime() >= cutoff)
  }, [obs, days])

  function exportCsv() {
    const blob = new Blob([toCsv(inWindow)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `astrotwin-${selectedId}-${days}d.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health history & trends"
        sub={selected ? `${selected.name} · ${adapter.label} · gaps mean nothing was measured` : undefined}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Period" className="flex rounded-lg border border-hair bg-panel p-1">
              {([7, 30] as const).map((d) => (
                <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}
                  className={`min-h-[40px] rounded-md px-4 text-sm font-semibold ${days === d ? 'bg-cyan text-on-accent' : 'text-ink-dim hover:text-ink'}`}>{d} days</button>
              ))}
            </div>
            <button className="btn-ghost" onClick={exportCsv} disabled={!inWindow.length}><Download className="h-4 w-4" aria-hidden /> CSV</button>
          </div>
        }
      />

      <div role="tablist" aria-label="Metric" className="flex flex-wrap gap-2">
        {TREND_VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={v.id === viewId} onClick={() => setViewId(v.id)}
            className={`min-h-[40px] rounded-full border px-4 text-sm font-medium transition-colors ${v.id === viewId ? 'border-cyan bg-cyan/10 text-cyan' : 'border-hair text-ink-dim hover:bg-panel2 hover:text-ink'}`}>{v.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="card" aria-label={`${view.label} trend`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{view.label}</h2>
            <span className="text-xs text-ink-dim">{view.metrics.map((m) => METRICS[m].unit).filter((u, i, a) => a.indexOf(u) === i).join(' ')} · daily median · dashed line: personal reference</span>
          </div>
          <div className="mt-3">
            <HealthChart rows={rows} metrics={view.metrics} baselines={baselines} height={300} />
          </div>
          {view.id === 'hrv' && !obs.some((o) => o.metric === 'hrv_ms') && (
            <p className="mt-2 text-sm text-ink-dim">No HRV readings for this astronaut yet. Add one on the Health monitoring page.</p>
          )}
        </section>

        <section className="card space-y-4" aria-label="Trend explanation">
          <p className="card-title">What the data shows</p>
          <h3 className="font-display text-lg font-semibold leading-snug">{explain.headline}</h3>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs font-semibold uppercase tracking-wider text-ink-dim">What changed</dt><dd className="mt-0.5">{explain.whatChanged}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wider text-ink-dim">For how long</dt><dd className="mt-0.5">{explain.forHowLong}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Compared with</dt><dd className="mt-0.5">{explain.comparedWith}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Suggested next action</dt>
              <dd className="mt-0.5">{ov.data?.assessment?.next_action ?? 'Keep logging daily readings. Follow approved crew medical guidance if you have concerns.'}</dd></div>
          </dl>
          <p className="text-xs text-ink-dim">Descriptive only: this compares your readings with your own history and is not a diagnosis.</p>
        </section>
      </div>

      <section aria-label="All metrics">
        <SectionHeader title="All metrics" sub={`${days}-day overview. Select a card to focus it.`} />
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {TREND_VIEWS.map((v) => {
            const m = v.metrics[0]
            const last = latestOf(obs, m)
            const n = inWindow.filter((o) => o.metric === m).length
            const d = METRICS[m]
            return (
              <button key={v.id} onClick={() => { setViewId(v.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                className={`card text-left transition-colors hover:bg-panel2 ${v.id === viewId ? '!border-cyan/60' : ''}`}>
                <p className="card-title">{v.label}</p>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
                  {v.id === 'bp' ? `${fmtValue('systolic_bp_mmhg', latestOf(obs, 'systolic_bp_mmhg')?.value)}/${fmtValue('diastolic_bp_mmhg', latestOf(obs, 'diastolic_bp_mmhg')?.value)}` : fmtValue(m, last?.value)}
                  {last && <span className="ml-1 text-sm font-medium text-ink-dim">{d.unit}</span>}
                </p>
                <p className="mt-1 text-xs text-ink-dim">{n} reading{n === 1 ? '' : 's'} in {days} days</p>
              </button>
            )
          })}
        </div>
      </section>

      <section aria-label="Status events">
        <SectionHeader title="Recent status events" sub="From the current assessment" />
        {al.loading ? <LoadingState />
          : al.error || !al.data ? <ErrorState message={al.error?.message ?? 'No data.'} onRetry={al.reload} />
          : al.data.items.length === 0 ? <EmptyState title="No status events" body="No alerts have been recorded for this astronaut." />
          : <ol className="space-y-3 border-l border-hair pl-4">{al.data.items.map((a) => <li key={a.id}><AssessmentCard a={a} /></li>)}</ol>}
      </section>
    </div>
  )
}
