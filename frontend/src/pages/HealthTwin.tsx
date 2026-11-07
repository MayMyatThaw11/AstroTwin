import { useState } from 'react'
import { api } from '../api/client'
import { useApp } from '../app/AppContext'
import { BodyZoneMap, ZONES, type Zone } from '../components/health-twin/BodyZoneMap'
import { ZoneDetailPanel } from '../components/health-twin/ZoneDetailPanel'
import { ErrorState, InfoBanner, LoadingState, PageHeader } from '../components/ui/primitives'
import { useAsync } from '../lib/useAsync'

export function HealthTwin() {
  const { selectedId, selected, version } = useApp()
  const [zone, setZone] = useState<Zone>('cardio')
  const tr = useAsync(() => (selectedId ? api.trends(selectedId, 7) : Promise.reject(new Error('none'))), [selectedId, version])
  const ov = useAsync(() => (selectedId ? api.overview(selectedId) : Promise.reject(new Error('none'))), [selectedId, version])

  return (
    <div className="space-y-5">
      <PageHeader title="My health twin" sub={selected ? `${selected.name} · choose a body zone to explore` : undefined} />
      <InfoBanner>Educational view, not a medical scan. Zones group the measured and self-reported data available for this crew member.</InfoBanner>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
        <div className="card lg:sticky lg:top-32 lg:self-start">
          <BodyZoneMap zone={zone} onSelect={setZone} />
          <div role="group" aria-label="Body zones" className="mt-4 grid grid-cols-2 gap-2">
            {ZONES.map((z) => (
              <button key={z.id} onClick={() => setZone(z.id)} aria-pressed={zone === z.id}
                className={`min-h-[44px] rounded-lg border px-2 text-sm font-medium transition-colors ${zone === z.id ? 'border-cyan bg-cyan/10 text-cyan' : 'border-hair text-ink-dim hover:bg-panel2 hover:text-ink'}`}>
                {z.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          {tr.loading || ov.loading ? <LoadingState />
            : tr.error || !tr.data ? <ErrorState message={tr.error?.message ?? 'No data.'} onRetry={tr.reload} />
            : ov.error || !ov.data ? <ErrorState message={ov.error?.message ?? 'No data.'} onRetry={ov.reload} />
            : <ZoneDetailPanel zone={zone} ov={ov.data} points={tr.data.points} />}
        </div>
      </div>
    </div>
  )
}
