import { useMemo, useSyncExternalStore } from 'react'
import { METRICS, fmtValue } from './metrics'
import { seedObservations } from './seed'
import type { HealthAdapter, Metric, Observation } from './types'
import { SOURCE_LABEL } from './types'

/* ---------------- local demo adapter (browser storage) ---------------- */

const KEY = 'astrotwin-health-v1'
const MAX_SIMULATED_PER_ASTRONAUT = 200

let added: Observation[] = []
try {
  const raw = localStorage.getItem(KEY)
  if (raw) added = (JSON.parse(raw) as Observation[]).filter((o) => o && typeof o.value === 'number')
} catch { /* unreadable or unavailable storage: start empty */ }

let storageOk = true
let version = 0
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((l) => l()) }

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(added)); storageOk = true } catch { storageOk = false }
  notify()
}

const seedCache = new Map<string, { day: string; data: Observation[] }>()
function seedFor(id: string): Observation[] {
  const day = new Date().toDateString()
  const hit = seedCache.get(id)
  if (hit && hit.day === day) return hit.data
  const data = seedObservations(id)
  seedCache.set(id, { day, data })
  return data
}

let counter = 0
export const localAdapter: HealthAdapter = {
  label: 'Local demo data · saved in this browser',
  list: (id) => [...seedFor(id), ...added.filter((o) => o.astronautId === id)]
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)),
  add: (items) => {
    const created = items.map((i) => ({ ...i, id: `OBS-${Date.now().toString(36)}-${counter++}` }))
    added = [...added, ...created]
    // keep stream samples bounded so storage cannot bloat
    for (const id of new Set(created.map((c) => c.astronautId))) {
      const sim = added.filter((o) => o.astronautId === id && o.source === 'simulated_wearable')
      if (sim.length > MAX_SIMULATED_PER_ASTRONAUT) {
        const drop = new Set(sim.slice(0, sim.length - MAX_SIMULATED_PER_ASTRONAUT).map((o) => o.id))
        added = added.filter((o) => !drop.has(o.id))
      }
    }
    persist()
    return created
  },
  reset: (id) => { added = added.filter((o) => o.astronautId !== id); persist() },
}

/**
 * Placeholder for the real backend. Intentionally unimplemented: endpoints and payloads are still
 * to be agreed with the backend developer, so nothing here pretends to be established.
 */
export const httpAdapterStub: HealthAdapter = {
  label: 'Backend (not connected)',
  list: () => { throw new Error('HTTP health adapter not implemented') },
  add: () => { throw new Error('HTTP health adapter not implemented') },
  reset: () => { throw new Error('HTTP health adapter not implemented') },
}

export const adapter: HealthAdapter = localAdapter

/* ---------------- React bindings ---------------- */

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export function useHealthVersion() { return useSyncExternalStore(subscribe, () => version) }
export function useStorageOk() { useHealthVersion(); return storageOk }

export function useObservations(astronautId: string | null): Observation[] {
  const v = useHealthVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (astronautId ? adapter.list(astronautId) : []), [astronautId, v])
}

export const addObservations = (items: Omit<Observation, 'id'>[]) => adapter.add(items)
export const resetDemo = (astronautId: string) => adapter.reset(astronautId)

/* ---------------- calculations ---------------- */

const DAY = 86_400_000

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Local calendar day key, YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function latestOf(obs: Observation[], metric: Metric): Observation | null {
  for (let i = obs.length - 1; i >= 0; i--) if (obs[i].metric === metric) return obs[i]
  return null
}

export interface Row { date: string; [k: string]: number | string | null }

/**
 * One row per local day in the window. Each metric holds the median of that day's readings,
 * or null when nothing was measured (never zero, never interpolated).
 */
export function dailyRows(obs: Observation[], metrics: Metric[], days: number, now = new Date()): Row[] {
  const buckets = new Map<string, Map<Metric, Observation[]>>()
  for (const o of obs) {
    if (!metrics.includes(o.metric)) continue
    const k = dayKey(new Date(o.measuredAt))
    if (!buckets.has(k)) buckets.set(k, new Map())
    const m = buckets.get(k)!
    if (!m.has(o.metric)) m.set(o.metric, [])
    m.get(o.metric)!.push(o)
  }
  const rows: Row[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))
    const row: Row = { date }
    for (const metric of metrics) {
      const list = buckets.get(date)?.get(metric) ?? []
      row[metric] = list.length ? median(list.map((o) => o.value)) : null
      row[`${metric}_n`] = list.length
      row[`${metric}_src`] = [...new Set(list.map((o) => SOURCE_LABEL[o.source]))].join(', ')
    }
    rows.push(row)
  }
  return rows
}

