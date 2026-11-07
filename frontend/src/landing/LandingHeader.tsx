import { useEffect, useState } from 'react'
import { Menu, Moon, Sun, X } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { LogoMark, Wordmark } from '../components/layout/Logo'

export const APP_URL = '/app#/overview'

const LINKS = [
  { id: 'mission', label: 'The mission' },
  { id: 'how', label: 'How it works' },
  { id: 'capabilities', label: 'Capabilities' },
]

export function LandingHeader() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const { theme, toggle } = useTheme()
  const themeBtn = (
    <button onClick={toggle} className="flex h-11 w-11 items-center justify-center text-ink-dim transition-colors hover:text-cyan" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  )

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id) }),
      { rootMargin: '-45% 0px -50% 0px' },
    )
    LINKS.forEach((l) => { const el = document.getElementById(l.id); if (el) io.observe(el) })
    return () => { window.removeEventListener('scroll', onScroll); io.disconnect() }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const link = (active: boolean) =>
    `text-[11px] font-medium uppercase tracking-[.18em] transition-colors hover:text-cyan ${active ? 'text-cyan' : 'text-ink-dim'}`

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all ${scrolled || open ? 'bg-space/85 pt-0 backdrop-blur' : 'px-3 pt-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6'}`}>
      {/* Same insets as the hero frame, so the row sits fully inside it with clear space above and below */}
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-6 sm:h-[72px] sm:px-9 lg:h-20 lg:px-14">
        <a href="#top" className="flex items-center gap-2.5" aria-label="AstroTwin AI, back to top">
          <LogoMark size={28} /><Wordmark />
        </a>

        <nav className="hidden items-center gap-9 md:flex" aria-label="Landing">
          {LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`} className={link(active === l.id)} aria-current={active === l.id ? 'true' : undefined}>{l.label}</a>
          ))}
          <a href={APP_URL} className="border border-ink/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[.18em] text-ink transition-colors hover:border-cyan hover:text-cyan">Launch app</a>
          {themeBtn}
        </nav>

        <div className="flex items-center md:hidden">
        {themeBtn}
        <button
          className="flex h-11 w-11 items-center justify-center text-ink"
          aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Landing mobile" className="border-t border-hair bg-space/95 px-5 pb-6 pt-2 md:hidden">
          {LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`} onClick={() => setOpen(false)} className="flex min-h-[48px] items-center border-b border-hair text-xs font-medium uppercase tracking-[.18em] text-ink">{l.label}</a>
          ))}
          <a href={APP_URL} className="mt-4 flex min-h-[48px] items-center justify-center bg-cyan text-xs font-semibold uppercase tracking-[.18em] text-on-accent">Launch app</a>
        </nav>
      )}
    </header>
  )
}
