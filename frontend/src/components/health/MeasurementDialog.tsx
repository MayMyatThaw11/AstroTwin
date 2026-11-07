import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { METRICS } from '../../health/metrics'
import { addObservations } from '../../health/service'
import type { Metric, Observation } from '../../health/types'

type Kind = 'hr' | 'bp' | 'spo2' | 'temp' | 'sleep' | 'glucose' | 'hrv' | 'stress' | 'fatigue'
const KINDS: { id: Kind; label: string; metrics: Metric[] }[] = [
  { id: 'hr', label: 'Heart rate (bpm)', metrics: ['heart_rate_bpm'] },
  { id: 'bp', label: 'Blood pressure (mmHg)', metrics: ['systolic_bp_mmhg', 'diastolic_bp_mmhg'] },
  { id: 'spo2', label: 'SpO₂ (%)', metrics: ['spo2_pct'] },
  { id: 'temp', label: 'Body temperature (°C)', metrics: ['temperature_c'] },
  { id: 'sleep', label: 'Sleep (hours)', metrics: ['sleep_hours'] },
  { id: 'glucose', label: 'Blood glucose (mg/dL)', metrics: ['glucose_mg_dl'] },
  { id: 'hrv', label: 'HRV (ms)', metrics: ['hrv_ms'] },
  { id: 'stress', label: 'Stress (0–10)', metrics: ['stress_score'] },
  { id: 'fatigue', label: 'Fatigue (0–10)', metrics: ['fatigue_score'] },
]

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

interface Props { astronautId: string; onClose: () => void; onSaved: (message: string) => void }

export function MeasurementDialog({ astronautId, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<Kind>('hr')
  const [v1, setV1] = useState('')
  const [v2, setV2] = useState('')
  const [when, setWhen] = useState(() => toLocalInput(new Date()))
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const first = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const def = KINDS.find((k) => k.id === kind)!
  const isBp = kind === 'bp'

  function check(raw: string, metric: Metric, label: string): { v?: number; e?: string } {
    if (raw.trim() === '') return { e: `${label}: enter a value.` }
    const v = Number(raw)
    if (!Number.isFinite(v)) return { e: `${label}: enter a number.` }
    const m = METRICS[metric]
    if (v < m.min || v > m.max) return { e: `${label}: must be between ${m.min} and ${m.max} ${m.unit} (entry check, not a medical limit).` }
    return { v }
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const errs: string[] = []
    const a = check(v1, def.metrics[0], isBp ? 'Systolic' : def.label)
    if (a.e) errs.push(a.e)
    const b = isBp ? check(v2, 'diastolic_bp_mmhg', 'Diastolic') : {}
    if (b.e) errs.push(b.e)
    if (isBp && a.v != null && b.v != null && b.v >= a.v) errs.push('Diastolic must be lower than systolic.')
    const t = new Date(when)
    if (!when || Number.isNaN(t.getTime())) errs.push('Enter a valid date and time.')
    else if (t.getTime() > Date.now() + 60_000) errs.push('Measurement time cannot be in the future.')
    setErrors(errs)
    if (errs.length) return

    const sessionId = isBp ? `BP-${Date.now().toString(36)}` : undefined
    const base = { astronautId, measuredAt: t.toISOString(), source: 'manual' as const, notes: notes.trim() || undefined, sessionId }
    const items: Omit<Observation, 'id'>[] = [{ ...base, metric: def.metrics[0], value: a.v!, unit: METRICS[def.metrics[0]].unit }]
    if (isBp) items.push({ ...base, metric: 'diastolic_bp_mmhg', value: b.v!, unit: 'mmHg' })
    addObservations(items)
    onSaved('Saved locally (demo mode). Charts and cards have been updated.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={save} noValidate role="dialog" aria-modal="true" aria-labelledby="md-title"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-hair bg-panel p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="md-title" className="font-display text-lg font-semibold">Manual entry</h2>
            <p className="text-xs text-ink-dim">Saved in this browser as local demo data. Not sent anywhere.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-dim hover:bg-panel2" aria-label="Close"><X className="h-5 w-5" aria-hidden /></button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="md-kind" className="mb-1 block text-sm font-medium">Measurement</label>
            <select id="md-kind" ref={first} className="field" value={kind} onChange={(e) => { setKind(e.target.value as Kind); setV1(''); setV2(''); setErrors([]) }}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>
          <div className={isBp ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <label htmlFor="md-v1" className="mb-1 block text-sm font-medium">{isBp ? 'Systolic' : 'Value'} <span className="text-ink-dim">({METRICS[def.metrics[0]].unit})</span></label>
              <input id="md-v1" className="field" type="number" inputMode="decimal" step="any" value={v1} onChange={(e) => setV1(e.target.value)} />
            </div>
            {isBp && (
              <div>
                <label htmlFor="md-v2" className="mb-1 block text-sm font-medium">Diastolic <span className="text-ink-dim">(mmHg)</span></label>
                <input id="md-v2" className="field" type="number" inputMode="decimal" step="any" value={v2} onChange={(e) => setV2(e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <label htmlFor="md-when" className="mb-1 block text-sm font-medium">Measured at</label>
            <input id="md-when" className="field" type="datetime-local" value={when} max={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div>
            <label htmlFor="md-notes" className="mb-1 block text-sm font-medium">Notes (optional)</label>
            <textarea id="md-notes" className="field py-2" rows={2} maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {errors.length > 0 && (
          <ul role="alert" className="mt-4 list-disc space-y-1 pl-5 text-sm" style={{ color: 'rgb(var(--st-escalate))' }}>
            {errors.map((er) => <li key={er}>{er}</li>)}
          </ul>
        )}

        <div className="mt-5 flex gap-3">
          <button type="submit" className="btn-primary flex-1">Save measurement</button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
