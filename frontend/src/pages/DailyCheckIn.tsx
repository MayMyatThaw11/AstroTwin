import { useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Send } from 'lucide-react'
import { api, ApiError } from '../api/client'
import { useApp } from '../app/AppContext'
import { AssessmentCard } from '../components/ui/AssessmentCard'
import { InfoBanner, PageHeader, statusColor } from '../components/ui/primitives'
import { fmtDateTime, fmtNum } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { CheckinResponse } from '../types/api'

type Key = 'hr' | 'temp' | 'sleep' | 'stress' | 'mood' | 'fatigue' | 'pain'
interface FieldDef { key: Key; label: string; unit: string; min: number; max: number; step: number; help: string }

// Ranges are data-entry sanity checks only, not clinical thresholds.
const F: Record<Key, FieldDef> = {
  hr: { key: 'hr', label: 'Resting heart rate', unit: 'bpm', min: 20, max: 220, step: 1, help: 'After at least 5 minutes of rest.' },
  temp: { key: 'temp', label: 'Body temperature', unit: '°C', min: 30, max: 43, step: 0.1, help: 'Oral or forehead reading.' },
  sleep: { key: 'sleep', label: 'Sleep last night', unit: 'hours', min: 0, max: 24, step: 0.1, help: 'Total time asleep.' },
  stress: { key: 'stress', label: 'Stress', unit: '0–10', min: 0, max: 10, step: 1, help: '0 none · 10 extreme' },
  mood: { key: 'mood', label: 'Mood', unit: '1–5', min: 1, max: 5, step: 1, help: '1 very low · 5 very good' },
  fatigue: { key: 'fatigue', label: 'Fatigue', unit: '0–10', min: 0, max: 10, step: 1, help: '0 rested · 10 exhausted' },
  pain: { key: 'pain', label: 'Pain', unit: '0–10', min: 0, max: 10, step: 1, help: '0 none · 10 worst imaginable' },
}
const STEPS: { title: string; keys: Key[] }[] = [
  { title: 'Body readings', keys: ['hr', 'temp', 'sleep'] },
  { title: 'How you feel', keys: ['stress', 'mood', 'fatigue', 'pain'] },
  { title: 'Review', keys: [] },
]

type Values = Record<Key, string>
const EMPTY: Values = { hr: '', temp: '', sleep: '', stress: '', mood: '', fatigue: '', pain: '' }

function validate(f: FieldDef, raw: string): string | null {
  if (raw.trim() === '') return `Enter a value (${f.unit}).`
  const n = Number(raw)
  if (Number.isNaN(n)) return 'Enter a number.'
  if (n < f.min || n > f.max) return `Must be between ${f.min} and ${f.max}.`
  return null
}

function Check({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-hair bg-space/60 px-3 py-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--accent))]" />
      <span>{children}</span>
    </label>
  )
}

