import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useReveal } from './useReveal'
import { APP_URL } from './LandingHeader'

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useReveal<HTMLDivElement>()
  return <div ref={ref} className={`reveal ${className}`}>{children}</div>
}

function Overline({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[.28em] text-cyan">{children}</p>
}

const wrap = 'mx-auto w-full max-w-[1200px] px-6 sm:px-10'

/* ---------- Why it matters ---------- */
const HAZARDS = [
  ['Radiation', 'Beyond Earth’s magnetic field, crews absorb more ionizing radiation than on the ground. Its effects build quietly over a long mission.'],
  ['Altered gravity', 'Weightlessness shifts body fluids and unloads muscle and bone, which is why daily exercise is part of the job and heart rate and fatigue are worth watching.'],
  ['Isolation and confinement', 'Months in a small crew change sleep, mood and stress. These are self-reported, so they only show up if someone asks every day.'],
  ['Distance from Earth', 'Messages take minutes each way and there is no quick trip home. Crews need clear answers on board, not only from mission control.'],
  ['Hostile, closed environments', 'Cabin air, noise, light and temperature are all managed by the vehicle itself. Small shifts can disturb rest long before anyone feels unwell.'],
] as const

export function HazardsSection() {
  return (
    <section id="mission" className="relative border-t border-hair py-24 sm:py-32" aria-labelledby="mission-title">
      <div className={wrap}>
        <Reveal>
          <Overline>Why it matters</Overline>
          <h2 id="mission-title" className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Space is hard on the human body.</h2>
          <p className="mt-5 max-w-2xl text-ink-dim">
            Spaceflight research groups the risks into five hazards. Together they reshape how an astronaut sleeps, recovers and copes, usually gradually, and usually before any single reading looks alarming.
          </p>
        </Reveal>
        <ol className="mt-14 border-t border-hair">
          {HAZARDS.map(([title, body], i) => (
            <li key={title}>
              <Reveal className="grid gap-3 border-b border-hair py-7 md:grid-cols-[80px_minmax(0,1fr)_minmax(0,1.4fr)] md:gap-8">
                <span className="text-sm tabular-nums text-ink-dim">0{i + 1}</span>
                <h3 className="text-xl font-medium tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-dim sm:text-[15px]">{body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ---------- How it works ---------- */
const STEPS = [
  ['Collect', 'Resting heart rate, temperature, sleep and a short daily self-report.'],
  ['Compare', 'Each reading is set against that astronaut’s own recent baseline, not a population average.'],
  ['Explain', 'Changes are listed in plain language, with the reasons behind them.'],
  ['Act', 'A suggested next step, pointing back to approved crew medical guidance.'],
] as const

function ExampleChart() {
  const pts = [65, 67, 66, 72, 76, 80, 84]
  const x = (i: number) => 20 + i * 50
  const y = (v: number) => 130 - ((v - 60) / 30) * 110
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ')
  return (
    <svg viewBox="0 0 340 150" className="w-full" role="img" aria-label="Illustrative example: resting heart rate rising from 65 to 84 beats per minute over seven days, above a dashed baseline at 65.">
      <line x1="20" x2="320" y1={y(65)} y2={y(65)} stroke="rgb(var(--dim))" strokeDasharray="4 4" strokeOpacity=".8" />
      <text x="322" y={y(65) - 4} textAnchor="end" fontSize="9" fill="rgb(var(--dim))">baseline 65</text>
      <path d={d} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.8" strokeLinejoin="round" />
      {pts.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === 6 ? 4 : 2} fill={i === 6 ? 'rgb(var(--st-escalate))' : 'rgb(var(--accent))'} />)}
      <text x={x(6) - 8} y={y(84) - 8} textAnchor="end" fontSize="10" fill="rgb(var(--ink))">84 bpm</text>
    </svg>
  )
}

export function HowItWorks() {
  return (
    <section id="how" className="relative border-t border-hair bg-panel py-24 sm:py-32" aria-labelledby="how-title">
      <div className={wrap}>
        <Reveal>
          <Overline>How AstroTwin works</Overline>
          <h2 id="how-title" className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Collect. Compare. Explain. Act.</h2>
        </Reveal>

        <ol className="mt-14 grid gap-px bg-ink/15 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="bg-panel py-6 sm:px-6 sm:first:pl-0 lg:py-2">
              <Reveal>
                <p className="text-xs tabular-nums text-cyan">Step {i + 1}</p>
                <h3 className="mt-2 text-xl font-medium uppercase tracking-wide">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{b}</p>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal className="mt-16 grid gap-10 border border-hair p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[.2em] text-ink-dim">Illustrative example · simulated</p>
            <h3 className="mt-3 text-xl font-medium">A baseline deviation, explained</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-dim">
              Resting heart rate has climbed 19 bpm over this astronaut’s own baseline across a week, while sleep has shortened. AstroTwin marks the status <span className="text-ink">Review</span>, lists both changes, and suggests a recheck after rest.
            </p>
            <p className="mt-4 text-sm text-ink-dim">It flags a change worth looking at. It does not diagnose anything.</p>
          </div>
          <ExampleChart />
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- Capabilities ---------- */
const CAPS = [
  ['Personal baseline', 'Every comparison starts from the astronaut’s own recent readings, so normal means normal for them.'],
  ['Daily health check', 'Seven short inputs in two minutes: vitals, sleep, mood, fatigue, pain, and any concerning symptom.'],
  ['Health twin body map', 'A zone-by-zone view of cardiovascular, sleep, wellness and musculoskeletal signals. Educational, not a medical scan.'],
  ['Trends', 'Seven- and thirty-day charts with the baseline drawn in, and honest gaps where a reading is missing.'],
  ['Explainable alerts', 'Each status shows what changed and what to do next. There are no hidden scores and no invented confidence figures.'],
  ['Mission context', 'Day-of-mission and crew role sit beside the numbers, so a reading is read in context.'],
] as const

export function Capabilities() {
  return (
    <section id="capabilities" className="relative border-t border-hair py-24 sm:py-32" aria-labelledby="cap-title">
      <div className={wrap}>
        <Reveal>
          <Overline>Core capabilities</Overline>
          <h2 id="cap-title" className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">Built around one astronaut at a time.</h2>
        </Reveal>
        <ul className="mt-14 space-y-2">
          {CAPS.map(([t, b], i) => (
            <li key={t}>
              <Reveal className={`flex flex-col gap-3 border-t border-hair py-8 md:flex-row md:items-baseline md:gap-14 ${i % 2 ? 'md:flex-row-reverse md:text-right' : ''}`}>
                <h3 className="text-2xl font-medium tracking-tight md:w-[42%]"><span className="mr-3 text-sm tabular-nums text-cyan">0{i + 1}</span>{t}</h3>
                <p className="max-w-xl text-[15px] leading-relaxed text-ink-dim md:flex-1">{b}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------- Final CTA + footer ---------- */
export function FinalCta() {
  return (
    <section className="relative border-t border-hair py-24 text-center sm:py-32" aria-labelledby="cta-title">
      <div className={wrap}>
        <Reveal>
          <h2 id="cta-title" className="mx-auto max-w-3xl text-3xl font-semibold uppercase tracking-tight sm:text-5xl">See your twin in action.</h2>
          <p className="mx-auto mt-5 max-w-xl text-ink-dim">Open the working prototype, pick a simulated crew member and run a daily check-in.</p>
          <div className="mt-9 flex justify-center">
            <a href={APP_URL} className="l-btn l-btn-primary">Open mission dashboard <ArrowRight className="h-4 w-4" aria-hidden /></a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function LandingFooter() {
  return (
    <footer className="border-t border-hair px-6 py-10 text-xs leading-relaxed text-ink-dim sm:px-10">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 md:flex-row md:justify-between">
        <p className="max-w-xl">
          Built for the NASA Space Apps Challenge. Background on spaceflight health risks draws on public research from the NASA Human Research Program. AstroTwin AI is an independent prototype and is not endorsed by or affiliated with NASA.
        </p>
        <p className="md:text-right">Simulated mission data · Decision-support prototype · Not a diagnosis</p>
      </div>
    </footer>
  )
}
