import { Route } from 'lucide-react'
import type { Assessment } from '../../types/api'
import { fmtDateTime } from '../../lib/format'
import { SimBadge, StatusBadge, statusColor } from './primitives'

/** Assessment with explicit "what changed" / "what to do next" separation. */
export function AssessmentCard({ a, compact }: { a: Assessment; compact?: boolean }) {
  const color = statusColor(a.status)
  return (
    <article className="card" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={a.status} />
        {a.is_simulated && <SimBadge label="Simulated" />}
        <span className="ml-auto text-xs text-ink-dim">{fmtDateTime(a.created_at)}</span>
      </div>
      <h3 className="mt-3 text-base font-semibold">{a.title}</h3>
      <p className="mt-1 text-sm text-ink-dim">{a.summary}</p>
      {!compact && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <p className="card-title">What changed</p>
            {a.contributors.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {a.contributors.map((c) => (
                  <li key={c} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />{c}</li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-ink-dim">No contributing observations listed.</p>}
          </div>
          <div className="rounded-lg bg-panel2 p-3">
            <p className="card-title flex items-center gap-1.5"><Route className="h-3.5 w-3.5" aria-hidden /> What to do next</p>
            <p className="mt-2 text-sm">{a.next_action}</p>
          </div>
        </div>
      )}
      {compact && <p className="mt-3 text-sm"><span className="font-semibold">Next: </span>{a.next_action}</p>}
    </article>
  )
}
