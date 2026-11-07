import type { TrendPoint } from '../../types/api'
import { TrendChart } from './TrendChart'

export function HeartRateChart({ points, baseline }: { points: TrendPoint[]; baseline?: number | null }) {
  return <TrendChart title="Resting heart rate" unit="bpm" dataKey="resting_heart_rate_bpm" points={points} color="hr" baseline={baseline} />
}
