import { Moon, Sun } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { useTheme } from '../../lib/theme'
import { LogoMark, Wordmark } from './Logo'

export function Topbar() {
  const { astronauts, selectedId, select, selected } = useApp()
  const { theme, toggle } = useTheme()
  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-panel/80 backdrop-blur">
      <div className="flex min-h-[64px] flex-wrap sm:min-h-[80px] items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2 md:hidden">
          <LogoMark size={28} /><Wordmark />
        </div>
        <div className="hidden min-w-0 md:block">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-ink-dim">Mission · {selected?.mission ?? 'Mars Transit'}</p>
          <p className="font-display text-xl font-semibold tracking-tight">Day {selected?.mission_day ?? '—'}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            className="field w-auto max-w-[190px] py-0 pr-8 text-sm"
            value={selectedId ?? ''}
            onChange={(e) => select(e.target.value)}
            disabled={astronauts.length === 0}
            aria-label="Select astronaut"
          >
            {astronauts.length === 0 && <option value="">No crew</option>}
            {astronauts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button
            onClick={toggle}
            className="btn-ghost !px-0 w-11"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        </div>
      </div>
    </header>
  )
}
