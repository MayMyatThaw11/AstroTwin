import { Activity, BellRing, ClipboardPlus, HeartPulse, LayoutDashboard, PersonStanding } from 'lucide-react'
import type { PageId } from '../../app/AppContext'

export const NAV: { id: PageId; label: string; short: string; Icon: typeof Activity }[] = [
  { id: 'overview', label: 'Mission Overview', short: 'Overview', Icon: LayoutDashboard },
  { id: 'monitor', label: 'Health Monitoring', short: 'Monitor', Icon: HeartPulse },
  { id: 'checkin', label: 'Daily Check-in', short: 'Check-in', Icon: ClipboardPlus },
  { id: 'twin', label: 'My Health Twin', short: 'Twin', Icon: PersonStanding },
  { id: 'trends', label: 'History & Trends', short: 'Trends', Icon: Activity },
  { id: 'alerts', label: 'Alerts & Summary', short: 'Alerts', Icon: BellRing },
]
