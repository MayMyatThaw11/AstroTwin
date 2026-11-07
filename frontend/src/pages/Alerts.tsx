import { useEffect, useState } from 'react'
import { Check, Copy, FileText, Loader2, Printer } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../app/AppContext'
import { AssessmentCard } from '../components/ui/AssessmentCard'
import { EmptyState, ErrorState, LoadingState, PageHeader, SimBadge } from '../components/ui/primitives'
import { fmtDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { MedicalSummary } from '../types/api'

export function Alerts() {
  const { selectedId, selected, version, conn } = useApp()
  const al = useAsync(() => (selectedId ? api.alerts(selectedId) : Promise.reject(new Error('none'))), [selectedId, version])
  const [summary, setSummary] = useState<MedicalSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { setSummary(null); setErr(null) }, [selectedId, version])

  async function generate() {
    if (!selectedId || busy) return
    setBusy(true); setErr(null)
    try { setSummary(await api.summary(selectedId)) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function copy() {
    if (!summary) return
    try { await navigator.clipboard.writeText(summary.report_text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { setErr('Copy is not available in this browser. Select the text and copy manually.') }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Alerts & medical summary" sub={selected ? `${selected.name} · reasons and provenance shown for every alert` : undefined} />

      <section aria-label="Alerts" className="space-y-3">
        {al.loading ? <LoadingState />
          : al.error || !al.data ? <ErrorState message={al.error?.message ?? 'No data.'} onRetry={al.reload} />
          : al.data.items.length === 0 ? <EmptyState title="No alerts" body="Nothing needs review right now." />
          : al.data.items.map((a) => <AssessmentCard key={a.id} a={a} />)}
      </section>

      <section aria-label="Medical summary" className="card">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Medical summary</h2>
          <span className="rounded-md border border-hair bg-panel2 px-2 py-0.5 text-xs font-semibold text-ink-dim">Prepared locally — not transmitted</span>
          <button className="btn-primary ml-auto" onClick={generate} disabled={busy || !selectedId}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <FileText className="h-5 w-5" aria-hidden />} Generate medical summary
          </button>
        </div>
        {conn === 'demo' && <p className="mt-3 text-sm text-st-review">Demo fallback — sample text only, not saved.</p>}
        {err && <p role="alert" className="mt-3 text-sm text-st-escalate">{err}</p>}
        {summary && (
          <div className="print-area mt-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
              Generated {fmtDateTime(summary.generated_at)} {summary.is_simulated && <SimBadge label="Simulated" />}
              {!summary.transmitted && <span>· Not transmitted to anyone</span>}
            </div>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-space p-4 text-sm leading-relaxed" tabIndex={0} aria-label="Medical summary text">{summary.report_text}</pre>
            <div className="no-print mt-3 flex flex-wrap gap-3">
              <button className="btn-ghost" onClick={copy}>{copied ? <Check className="h-5 w-5 text-st-stable" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}{copied ? 'Copied' : 'Copy summary'}</button>
              <button className="btn-ghost" onClick={() => window.print()}><Printer className="h-5 w-5" aria-hidden /> Print</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