export function DailyCheckIn() {
  const { selected, selectedId, go, bump, conn, version } = useApp()
  const last = useAsync(() => (selectedId ? api.overview(selectedId) : Promise.reject(new Error('none'))), [selectedId, version])
  const [step, setStep] = useState(0)
  const [v, setV] = useState<Values>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [concerning, setConcerning] = useState(false)
  const [note, setNote] = useState('')
  const [counter, setCounter] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const [result, setResult] = useState<CheckinResponse | null>(null)
  const inflight = useRef(false)

  const stepValid = (i: number) => STEPS[i].keys.every((k) => validate(F[k], v[k]) === null)
  const allValid = stepValid(0) && stepValid(1)

  function next() {
    setTouched(true)
    if (!stepValid(step)) return
    setTouched(false)
    setStep((s) => s + 1)
  }

  async function submit() {
    if (!allValid || !selectedId || inflight.current) return
    inflight.current = true
    setBusy(true)
    setErr(null)
    const combinedNote = [concerning ? note.trim() : '', notes.trim() ? `Notes: ${notes.trim()}` : ''].filter(Boolean).join('\n').slice(0, 500)
    try {
      const res = await api.checkin({
        astronaut_id: selectedId,
        resting_heart_rate_bpm: Number(v.hr), temperature_c: Number(v.temp), sleep_hours: Number(v.sleep),
        stress_score: Number(v.stress), mood_score: Number(v.mood), fatigue_score: Number(v.fatigue), pain_score: Number(v.pain),
        concerning_symptom: concerning, symptom_note: combinedNote, countermeasure_completed: counter,
        captured_at: new Date().toISOString(),
      })
      setResult(res)
      bump()
    } catch (x) {
      setErr(x instanceof ApiError ? x : new ApiError('Unexpected error.'))
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  if (!selected) return <PageHeader title="Daily check-in" sub="Select an astronaut first." />

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card flex items-center gap-3" style={{ borderColor: statusColor('stable', 0.5) }}>
          <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: statusColor('stable') }} aria-hidden />
          <div>
            <p className="font-semibold">Check-in saved</p>
            <p className="text-sm text-ink-dim">Reference {result.checkin_id} · {selected.name}</p>
          </div>
        </div>
        <AssessmentCard a={result.assessment} />
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => go('overview')}><ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard</button>
          <button className="btn-ghost" onClick={() => { setResult(null); setV(EMPTY); setStep(0); setTouched(false); setConcerning(false); setNote(''); setNotes(''); setCounter(false) }}>New check-in</button>
        </div>
      </div>
    )
  }

  const lt = last.data?.latest

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-4">
      <PageHeader title="Daily check-in" sub={`${selected.name} · about 2 minutes. Self-reported values, not a diagnosis.`} />

      {conn === 'demo' && <InfoBanner tone="warn">Backend unreachable — demo fallback, not saved. Submitting will fail until the server is back.</InfoBanner>}

      <div className="card bg-panel2 text-sm">
        <p className="card-title">Last recorded</p>
        {lt ? (
          <p className="mt-1.5 text-ink-dim">
            {fmtNum(lt.resting_heart_rate_bpm)} bpm · {fmtNum(lt.sleep_hours, 1)} h sleep · {fmtNum(lt.temperature_c, 1)} °C · {fmtDateTime(lt.captured_at)}
          </p>
        ) : <p className="mt-1.5 text-ink-dim">No earlier readings for this astronaut.</p>}
      </div>

      <ol className="flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-1 flex-col gap-1.5" aria-current={i === step ? 'step' : undefined}>
            <span className={`h-1 rounded-full ${i <= step ? 'bg-cyan' : 'bg-ink/15'}`} />
            <span className={`text-xs font-medium ${i === step ? 'text-ink' : 'text-ink-dim'}`}>{i + 1}. {s.title}</span>
          </li>
        ))}
      </ol>

      <form onSubmit={(e) => { e.preventDefault(); if (step < 2) next(); else submit() }} noValidate className="space-y-4">
        {step < 2 && (
          <fieldset className="card">
            <legend className="sr-only">{STEPS[step].title}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {STEPS[step].keys.map((k) => {
                const f = F[k]
                const msg = touched ? validate(f, v[k]) : null
                return (
                  <div key={k}>
                    <label htmlFor={`f-${k}`} className="mb-1 flex items-baseline justify-between text-sm font-medium">
                      {f.label}<span className="text-xs text-ink-dim">{f.unit}</span>
                    </label>
                    <input
                      id={`f-${k}`} className="field" type="number" inputMode="decimal"
                      min={f.min} max={f.max} step={f.step} value={v[k]}
                      onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))}
                      aria-invalid={msg ? true : undefined} aria-describedby={`h-${k}`}
                    />
                    <p id={`h-${k}`} className="mt-1 text-xs" style={{ color: msg ? statusColor('escalate') : undefined }}>
                      <span className={msg ? 'font-medium' : 'text-ink-dim'}>{msg ?? f.help}</span>
                    </p>
                  </div>
                )
              })}
            </div>

            {step === 1 && (
              <div className="mt-5 space-y-3 border-t border-hair pt-4">
                <Check id="concern" checked={concerning} onChange={setConcerning}>I have a concerning symptom</Check>
                {concerning && (
                  <div>
                    <label htmlFor="symptom-note" className="mb-1 block text-sm font-medium">Describe it (optional)</label>
                    <textarea id="symptom-note" className="field py-2" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                    <p className="mt-1 text-right text-xs text-ink-dim">{note.length}/500</p>
                  </div>
                )}
                <Check id="counter" checked={counter} onChange={setCounter}>Completed assigned exercise / countermeasures</Check>
                <div>
                  <label htmlFor="notes" className="mb-1 block text-sm font-medium">Other notes (optional)</label>
                  <textarea id="notes" className="field py-2" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            )}
          </fieldset>
        )}

        {step === 2 && (
          <div className="card">
            <p className="card-title">Review before saving</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              {([...STEPS[0].keys, ...STEPS[1].keys] as Key[]).map((k) => (
                <div key={k}><dt className="text-xs text-ink-dim">{F[k].label}</dt><dd className="font-semibold tabular-nums">{v[k]} <span className="font-normal text-ink-dim">{F[k].unit}</span></dd></div>
              ))}
              <div><dt className="text-xs text-ink-dim">Concerning symptom</dt><dd className="font-semibold">{concerning ? 'Yes' : 'No'}</dd></div>
              <div><dt className="text-xs text-ink-dim">Countermeasures</dt><dd className="font-semibold">{counter ? 'Completed' : 'Not completed'}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-ink-dim">Saving sends these values to the mission server, which returns your updated assessment.</p>
          </div>
        )}

        {err && (
          <div role="alert" className="card text-sm" style={{ borderColor: statusColor('escalate', 0.5) }}>
            <p className="font-semibold" style={{ color: statusColor('escalate') }}>Not saved</p>
            <p className="mt-1">{err.message}</p>
            {err.details.length > 1 && <ul className="mt-1 list-disc pl-5 text-ink-dim">{err.details.map((d) => <li key={d}>{d}</li>)}</ul>}
            <p className="mt-2 text-ink-dim">Your entries are kept. {err.network ? 'Start the backend, then try again.' : 'Fix the values and try again.'}</p>
          </div>
        )}
        {touched && !stepValid(step) && <p role="alert" className="text-sm" style={{ color: statusColor('escalate') }}>Please fix the highlighted fields.</p>}

        <div className="sticky bottom-[72px] z-20 flex gap-3 md:static">
          {step > 0 && <button type="button" className="btn-ghost" onClick={() => { setTouched(false); setStep((s) => s - 1) }} disabled={busy}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</button>}
          {step < 2 ? (
            <button type="submit" className="btn-primary flex-1 sm:flex-none">Continue <ArrowRight className="h-4 w-4" aria-hidden /></button>
          ) : (
            <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {busy ? 'Assessing…' : 'Save & assess'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
