import { useApp } from '../../app/AppContext'
import { NAV } from './nav'

export function MobileNav() {
  const { page, go } = useApp()
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-hair bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {NAV.map(({ id, short, Icon }) => {
        const active = page === id
        return (
          <button
            key={id}
            onClick={() => go(id)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${active ? 'text-cyan' : 'text-ink-dim'}`}
          >
            {active && <span className="absolute inset-x-4 top-0 h-[2px] rounded-b bg-cyan" aria-hidden />}
            <Icon className="h-5 w-5" aria-hidden />
            {short}
          </button>
        )
      })}
    </nav>
  )
}
