import type { ReactNode } from 'react'
import { TrendChart } from '../charts/TrendChart'
import { StatusBadge } from '../ui/primitives'
import { diff, fmtNum } from '../../lib/format'
import type { Overview, TrendPoint } from '../../types/api'
import type { Zone } from './BodyZoneMap'

function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-lg bg-panel2 p-3">
      <p className="card-title">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}{unit && <span className="ml-1 text-sm font-medium text-ink-dim">{unit}</span>}</p>
      {note && <p className="mt-0.5 text-xs text-ink-dim">{note}</p>}
    </div>
  )
}

function Meaning({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-hair p-3 text-sm">
      <p className="card-title mb-1">What this means</p>
      <p className="text-ink-dim">{children}</p>
    </div>
  )
}

export function ZoneDetailPanel({ zone, ov, points }: { zone: Zone; ov: Overview; points: TrendPoint[] }) {
  const { latest, baseline, assessment } = ov
  const base = (k: keyof NonNullable<Overview['baseline']>) => baseline?.[k] ?? null

  let title = '', lead = '', body: ReactNode

  if (zone === 'cardio') {
    title = 'Cardiovascular'; lead = 'Resting heart rate against your own baseline.'
    body = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Latest resting HR" value={fmtNum(latest?.resting_heart_rate_bpm)} unit="bpm" note={diff(latest?.resting_heart_rate_bpm, base('resting_heart_rate_bpm')) ? `${diff(latest?.resting_heart_rate_bpm, base('resting_heart_rate_bpm'))} bpm vs baseline` : 'Baseline not available'} />
          <Stat label="Baseline" value={fmtNum(base('resting_heart_rate_bpm'))} unit="bpm" />
        </div>
        <TrendChart title="Resting heart rate" unit="bpm" dataKey="resting_heart_rate_bpm" points={points} color="hr" baseline={base('resting_heart_rate_bpm')} />
        <Meaning>Heart rate that stays above your own baseline can reflect poor sleep, stress or workload. Blood pressure is not part of this data set, so it is not shown.</Meaning>
      </>
    )
  } else if (zone === 'cognition') {
    title = 'Sleep & cognition'; lead = 'Sleep, stress and mood from daily check-ins.'
    body = (
      <>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Sleep" value={fmtNum(latest?.sleep_hours, 1)} unit="h" />
          <Stat label="Stress" value={fmtNum(latest?.stress_score)} unit="/10" />
          <Stat label="Mood" value={fmtNum(latest?.mood_score)} unit="/5" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TrendChart title="Sleep" unit="h" dataKey="sleep_hours" points={points} color="sleep" digits={1} baseline={base('sleep_hours')} />
          <TrendChart title="Stress (self-report)" unit="0–10" dataKey="stress_score" points={points} color="stress" domain={[0, 10]} baseline={base('stress_score')} />
        </div>
        <Meaning>Short sleep and high stress often move together. There is no direct cognitive test here; these are self-reported signals only.</Meaning>
      </>
    )
  } else if (zone === 'wellness') {
    title = 'General wellness'; lead = 'Whole-body signals: temperature and fatigue.'
    body = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Temperature" value={fmtNum(latest?.temperature_c, 1)} unit="°C" note={diff(latest?.temperature_c, base('temperature_c'), 1) ? `${diff(latest?.temperature_c, base('temperature_c'), 1)} °C vs baseline` : undefined} />
          <Stat label="Fatigue" value={fmtNum(latest?.fatigue_score)} unit="/10" />
        </div>
        <TrendChart title="Temperature" unit="°C" dataKey="temperature_c" points={points} color="temp" digits={1} baseline={base('temperature_c')} />
        <Meaning>Temperature and fatigue give a broad picture of how you feel today. Compare with your own recent readings rather than a generic range.</Meaning>
      </>
    )
  } else {
    title = 'Musculoskeletal'; lead = 'Strength and bone health are not measured directly.'
    body = (
      <>
        <p className="rounded-lg bg-panel2 p-3 text-sm font-semibold">No direct bone/muscle measurement available</p>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Fatigue" value={fmtNum(latest?.fatigue_score)} unit="/10" />
          <Stat label="Pain" value={fmtNum(latest?.pain_score)} unit="/10" />
        </div>
        <Meaning>Only self-reported fatigue and pain are shown. Whether you completed your exercise countermeasures is recorded at each check-in, but its history isn't available in this view yet.</Meaning>
      </>
    )
  }

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <StatusBadge status={assessment?.status ?? 'insufficient_data'} />
        </div>
        <p className="mt-1 text-sm text-ink-dim">{lead}</p>
        {assessment && <p className="mt-2 text-sm"><span className="font-semibold">Overall: </span>{assessment.summary}</p>}
      </div>
      {body}
    </div>
  )
}
