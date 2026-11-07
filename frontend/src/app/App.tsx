import { AppProvider, useApp } from './AppContext'
import { MobileNav } from '../components/layout/MobileNav'
import { Sidebar } from '../components/layout/Sidebar'
import { Topbar } from '../components/layout/Topbar'
import { Alerts } from '../pages/Alerts'
import { DailyCheckIn } from '../pages/DailyCheckIn'
import { Environment } from '../pages/Environment'
import { HealthTwin } from '../pages/HealthTwin'
import { Monitoring } from '../pages/Monitoring'
import { Overview } from '../pages/Overview'
import { Trends } from '../pages/Trends'

function Shell() {
  const { page, selectedId } = useApp()
  return (
    <div className="app-atmosphere flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-cyan focus:px-3 focus:py-2 focus:text-on-accent">Skip to content</a>
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="planet planet-top" aria-hidden />
        <Topbar />
        <main id="main" className="relative z-10 mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 pb-28 sm:px-6 md:pb-8">
          {/* key forces a clean remount when the astronaut changes */}
          <div key={`${page}-${selectedId}`}>
            {page === 'overview' && <Overview />}
            {page === 'monitor' && <Monitoring />}
            {page === 'checkin' && <DailyCheckIn />}
            {page === 'twin' && <HealthTwin />}
            {page === 'trends' && <Trends />}
            {page === 'alerts' && <Alerts />}
            {page === 'environment' && <Environment />}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>
}
