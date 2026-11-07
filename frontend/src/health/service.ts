import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { API_BASE } from '../api/client'
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

/* ---------------- HTTP adapter (FastAPI backend) ---------------- */

interface ApiObservation {
  id: string; astronaut_id: string; metric: Metric; value: number; unit: string
  measured_at: string; source: Observation['source']; notes?: string | null; session_id?: string | null
}
const fromApi = (o: ApiObservation): Observation => ({
  id: o.id, astronautId: o.astronaut_id, metric: o.metric, value: o.value, unit: o.unit,
  measuredAt: o.measured_at, source: o.source, notes: o.notes ?? undefined, sessionId: o.session_id ?? undefined,
})

let online = false
const remote = new Map<string, Observation[]>()
let remoteError: string | null = null

/** Called by the app shell once the backend health check decides between backend and offline demo mode. */
export function setBackendOnline(v: boolean) {
  if (online === v) return
  online = v
  remote.clear()
  remoteError = null
  notify()
}
export const isBackendOnline = () => online

async function fetchRemote(id: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/astronauts/${id}/observations`, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { items: ApiObservation[] }
    remote.set(id, body.items.map(fromApi))
    remoteError = null
  } catch (e) {
    remote.set(id, remote.get(id) ?? [])
    remoteError = `Could not load saved measurements from the backend (${(e as Error).message}).`
  }
  notify()
}

const localSimulated = (id: string) => added.filter((o) => o.astronautId === id && o.source === 'simulated_wearable')

export const httpAdapter: HealthAdapter = {
  label: 'Backend · SQLite (synthetic crew data + saved entries)',
  list: (id) => [...(remote.get(id) ?? []), ...localSimulated(id)].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)),
  add: async (items) => {
    // the opt-in simulated stream stays in this browser: it must not flood the backend or look like saved data
    if (items.every((i) => i.source === 'simulated_wearable')) return localAdapter.add(items) as Observation[]
    const id = items[0].astronautId
    let res: Response
    try {
      res = await fetch(`${API_BASE}/astronauts/${id}/observations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({
            metric: i.metric, value: i.value, unit: i.unit, measured_at: i.measuredAt, source: i.source,
            notes: i.notes ?? null, session_id: i.sessionId ?? null,
          })),
        }),
      })
    } catch {
      throw new Error('The backend could not be reached. Nothing was saved.')
    }
    if (!res.ok) {
      let msg = 'The backend rejected the entry. Nothing was saved.'
      try {
        const d = ((await res.json()) as { detail?: unknown }).detail
        if (typeof d === 'string') msg = d
        else if (Array.isArray(d) && d[0] && typeof d[0] === 'object') msg = String((d[0] as { msg?: string }).msg ?? msg)
      } catch { /* keep generic message */ }
      throw new Error(msg)
    }
    const body = (await res.json()) as { items: ApiObservation[] }
    await fetchRemote(id)
    return body.items.map(fromApi)
  },
  reset: (id) => { added = added.filter((o) => !(o.astronautId === id && o.source === 'simulated_wearable')); persist() },
}

/** Active adapter: the backend when it is reachable, otherwise the offline demo store. */
export const adapter: HealthAdapter = {
  get label() { return online ? httpAdapter.label : localAdapter.label },
  list: (id) => (online ? httpAdapter : localAdapter).list(id),
  add: (items) => (online ? httpAdapter : localAdapter).add(items),
  reset: (id) => (online ? httpAdapter : localAdapter).reset(id),
}

/**
 * Reference "now" for windows and baselines. Offline: the real clock. Backend: the end of the day of the latest
 * saved (non-simulated) observation, so a historical dataset is shown as of its own last day rather than as empty.
 */
export function anchorOf(obs: Observation[]): Date {
  if (!online) return new Date()
  let max = ''
  for (const o of obs) if (o.source !== 'simulated_wearable' && o.measuredAt > max) max = o.measuredAt
  if (!max) return new Date()
  const d = new Date(max)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/* ---------------- React bindings ---------------- */

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export function useHealthVersion() { return useSyncExternalStore(subscribe, () => version) }
export function useStorageOk() { useHealthVersion(); return storageOk }

export function useObservations(astronautId: string | null): Observation[] {
  const v = useHealthVersion()
  useEffect(() => {
    if (online && astronautId && !remote.has(astronautId)) void fetchRemote(astronautId)
  }, [astronautId, v])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (astronautId ? adapter.list(astronautId) : []), [astronautId, v])
}

export const addObservations = async (items: Omit<Observation, 'id'>[]): Promise<Observation[]> => adapter.add(items)
/** Returns a message describing what was removed. Backend-saved entries are never deleted from here. */
export function resetDemo(astronautId: string): string {
  adapter.reset(astronautId)
  return online ? 'Simulated stream samples removed. Entries saved in the backend were kept.' : 'Demo entries removed for this astronaut.'
}
export const useRemoteError = () => { useHealthVersion(); return online ? remoteError : null }

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
export function dailyRows(obs: Observation[], metrics: Metric[], days: number, now = anchorOf(obs)): Row[] {
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
export function baselineFor(obs: Observation[], metric: Metric, now = anchorOf(obs)): Baseline | null {
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
export function explainTrend(obs: Observation[], metric: Metric, now = anchorOf(obs)): Explanation {
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
