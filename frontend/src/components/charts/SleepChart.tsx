import type { TrendPoint } from '../../types/api'
import { TrendChart } from './TrendChart'

export function SleepChart({ points, baseline }: { points: TrendPoint[]; baseline?: number | null }) {
  return <TrendChart title="Sleep" unit="h" dataKey="sleep_hours" points={points} color="sleep" digits={1} baseline={baseline} />
}
