import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'astrotwin-theme'

function initial(): Theme {
  const attr = document.documentElement.dataset.theme
  if (attr === 'light' || attr === 'dark') return attr
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'light' || s === 'dark') return s
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Colours for SVG/chart code, which can't use Tailwind classes. Mirrors the CSS variables. */
export interface ChartPalette {
  grid: string; axis: string; tipBg: string; tipBorder: string; tipText: string
  hr: string; sleep: string; temp: string; stress: string; baseline: string
  spo2: string; glucose: string; fatigue: string; hrv: string; bp2: string
}
const PALETTES: Record<Theme, ChartPalette> = {
  dark: { grid: 'rgba(170,198,225,.12)', axis: '#AAB8CE', tipBg: '#142236', tipBorder: 'rgba(170,198,225,.25)', tipText: '#F2F7FF', hr: '#F0707C', sleep: '#36CDEB', temp: '#8FD8E8', stress: '#F2BE5C', baseline: '#AAB8CE', spo2: '#5CD6A4', glucose: '#B79CFF', fatigue: '#F29B5C', hrv: '#7FB4FF', bp2: '#8FD8E8' },
  light: { grid: 'rgba(11,33,59,.10)', axis: '#50647C', tipBg: '#FFFFFF', tipBorder: 'rgba(11,33,59,.2)', tipText: '#0B213B', hr: '#BE3242', sleep: '#0089AD', temp: '#0B213B', stress: '#925E00', baseline: '#50647C', spo2: '#0F8058', glucose: '#6B4FC4', fatigue: '#B35A00', hrv: '#1F5FBF', bp2: '#0089AD' },
}

interface Ctx { theme: Theme; toggle: () => void; chart: ChartPalette }
const ThemeCtx = createContext<Ctx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])
  const value = useMemo<Ctx>(() => ({
    theme, chart: PALETTES[theme],
    toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
  }), [theme])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme(): Ctx {
  const c = useContext(ThemeCtx)
  if (!c) throw new Error('useTheme outside provider')
  return c
}
