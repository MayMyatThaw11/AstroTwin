import { METRICS } from './metrics'
import type { Metric, Observation } from './types'

/** Small seeded PRNG so demo history is identical on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

/**
 * 30 days of synthetic, clearly labelled demo history ending today.
 * AST-001 drifts away from its own baseline over the last 5 days, AST-002 stays steady,
 * AST-003 has almost no data. Some days and metrics are deliberately missing (gaps).
 */
export function seedObservations(astronautId: string, now = new Date()): Observation[] {
  const rnd = mulberry32(hash(astronautId))
  const n = (amp: number) => (rnd() * 2 - 1) * amp
  const out: Observation[] = []
  let seq = 0
  const push = (metric: Metric, value: number, at: Date, sessionId?: string) => {
    if (at.getTime() > now.getTime()) return
    const def = METRICS[metric]
    out.push({
      id: `SEED-${astronautId}-${seq++}`, astronautId, metric, value: round(value, def.digits), unit: def.unit,
      measuredAt: at.toISOString(), source: 'demo_seed', sessionId,
    })
  }

  for (let d = 29; d >= 0; d--) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 8, 0, 0)
    const ramp = Math.max(0, 5 - d) // 0 until 5 days ago, then 1..5

    if (astronautId === 'AST-003') {
      if (d <= 1) {
        push('heart_rate_bpm', 68 + n(2), at); push('sleep_hours', 7 + n(0.3), at); push('temperature_c', 36.6 + n(0.1), at)
      }
      continue
    }

    const drift = astronautId === 'AST-001'
    if (drift && (d === 12 || d === 13)) continue // missing days
    if (!drift && (d === 9 || d === 10)) continue

    push('heart_rate_bpm', drift ? 65 + ramp * 3.8 + n(1.5) : 64 + n(2), at)
    push('sleep_hours', drift ? 7.2 - ramp * 0.48 + n(0.3) : 7.4 + n(0.3), at)
    push('temperature_c', (drift ? 36.7 : 36.6) + n(0.12), at)
    push('stress_score', Math.max(0, Math.min(10, drift ? 3 + ramp * 0.8 + n(0.7) : 3 + n(1))), at)
    push('fatigue_score', Math.max(0, Math.min(10, drift ? 2 + ramp * 1 + n(0.7) : 2 + n(0.9))), at)
    if (d % 6 !== 4) push('spo2_pct', Math.min(100, 97.5 + n(1)), at) // a few days without SpO2

    if (drift ? d % 2 === 0 : d % 3 === 1) {
      const sid = `BP-${astronautId}-${d}`
      push('systolic_bp_mmhg', 120 + n(4), at, sid)
      push('diastolic_bp_mmhg', 78 + n(3), at, sid)
    }
    if (d % 3 === 0) push('glucose_mg_dl', 92 + n(6), at)
    if (!drift) push('hrv_ms', 55 + n(6), at) // only AST-002 has HRV readings
  }
  return out
}
