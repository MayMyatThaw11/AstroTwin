import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import Landing from './landing/Landing'
import { ThemeProvider } from './lib/theme'
import './styles/index.css'

// "/" is the landing page; the app lives at "/app". Old "/#/overview"-style links still open the app.
const APP_HASH = /^#\/(overview|monitor|checkin|twin|trends|alerts|environment)/
const { pathname, hash } = window.location
const isApp = pathname.replace(/\/+$/, '') === '/app' || APP_HASH.test(hash)

createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider>{isApp ? <App /> : <Landing />}</ThemeProvider></StrictMode>)
