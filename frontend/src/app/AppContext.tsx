import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, isDemoFallback, setDemoFallback } from '../api/client'
import { setBackendOnline } from '../health/service'
import type { Astronaut } from '../types/api'

export type PageId = 'overview' | 'monitor' | 'checkin' | 'twin' | 'trends' | 'alerts' | 'environment'
export type Conn = 'checking' | 'online' | 'demo'

interface Ctx {
  page: PageId
  go: (p: PageId) => void
  astronauts: Astronaut[]
  astronautsError: string | null
  selectedId: string | null
  selected: Astronaut | null
  select: (id: string) => void
  conn: Conn
  mode: string | null
  /** Bumped after a saved check-in so every page refetches. */
  version: number
  bump: () => void
  recheck: () => void
}

const AppCtx = createContext<Ctx | null>(null)

const PAGES: PageId[] = ['overview', 'monitor', 'checkin', 'twin', 'trends', 'alerts', 'environment']

function pageFromHash(): PageId {
  const h = window.location.hash.replace('#/', '').replace('#', '')
  return (PAGES as string[]).includes(h) ? (h as PageId) : 'overview'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageId>(pageFromHash)
  const [astronauts, setAstronauts] = useState<Astronaut[]>([])
  const [astronautsError, setAstronautsError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [conn, setConn] = useState<Conn>('checking')
  const [mode, setMode] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((p: PageId) => {
    window.location.hash = `#/${p}`
    setPage(p)
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    let alive = true
    setConn('checking')
    setAstronautsError(null)
    setDemoFallback(false)
    api.health()
      .then((h) => { if (alive) { setConn('online'); setMode(`${h.mode} · ${h.data_source}`) } })
      .catch(() => { /* astronauts call below decides fallback */ })
    api.astronauts()
      .then((r) => {
        if (!alive) return
        setAstronauts(r.items)
        setSelectedId((cur) => (cur && r.items.some((a) => a.id === cur) ? cur : (r.items[0]?.id ?? null)))
        if (isDemoFallback()) { setConn('demo'); setMode(null) } else setConn((c) => (c === 'checking' ? 'online' : c))
      })
      .catch((e: Error) => { if (alive) { setAstronautsError(e.message); setConn('online') } })
    return () => { alive = false }
  }, [attempt])

  useEffect(() => { setBackendOnline(conn === 'online') }, [conn])

  const value = useMemo<Ctx>(() => ({
    page, go, astronauts, astronautsError, selectedId,
    selected: astronauts.find((a) => a.id === selectedId) ?? null,
    select: setSelectedId, conn, mode, version,
    bump: () => setVersion((v) => v + 1),
    recheck: () => setAttempt((a) => a + 1),
  }), [page, go, astronauts, astronautsError, selectedId, conn, mode, version])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}