export interface Baseline { value: number; days: number; text: string }
export const BASELINE_MIN_DAYS = 5
const RECENT_DAYS = 3
const LOOKBACK_DAYS = 28

/**
 * Personal reference: median of daily medians over the 28 days before the most recent 3 days.
 * Needs readings on at least 5 of those days. It is a personal reference, not a validated normal range.
 */
export function baselineFor(obs: Observation[], metric: Metric, now = new Date()): Baseline | null {
  const end = now.getTime() - RECENT_DAYS * DAY
  const start = end - LOOKBACK_DAYS * DAY
  const perDay = new Map<string, number[]>()
  for (const o of obs) {
    if (o.metric !== metric) continue
    const t = new Date(o.measuredAt).getTime()
    if (t < start || t >= end) continue
    const k = dayKey(new Date(t))
    if (!perDay.has(k)) perDay.set(k, [])
    perDay.get(k)!.push(o.value)
  }
  if (perDay.size < BASELINE_MIN_DAYS) return null
  const value = median([...perDay.values()].map((v) => median(v)!))!
  return {
    value, days: perDay.size,
    text: `Personal reference: median of daily values over the ${LOOKBACK_DAYS} days before the last ${RECENT_DAYS} days (${perDay.size} days with readings).`,
  }
}

export interface Explanation {
  headline: string
  whatChanged: string
  forHowLong: string
  comparedWith: string
}

/** Plain description of recent readings vs the personal reference. No thresholds, no diagnosis. */
export function explainTrend(obs: Observation[], metric: Metric, now = new Date()): Explanation {
  const def = METRICS[metric]
  const base = baselineFor(obs, metric, now)
  if (!base) {
    return {
      headline: 'Trend cannot be determined yet',
      whatChanged: 'There are not enough earlier readings to build a personal reference.',
      forHowLong: '—',
      comparedWith: `Baseline unavailable — insufficient observations (needs readings on at least ${BASELINE_MIN_DAYS} earlier days).`,
    }
  }
  const recent = dailyRows(obs, [metric], RECENT_DAYS + 4, now).filter((r) => r[metric] != null)
  if (recent.length < 2) {
    return {
      headline: 'Trend cannot be determined yet',
      whatChanged: `Only ${recent.length} recent day${recent.length === 1 ? '' : 's'} with readings.`,
      forHowLong: '—',
      comparedWith: base.text,
    }
  }
  const last = recent.slice(-RECENT_DAYS)
  const rv = median(last.map((r) => r[metric] as number))!
  const delta = rv - base.value
  const dir = delta > 0 ? 'above' : 'below'
  const sameSide = last.filter((r) => ((r[metric] as number) - base.value) * delta > 0).length
  const unit = def.unit === '/10' ? ' points' : ` ${def.unit}`
  // presentation only: differences under 2% of the reference are described as "close to", not as a direction
  const flat = Math.abs(delta) < Math.max(10 ** -def.digits, Math.abs(base.value) * 0.02)
  return {
    headline: flat ? `${def.label} is close to your personal reference` : `${def.label} is ${dir} your personal reference`,
    whatChanged: flat
      ? `Recent median ${fmtValue(metric, rv)}${unit}, in line with ${fmtValue(metric, base.value)}${unit}.`
      : `Recent median ${fmtValue(metric, rv)}${unit}, ${Math.abs(delta).toFixed(def.digits)}${unit} ${dir} ${fmtValue(metric, base.value)}${unit}.`,
    forHowLong: flat ? `Across the last ${last.length} recorded days.` : `${sameSide} of the last ${last.length} recorded days were ${dir} the reference.`,
    comparedWith: base.text,
  }
}

export function toCsv(obs: Observation[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const head = 'astronaut_id,metric,value,unit,measured_at,source,notes'
  return [head, ...obs.map((o) => [o.astronautId, o.metric, o.value, o.unit, o.measuredAt, o.source, esc(o.notes ?? '')].join(','))].join('\n')
}
