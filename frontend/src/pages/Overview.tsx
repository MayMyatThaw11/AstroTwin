import { BedDouble, BrainCircuit, ClipboardPlus, FileText, HeartPulse, Thermometer, Zap } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../app/AppContext'
import { AssessmentCard } from '../components/ui/AssessmentCard'
import { EmptyState, ErrorState, LoadingState, MetricTile, SectionHeader, SimBadge, StatusBadge, statusColor } from '../components/ui/primitives'
import { HeartRateChart } from '../components/charts/HeartRateChart'
import { SleepChart } from '../components/charts/SleepChart'
import { diff, fmtDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { TrendPoint } from '../types/api'

type Num = 'resting_heart_rate_bpm' | 'sleep_hours' | 'temperature_c' | 'stress_score'
const series = (pts: TrendPoint[] | undefined, k: Num) => pts?.map((p) => p[k])

export function Overview() {
  const { selectedId, version, go, astronautsError, recheck } = useApp()
  const ov = useAsync(() => (selectedId ? api.overview(selectedId) : Promise.reject(new Error('none'))), [selectedId, version])
  const tr = useAsync(() => (selectedId ? api.trends(selectedId, 7) : Promise.reject(new Error('none'))), [selectedId, version])

  if (astronautsError) return <ErrorState message={astronautsError} onRetry={recheck} />
  if (!selectedId || ov.loading) return <LoadingState label="Loading mission overview…" />
  if (ov.error || !ov.data) return <ErrorState message={ov.error?.message ?? 'No data.'} onRetry={ov.reload} />

  const { astronaut, latest, baseline, assessment, source_label } = ov.data
  const status = assessment?.status ?? 'insufficient_data'
  const pts = tr.data?.points
  const needsReview = assessment && (assessment.status === 'review' || assessment.status === 'escalate')

  return (
    <div className="space-y-8">
      <div className="pt-2">
        <span className="block h-1 w-12 rounded bg-cyan" aria-hidden />
        <h1 className="mt-5 font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{astronaut.name}</h1>
        <p className="mt-2 text-base tracking-wide text-ink-dim">{astronaut.mission} · Day {astronaut.mission_day} · {astronaut.role}</p>
      </div>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_1fr]" aria-label="Status">
        <div className="card fade-in !p-6" style={{ borderLeft: `3px solid ${statusColor(status)}`, backgroundImage: `linear-gradient(135deg, ${statusColor(status, 0.14)}, transparent 70%)` }}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} large />
            <SimBadge label={source_label} />
            {assessment && <span className="ml-auto text-xs text-ink-dim">Assessed {fmtDateTime(assessment.created_at)}</span>}
          </div>
          {assessment ? (
            <>
              <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">{assessment.title}</h2>
              <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-dim">{assessment.summary}</p>
            </>
          ) : (
            <p className="mt-4 text-ink-dim">No assessment yet. Complete a daily check-in to get started.</p>
          )}
        </div>
        <div className="card flex flex-col justify-between !border-cyan/25 !bg-cyan/[.07] !p-6">
          <div>
            <p className="card-title !text-cyan !tracking-[.16em]">Next recommended action</p>
            <p className="mt-3 text-[15px] leading-relaxed">{assessment?.next_action ?? 'Complete today’s check-in.'}</p>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <button className="btn-primary flex-1" onClick={() => go('checkin')}><ClipboardPlus className="h-4 w-4" aria-hidden /> Daily check-in</button>
            <button className="btn-ghost flex-1" onClick={() => go('alerts')}><FileText className="h-4 w-4" aria-hidden /> Summary</button>
          </div>
        </div>
      </section>

      {!latest && <EmptyState title="No measurements yet" body="A few daily check-ins are needed before trends and baselines can be shown." />}

      <section aria-label="Latest measurements">
        <SectionHeader title="Latest measurements" sub="Compared with your own recent baseline" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <MetricTile icon={HeartPulse} label="Resting heart rate" unit="bpm" value={latest?.resting_heart_rate_bpm} baseline={baseline?.resting_heart_rate_bpm} delta={diff(latest?.resting_heart_rate_bpm, baseline?.resting_heart_rate_bpm)} spark={series(pts, 'resting_heart_rate_bpm')} />
          <MetricTile icon={BedDouble} label="Sleep" unit="h" digits={1} value={latest?.sleep_hours} baseline={baseline?.sleep_hours} delta={diff(latest?.sleep_hours, baseline?.sleep_hours, 1)} spark={series(pts, 'sleep_hours')} />
          <MetricTile icon={Thermometer} label="Temperature" unit="°C" digits={1} value={latest?.temperature_c} baseline={baseline?.temperature_c} delta={diff(latest?.temperature_c, baseline?.temperature_c, 1)} spark={series(pts, 'temperature_c')} />
          <MetricTile icon={Zap} label="Stress" unit="/ 10" value={latest?.stress_score} baseline={baseline?.stress_score} delta={diff(latest?.stress_score, baseline?.stress_score)} spark={series(pts, 'stress_score')} />
          <MetricTile icon={BrainCircuit} label="Fatigue" unit="/ 10" value={latest?.fatigue_score} spark={undefined} />
        </div>
      </section>

      <section aria-label="Seven day trends">
        <SectionHeader title="Last 7 days" right={<button className="text-sm font-medium text-cyan hover:underline" onClick={() => go('trends')}>All trends</button>} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {tr.loading ? <LoadingState label="Loading trends…" />
            : tr.error || !tr.data ? <div className="lg:col-span-2"><ErrorState message={tr.error?.message ?? 'No trend data.'} onRetry={tr.reload} /></div>
            : <>
                <HeartRateChart points={tr.data.points} baseline={baseline?.resting_heart_rate_bpm} />
                <SleepChart points={tr.data.points} baseline={baseline?.sleep_hours} />
              </>}
        </div>
      </section>

      <section aria-label="Active alerts">
        <SectionHeader title="Active alerts" />
        {needsReview && assessment ? <AssessmentCard a={assessment} /> : <p className="card text-sm text-ink-dim">No concerning pattern detected in the latest assessment.</p>}
      </section>
    </div>
  )
}
