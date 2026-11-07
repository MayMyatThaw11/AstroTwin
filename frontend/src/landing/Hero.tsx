import { useEffect, useRef } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { HeroArt } from './HeroArt'
import { APP_URL } from './LandingHeader'

export function Hero() {
  const art = useRef<HTMLDivElement>(null)

  // Very gentle parallax, skipped for reduced motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        art.current?.style.setProperty('--py', String(Math.min(window.scrollY, 900) * 0.06))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  return (
    <section id="top" className="relative flex min-h-[100svh] flex-col px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4 lg:px-6 lg:pb-6 lg:pt-6" aria-labelledby="hero-title">
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden rounded-md lg:flex-row">
        {/* decorative frame: above the artwork, never intercepts clicks */}
        <div className="pointer-events-none absolute inset-0 z-20 rounded-md border border-ink/25" aria-hidden />
        <div className="stars" aria-hidden />
        <div className="hero-sky pointer-events-none absolute inset-0" aria-hidden />

        <div className="relative z-10 flex flex-col justify-center px-6 pb-8 pt-28 sm:px-12 sm:pt-32 lg:w-[52%] lg:pb-32 lg:pt-36 lg:pl-16 lg:pr-0">
          <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.26em] text-ink-dim sm:text-[11px]">
            <span className="h-px w-8 bg-cyan sm:w-14" aria-hidden />AstroTwin AI / Human spaceflight health
          </p>
          <h1 id="hero-title" className="hero-title mt-6 uppercase">
            Your health.<br />Beyond Earth.
          </h1>
          <p className="mt-6 max-w-[34rem] text-[15px] leading-relaxed text-ink-dim sm:text-lg">
            A personal health companion for astronauts—turning vital signs, daily check-ins, and mission context into clear, actionable insights.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href={APP_URL} className="l-btn l-btn-primary">Open mission dashboard <ArrowRight className="h-4 w-4" aria-hidden /></a>
            <a href="#mission" className="l-btn l-btn-ghost">Explore the system</a>
          </div>
          <p className="mt-8 text-xs text-ink-dim">Simulated mission data · Decision-support prototype · Not a diagnosis</p>
        </div>

        <div ref={art} className="hero-art pointer-events-none relative h-[340px] w-full sm:h-[460px] lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[50%]">
          <HeroArt />
        </div>

        <a href="#mission" className="absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1 text-[10px] font-semibold uppercase tracking-[.25em] text-ink-dim hover:text-cyan lg:flex" aria-label="Scroll to next section">
          Scroll <ChevronDown className="h-4 w-4 text-cyan" aria-hidden />
        </a>
      </div>
    </section>
  )
}
