import type { Status } from '../types/api'

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC'
}

export function fmtShortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

export const STATUS_LABEL: Record<Status, string> = {
  stable: 'Stable',
  review: 'Review',
  escalate: 'Escalate',
  insufficient_data: 'Insufficient data',
}

/** Signed difference vs baseline, or null when either side is missing. */
export function diff(value: number | null | undefined, base: number | null | undefined, digits = 0): string | null {
  if (value == null || base == null) return null
  const d = value - base
  const s = d.toFixed(digits)
  if (Number(s) === 0) return '±0'
  return `${d > 0 ? '+' : ''}${s}`
}
