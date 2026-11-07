import type {
  AlertsResponse, Astronaut, CheckinRequest, CheckinResponse, Health, MedicalSummary, Overview, Trends,
} from '../types/api'
import {
  fallbackAlerts, fallbackAstronauts, fallbackOverview, fallbackSummary, fallbackTrends,
} from './fallback'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api/v1'

export class ApiError extends Error {
  status: number
  /** true when the server could not be reached at all */
  network: boolean
  details: string[]
  constructor(message: string, status = 0, network = false, details: string[] = []) {
    super(message)
    this.status = status
    this.network = network
    this.details = details
  }
}

// Set once the backend is known to be unreachable (GET requests then use sample data).
let demoFallback = false
export function setDemoFallback(v: boolean) { demoFallback = v }
export function isDemoFallback() { return demoFallback }

function detailToMessages(detail: unknown): string[] {
  if (typeof detail === 'string') return [detail]
  if (Array.isArray(detail)) {
    return detail.map((d) => {
      if (d && typeof d === 'object') {
        const o = d as { loc?: unknown[]; msg?: string }
        const where = Array.isArray(o.loc) ? o.loc.filter((x) => x !== 'body').join('.') : ''
        return where ? `${where}: ${o.msg ?? 'invalid'}` : (o.msg ?? 'invalid')
      }
      return String(d)
    })
  }
  return []
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError('The mission server could not be reached.', 0, true)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let body: unknown = null
    try { body = await res.json() } catch { /* not json */ }
    const msgs = detailToMessages((body as { detail?: unknown } | null)?.detail)
    const generic =
      res.status === 404 ? 'Unknown astronaut or resource.'
      : res.status >= 500 ? 'The server hit an unexpected problem. Please retry.'
      : 'The server rejected the request.'
    throw new ApiError(msgs[0] ?? generic, res.status, false, msgs)
  }
  return (await res.json()) as T
}

/** GET; falls back to sample data only when the network itself is down. */
async function get<T>(path: string, fb: () => T): Promise<T> {
  if (demoFallback) return fb()
  try {
    return await request<T>(path)
  } catch (e) {
    if (e instanceof ApiError && e.network) {
      demoFallback = true
      return fb()
    }
    throw e
  }
}

export const api = {
  health: () => request<Health>('/health', undefined, 3000),
  astronauts: () => get<{ items: Astronaut[] }>('/astronauts', fallbackAstronauts),
  overview: (id: string) => get<Overview>(`/astronauts/${id}/overview`, () => fallbackOverview(id)),
  trends: (id: string, days: 7 | 30) => get<Trends>(`/astronauts/${id}/trends?days=${days}`, () => fallbackTrends(id, days)),
  alerts: (id: string) => get<AlertsResponse>(`/astronauts/${id}/alerts`, () => fallbackAlerts(id)),
  summary: (id: string) => get<MedicalSummary>(`/astronauts/${id}/medical-summary`, () => fallbackSummary(id)),
  /** Never falls back: a check-in that was not saved must not look saved. */
  checkin: async (body: CheckinRequest): Promise<CheckinResponse> => {
    if (demoFallback) {
      try {
        await request<Health>('/health', undefined, 2000)
        demoFallback = false
      } catch {
        throw new ApiError('Backend unavailable — the check-in was not saved.', 0, true)
      }
    }
    return request<CheckinResponse>('/checkins', { method: 'POST', body: JSON.stringify(body) }, 12000)
  },
}
