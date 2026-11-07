import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../../app/AppContext'
import { LogoMark, Wordmark } from './Logo'
import { NAV } from './nav'

export function Sidebar() {
  const { page, go } = useApp()
  const [collapsed, setCollapsed] = useState(false)
  // Tablet widths always render the compact rail; desktop honours the toggle.
  const wide = !collapsed
  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-hair bg-panel md:flex ${wide ? 'md:w-16 xl:w-[272px]' : 'md:w-16'}`}
      aria-label="Primary"
    >
      <div className="planet planet-side hidden xl:block" aria-hidden />
      <div className="relative z-10 flex h-20 items-center gap-3 border-b border-hair px-4 xl:px-6">
        <a href="/" className="flex items-center gap-3" aria-label="AstroTwin AI home">
          <LogoMark />
          {wide && <span className="hidden xl:inline"><Wordmark /></span>}
        </a>
      </div>
      <nav className="relative z-10 flex-1 space-y-1.5 px-2 py-5 xl:px-3">
        {NAV.map(({ id, label, Icon }) => {
          const active = page === id
          return (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={active ? 'page' : undefined}
              title={label}
              className={`relative flex min-h-[48px] w-full items-center gap-3.5 rounded-xl px-3.5 text-[15px] font-medium transition-colors ${active ? 'bg-cyan/10 text-cyan' : 'text-ink-dim hover:bg-panel2 hover:text-ink'}`}
            >
              {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-cyan" aria-hidden />}
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className={wide ? 'hidden xl:inline' : 'sr-only'}>{label}</span>
            </button>
          )
        })}
      </nav>
      <div className="relative z-10 hidden border-t border-hair p-2 xl:block">
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-sm text-ink-dim hover:bg-panel2 hover:text-ink"
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden /> : <><PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />Collapse</>}
        </button>
      </div>
    </aside>
  )
}
