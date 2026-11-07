export type Status = 'stable' | 'review' | 'escalate' | 'insufficient_data'

export interface Astronaut {
  id: string
  name: string
  role: string
  mission: string
  mission_day: number
  is_simulated: boolean
}

export interface Measurement {
  resting_heart_rate_bpm: number | null
  temperature_c: number | null
  sleep_hours: number | null
  stress_score: number | null
  mood_score?: number | null
  fatigue_score?: number | null
  pain_score?: number | null
  captured_at?: string
}

export interface Baseline {
  resting_heart_rate_bpm: number | null
  temperature_c: number | null
  sleep_hours: number | null
  stress_score: number | null
}

export interface Assessment {
  id: string
  status: Status
  title: string
  summary: string
  contributors: string[]
  next_action: string
  created_at: string
  is_simulated: boolean
}

export interface Overview {
  astronaut: Astronaut
  latest: Measurement | null
  baseline: Baseline | null
  assessment: Assessment | null
  source_label: string
}

export interface TrendPoint {
  date: string
  resting_heart_rate_bpm: number | null
  sleep_hours: number | null
  temperature_c: number | null
  stress_score: number | null
}

export interface Trends {
  astronaut_id: string
  days: number
  points: TrendPoint[]
}

export interface CheckinRequest {
  astronaut_id: string
  resting_heart_rate_bpm: number
  temperature_c: number
  sleep_hours: number
  stress_score: number
  mood_score: number
  fatigue_score: number
  pain_score: number
  concerning_symptom: boolean
  symptom_note: string
  countermeasure_completed: boolean
  captured_at: string
}

export interface CheckinResponse {
  checkin_id: string
  saved: boolean
  assessment: Assessment
}

export interface AlertsResponse {
  items: Assessment[]
}

export interface MedicalSummary {
  astronaut_id: string
  generated_at: string
  report_text: string
  is_simulated: boolean
  transmitted: boolean
}

export interface Health {
  status: string
  mode: string
  data_source: string
}
