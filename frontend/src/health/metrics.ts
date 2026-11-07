import type { Metric } from './types'

export type ColorKey = 'hr' | 'sleep' | 'temp' | 'stress' | 'spo2' | 'glucose' | 'fatigue' | 'hrv' | 'bp2'

export interface MetricDef {
  id: Metric
  label: string
  unit: string
  digits: number
  /** Data-entry sanity bounds only. These are not clinical thresholds. */
  min: number
  max: number
  /** Smallest y-axis span, so sparse or flat data is not zoomed into noise. */
  minSpan: number
  color: ColorKey
}

export const METRICS: Record<Metric, MetricDef> = {
  heart_rate_bpm: { id: 'heart_rate_bpm', label: 'Heart rate', unit: 'bpm', digits: 0, min: 20, max: 250, minSpan: 20, color: 'hr' },
  systolic_bp_mmhg: { id: 'systolic_bp_mmhg', label: 'Systolic BP', unit: 'mmHg', digits: 0, min: 50, max: 260, minSpan: 30, color: 'hr' },
  diastolic_bp_mmhg: { id: 'diastolic_bp_mmhg', label: 'Diastolic BP', unit: 'mmHg', digits: 0, min: 30, max: 160, minSpan: 30, color: 'bp2' },
  spo2_pct: { id: 'spo2_pct', label: 'SpO₂', unit: '%', digits: 0, min: 50, max: 100, minSpan: 6, color: 'spo2' },
  temperature_c: { id: 'temperature_c', label: 'Body temperature', unit: '°C', digits: 1, min: 30, max: 43, minSpan: 1.5, color: 'temp' },
  sleep_hours: { id: 'sleep_hours', label: 'Sleep', unit: 'h', digits: 1, min: 0, max: 24, minSpan: 4, color: 'sleep' },
  glucose_mg_dl: { id: 'glucose_mg_dl', label: 'Blood glucose', unit: 'mg/dL', digits: 0, min: 20, max: 600, minSpan: 40, color: 'glucose' },
  hrv_ms: { id: 'hrv_ms', label: 'HRV', unit: 'ms', digits: 0, min: 1, max: 300, minSpan: 20, color: 'hrv' },
  stress_score: { id: 'stress_score', label: 'Stress (self-report)', unit: '/10', digits: 0, min: 0, max: 10, minSpan: 4, color: 'stress' },
  fatigue_score: { id: 'fatigue_score', label: 'Fatigue (self-report)', unit: '/10', digits: 0, min: 0, max: 10, minSpan: 4, color: 'fatigue' },
}

/** Views shown in History & trends. BP is one view with two series. */
export interface TrendView { id: string; label: string; metrics: Metric[] }
export const TREND_VIEWS: TrendView[] = [
  { id: 'hr', label: 'Heart rate', metrics: ['heart_rate_bpm'] },
  { id: 'bp', label: 'Blood pressure', metrics: ['systolic_bp_mmhg', 'diastolic_bp_mmhg'] },
  { id: 'spo2', label: 'SpO₂', metrics: ['spo2_pct'] },
  { id: 'temp', label: 'Temperature', metrics: ['temperature_c'] },
  { id: 'sleep', label: 'Sleep', metrics: ['sleep_hours'] },
  { id: 'glucose', label: 'Glucose', metrics: ['glucose_mg_dl'] },
  { id: 'stress', label: 'Stress', metrics: ['stress_score'] },
  { id: 'fatigue', label: 'Fatigue', metrics: ['fatigue_score'] },
  { id: 'hrv', label: 'HRV', metrics: ['hrv_ms'] },
]

export function fmtValue(metric: Metric, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toFixed(METRICS[metric].digits)
}
