// Static sample data used ONLY when the backend is unreachable.
// Shapes match the API contract. Nothing here is saved or computed by the UI.
import type { Assessment, Astronaut, Overview, TrendPoint, MedicalSummary } from '../types/api'

const crew: Astronaut[] = [
  { id: 'AST-001', name: 'Commander Nova', role: 'Mission Commander', mission: 'Mars Transit', mission_day: 47, is_simulated: true },
  { id: 'AST-002', name: 'Dr. Sol', role: 'Flight Engineer', mission: 'Mars Transit', mission_day: 47, is_simulated: true },
  { id: 'AST-003', name: 'Specialist Vega', role: 'Mission Specialist', mission: 'Mars Transit', mission_day: 47, is_simulated: true },
]

const SOURCE = 'DEMO FALLBACK · SAMPLE DATA'

const nova: Assessment = {
  id: 'ASM-DEMO-1', status: 'review', title: 'Changes worth reviewing',
  summary: 'Resting heart rate is above the personal reference trend and recent sleep is shorter.',
  contributors: ['Resting heart rate above recent baseline', 'Sleep duration below recent baseline', 'Self-reported fatigue increased'],
  next_action: 'Recheck after rest and follow the approved crew medical guidance if symptoms or concerns persist.',
  created_at: '2026-11-07T08:05:00Z', is_simulated: true,
}
const sol: Assessment = {
  id: 'ASM-DEMO-2', status: 'stable', title: 'Consistent with personal trend',
  summary: 'Recent measurements are consistent with this astronaut\'s own trend.',
  contributors: ['Heart rate within recent personal range', 'Sleep duration consistent'],
  next_action: 'Continue the daily check-in routine.',
  created_at: '2026-11-07T08:05:00Z', is_simulated: true,
}

export function fallbackAstronauts() { return { items: crew } }

export function fallbackOverview(id: string): Overview {
  const a = crew.find((c) => c.id === id) ?? crew[0]
  if (a.id === 'AST-002') {
    return {
      astronaut: a, source_label: SOURCE, assessment: sol,
      latest: { resting_heart_rate_bpm: 64, temperature_c: 36.6, sleep_hours: 7.4, stress_score: 3, mood_score: 4, fatigue_score: 2, pain_score: 0, captured_at: '2026-11-07T08:05:00Z' },
      baseline: { resting_heart_rate_bpm: 65, temperature_c: 36.6, sleep_hours: 7.3, stress_score: 3 },
    }
  }
  if (a.id === 'AST-003') {
    return {
      astronaut: a, source_label: SOURCE, latest: null, baseline: null,
      assessment: {
        id: 'ASM-DEMO-3', status: 'insufficient_data', title: 'Not enough readings yet',
        summary: 'More daily check-ins are needed before a personal trend can be described.',
        contributors: [], next_action: 'Complete a daily check-in.', created_at: '2026-11-07T08:05:00Z', is_simulated: true,
      },
    }
  }
  return {
    astronaut: a, source_label: SOURCE, assessment: nova,
    latest: { resting_heart_rate_bpm: 84, temperature_c: 36.8, sleep_hours: 4.8, stress_score: 7, mood_score: 2, fatigue_score: 7, pain_score: 1, captured_at: '2026-11-07T08:05:00Z' },
    baseline: { resting_heart_rate_bpm: 65, temperature_c: 36.7, sleep_hours: 7.3, stress_score: 3 },
  }
}

export function fallbackTrends(id: string, days: number) {
  const hr = id === 'AST-001' ? [65, 67, 66, 72, 76, 80, 84] : [64, 65, 64, 66, 65, 64, 64]
  const sl = id === 'AST-001' ? [7.2, 7.0, 6.6, 6.0, 5.4, 5.0, 4.8] : [7.3, 7.4, 7.2, 7.5, 7.3, 7.4, 7.4]
  const n = id === 'AST-003' ? 2 : days
  const points: TrendPoint[] = Array.from({ length: n }, (_, i) => {
    const k = i % 7
    const d = new Date(Date.UTC(2026, 10, 7 - (n - 1 - i)))
    return {
      date: d.toISOString().slice(0, 10),
      resting_heart_rate_bpm: hr[k], sleep_hours: sl[k],
      temperature_c: Math.round((36.6 + (k % 3) * 0.1) * 10) / 10,
      stress_score: id === 'AST-001' ? 3 + Math.floor(k / 2) : 3,
    }
  })
  return { astronaut_id: id, days, points }
}

export function fallbackAlerts(id: string) {
  const o = fallbackOverview(id)
  return { items: o.assessment && o.assessment.status !== 'stable' ? [o.assessment] : [] }
}

export function fallbackSummary(id: string): MedicalSummary {
  const o = fallbackOverview(id)
  return {
    astronaut_id: id, generated_at: new Date().toISOString(), is_simulated: true, transmitted: false,
    report_text: `ASTROTWIN AI - SIMULATED / NOT A DIAGNOSIS\nDEMO FALLBACK - backend unavailable, sample text\nAstronaut: ${o.astronaut.name}\nStatus: ${o.assessment?.status ?? 'n/a'}\n${o.assessment?.summary ?? ''}`,
  }
}
