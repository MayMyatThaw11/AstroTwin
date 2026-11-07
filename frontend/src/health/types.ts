export type Metric =
  | 'heart_rate_bpm' | 'systolic_bp_mmhg' | 'diastolic_bp_mmhg'
  | 'spo2_pct' | 'temperature_c' | 'sleep_hours'
  | 'glucose_mg_dl' | 'hrv_ms' | 'stress_score' | 'fatigue_score'

export type MeasurementSource = 'manual' | 'simulated_wearable' | 'demo_seed' | 'backend'

export interface Observation {
  id: string
  astronautId: string
  metric: Metric
  value: number
  unit: string
  measuredAt: string // ISO timestamp
  source: MeasurementSource
  notes?: string
  /** Pairs a systolic and diastolic reading taken together. */
  sessionId?: string
}

export const SOURCE_LABEL: Record<MeasurementSource, string> = {
  manual: 'Manual entry',
  simulated_wearable: 'Simulated wearable',
  demo_seed: 'Demo seed data',
  backend: 'Backend',
}

/** Adapter contract. Only the local one is implemented; the HTTP one waits for the agreed backend contract. */
export interface HealthAdapter {
  readonly label: string
  list(astronautId: string): Observation[]
  add(items: Omit<Observation, 'id'>[]): Observation[]
  reset(astronautId: string): void
}
