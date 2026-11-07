import { ArrowRight } from 'lucide-react'
import { HeartRateChart } from '../components/charts/HeartRateChart'
import { MetricTile, SimBadge, StatusBadge } from '../components/ui/primitives'
import { fallbackOverview, fallbackTrends } from '../api/fallback'
import { diff, fmtDateTime } from '../lib/format'
import { APP_URL } from './LandingHeader'
import { useReveal } from './useReveal'

/**
 * Renders the app's real components with the bundled sample data (no network).
 * It is a static snapshot: the label says so, and the button opens the live app.
 */
export function ProductPreview() {
  const ref = useReveal<HTMLDivElement>()
  const ov = fallbackOverview('AST-001')
  const tr = fallbackTrends('AST-001', 7)
  const { latest, baseline, assessment } = ov
  const spark = (k: 'resting_heart_rate_bpm' | 'sleep_hours') => tr.points.map((p) => p[k])

  return (
    <section id="preview" className="relative border-t border-hair bg-panel py-24 sm:py-32" aria-labelledby="preview-title">
      <div className="mx-auto w-full max-w-[1200px] px-6 sm:px-10">
        <p className="text-[11px] font-medium uppercase tracking-[.28em] text-cyan">Product preview</p>
        <h2 id="preview-title" className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">The mission overview, as the crew sees it.</h2>
        <p className="mt-4 max-w-2xl text-sm text-ink-dim">Static snapshot built from the app’s own components and simulated sample data. Open the dashboard to use the live version.</p>

        
          <div ref={ref} className="reveal mt-10 border border-ink/20 bg-space p-4 sm:p-6" role="group" aria-label="Static preview of the mission overview, simulated data">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={assessment!.status} large />
              <SimBadge label="Simulated sample" />
              <span className="ml-auto text-xs text-ink-dim">Assessed {fmtDateTime(assessment!.created_at)}</span>
            </div>
            <p className="mt-3 text-lg font-semibold">{ov.astronaut.name}: {assessment!.title}</p>
            <p className="mt-1 max-w-2xl text-sm text-ink-dim">{assessment!.summary}</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <MetricTile label="Resting heart rate" unit="bpm" value={latest!.resting_heart_rate_bpm} baseline={baseline!.resting_heart_rate_bpm} delta={diff(latest!.resting_heart_rate_bpm, baseline!.resting_heart_rate_bpm)} spark={spark('resting_heart_rate_bpm')} />
              <MetricTile label="Sleep" unit="h" digits={1} value={latest!.sleep_hours} baseline={baseline!.sleep_hours} delta={diff(latest!.sleep_hours, baseline!.sleep_hours, 1)} spark={spark('sleep_hours')} />
            </div>
            <div className="mt-4"><HeartRateChart points={tr.points} baseline={baseline!.resting_heart_rate_bpm} /></div>
          </div>
        

        <div className="mt-8">
          <a href={APP_URL} className="l-btn l-btn-ghost">Open the live dashboard <ArrowRight className="h-4 w-4" aria-hidden /></a>
        </div>
      </div>
    </section>
  )
}
