# AstroTwin AI — Frontend Implementation Report

Location: `D:\AstroTwin\frontend`
Stack: React + Vite + TypeScript + Tailwind v3 + Recharts + lucide-react (Inter Variable and Space Grotesk Variable bundled locally)
Scope rule followed throughout: frontend only. No backend file was modified. All existing features were preserved.

---

## 1. Summary of work (in order)

| # | Request | Outcome |
|---|---------|---------|
| 1 | Initial frontend from `ASTROTWIN_AI_FRONTEND_CLAUDE.md` | Overview, Daily Check-in, Health Twin, Trends, Alerts; API client with demo fallback |
| 2 | UI redesign brief + palette (light and dark) | Token-based themes, professional interactive SVG body map replacing the awkward 3D section |
| 3 | Cinematic landing spec | Landing page with hero, hazards, how-it-works, capabilities, final CTA, footer, scroll reveals |
| 4 | Final UI redesign (cinematic astronaut reference) | Landing and dashboard unified under the same tokens; light and dark themes |
| 5 | Dashboard pixel reference | Sidebar, topbar, overview grid and metric tiles matched to the reference |
| 6 | Remove disclaimer strip and "Demo fallback - no saved" | Both removed from the topbar |
| 7 | Health Trends + Real-time Monitoring | New Monitoring page, rebuilt Trends page, local health data layer |
| 8 | Landing header/hero frame overlap | Frame is now a separate decorative layer, header aligned to the frame insets |

---

## 2. Architecture

### Routing (no router library)
- `src/main.tsx`: pathname `/app`, or a hash matching `#/(overview|monitor|checkin|twin|trends|alerts)`, renders `<App/>`. Anything else renders `<Landing/>`.
- App pages switch via URL hash (`AppContext`: `page`, `go`).
- Landing CTA target: `/app#/overview`.

### Theming
- CSS variables as RGB triplets in `src/styles/index.css` under `:root[data-theme='dark'|'light']`.
- Mapped in `tailwind.config.js` with `rgb(var(--x) / <alpha-value>)`.
- Theme is saved in `localStorage` key `astrotwin-theme`. An inline script in `index.html` sets it before first paint to avoid a flash.
- `ThemeProvider` (in `main.tsx`) is shared by landing and app. `useTheme()` returns `{ theme, toggle, chart }`, where `chart` is the JS palette for Recharts.

### API layer
- `src/api/client.ts`: `api.*`, `ApiError`, base URL from `VITE_API_BASE_URL` (default `http://localhost:8000/api/v1`).
- Offline behaviour: **GET requests only** fall back to bundled sample data (`src/api/fallback.ts`), labelled "DEMO FALLBACK · SAMPLE DATA". `checkin` (POST) is never faked; a failure is reported honestly.
- Sample astronauts: AST-001 (review), AST-002 (stable), AST-003 (insufficient data).
- The backend has **not** been tested end to end.

### Health data layer (new, frontend-only) — `src/health/`
- `types.ts`: `Metric`, `MeasurementSource`, `Observation` (with optional `sessionId`), `HealthAdapter`.
- `metrics.ts`: metric definitions (unit, digits, entry-bound min/max), `TREND_VIEWS` (blood pressure shown as two series), `fmtValue`.
- `seed.ts`: deterministic seeded 30-day demo history per astronaut, regenerated each day, source `demo_seed`.
- `service.ts`:
  - `localAdapter`: stores **only user-added observations** in `localStorage` key `astrotwin-health-v1`. Simulated samples are capped at 200 per astronaut.
  - `httpAdapterStub`: throws "not implemented", reserved for the agreed backend contract.
  - `useObservations`: built on `useSyncExternalStore`.
  - Calculations: `median`, `dayKey`, `dailyRows`, `baselineFor`, `explainTrend`, `toCsv`.

### Calculation rules
- **Daily value** = median of that local day's readings. A day with no readings is `null` (a gap), never zero and never interpolated.
- **Personal baseline** = median of daily medians over the 28 days before the most recent 3 days. It needs readings on at least 5 of those days. Otherwise: "Baseline unavailable — insufficient observations".
- **Explanation** is descriptive only: no clinical thresholds, no diagnosis. A difference under 2% of the reference is described as "close to" the reference.

---

## 3. Pages and behaviour

### Landing (`src/landing/*`)
- Fixed header with scroll-spy, mobile menu and theme toggle.
- Hero with theme-specific local WebP art (loaded only after a successful preload), parallax with a reduced-motion guard, reveal-on-scroll.
- Frame fix: the border is its own `pointer-events-none absolute inset-0 z-20` layer. Header insets match the frame. Header row height is `h-[72px]` on mobile and tablet and `lg:h-20` on desktop.
- Measured: at 1440px the Launch App button is about 21px below the frame top line. At 390px the menu button is about 14px below it. No horizontal overflow at either width.

### Dashboard shell
- Sidebar (272px at xl, logo links to `/`), Topbar (80px: mission label, crew select, theme toggle), mobile bottom nav (6 items, 10px labels).
- Nav items: Mission Overview, Health Monitoring, Daily Check-in, My Health Twin, History & Trends, Alerts & Summary.

### Overview / Check-in / Health Twin / Alerts
- Use the **API** (or sample fallback). They do **not** read the local health store.
- Health Twin uses a custom interactive SVG body map plus a zone detail panel.

### Health Monitoring (new)
- Hero card with the API assessment and next action.
- Reading cards: heart rate, SpO₂, stress, blood pressure, each with source and time.
- Heart-rate recent readings chart (ordered by reading, not time-scaled; labelled as such).
- 7-day context chart selector: Sleep, SpO₂, HRV, Stress.
- "All measurements" grid.
- **Manual entry dialog**: nine metrics, blood pressure as a pair (systolic must exceed diastolic), range checks, no future times, optional notes. Saves with source `manual` and the message "Saved locally (demo mode)".
- **Simulated stream** (off by default), labelled "SIMULATED · NOT A REAL SENSOR". Start/Pause/Reset. A tick every 4000 ms, cleaned up on pause and on astronaut change.
- Storage-failure banner if `localStorage` is unavailable.

### History & Trends (rebuilt)
- 7/30-day toggle, CSV export of the filtered window, metric tabs.
- Chart with gaps (`connectNulls={false}`), dashed personal-baseline line, sparse-data notice, tooltip with source, count and baseline.
- Explanation card: what changed, for how long, compared with what, suggested next action (taken from the API assessment).
- "All metrics" cards and recent status events from the API.

---

## 4. File inventory

**Created for health trends/monitoring**
- `src/health/types.ts`, `metrics.ts`, `seed.ts`, `service.ts`
- `src/components/health/HealthChart.tsx`, `MeasurementDialog.tsx`
- `src/pages/Monitoring.tsx`

**Modified in the latest round**
- `src/pages/Trends.tsx` (rewritten)
- `src/lib/theme.tsx` (extended chart palettes)
- `src/app/AppContext.tsx` (`monitor` page id)
- `src/app/App.tsx`, `src/main.tsx`
- `src/components/layout/nav.tsx`, `MobileNav.tsx`
- `src/landing/LandingHeader.tsx`, `src/landing/Hero.tsx`

**Earlier rounds (full list)**
- Config: `package.json`, `tsconfig.json`, `vite.config.ts`, `postcss.config.js`, `tailwind.config.js`, `index.html`, `.env`, `.env.example`, `README.md`, `public/favicon.svg`
- Styles: `src/styles/index.css`, `src/landing/landing.css`
- API/lib: `src/api/client.ts`, `src/api/fallback.ts`, `src/types/api.ts`, `src/lib/format.ts`, `src/lib/useAsync.ts`
- Layout: `Sidebar.tsx`, `Topbar.tsx`, `Logo.tsx`
- UI: `src/components/ui/primitives.tsx`, `AssessmentCard.tsx`
- Charts: `TrendChart.tsx`, `HeartRateChart.tsx`, `SleepChart.tsx`
- Health Twin: `BodyZoneMap.tsx`, `ZoneDetailPanel.tsx`
- Pages: `Overview.tsx`, `DailyCheckIn.tsx`, `HealthTwin.tsx`, `Alerts.tsx`
- Landing: `Landing.tsx`, `Hero.tsx`, `HeroArt.tsx`, `Sections.tsx`, `ProductPreview.tsx`, `useReveal.ts`
- Assets: `public/images/astronaut-hero-dark.webp`, `astronaut-hero-light.webp`, `public/images/README.txt`
- Outside `frontend/`: `D:\AstroTwin\.claude\launch.json` (preview config only)

---

## 5. Verification status

**Verified**
- `npm run build` passes.
- Scripted browser checks:
  - Manual-entry validation: heart rate 900 rejected, 91 saved.
  - Saved entry appears in the `astrotwin-health-v1` storage key.
  - Simulator starts, adds readings every ~4 s, pauses with no extra ticks and no duplicates.
  - Per-astronaut isolation.
  - 7/30-day toggle changes the data window.
  - HRV empty state for AST-001.
  - "Trend cannot be determined yet" for AST-003.
- Measured: landing frame/header spacing at 1440 and 390; no horizontal overflow on landing (1440, 390) or Monitoring/Trends (~1440).

**Not verified (please check manually)**
- Visual look of Monitoring and Trends by eye, in both themes.
- Tablet width (768px) for the new pages and for the landing frame.
- Landing frame in dark theme at 768px (only the active theme was measured, at 1440 and 390).
- Mobile (390px) legibility of the 6-item bottom nav.
- Reload persistence of manual entries (only the storage key contents were checked, not a reload).
- Any real backend integration.
- No screenshot of the frame overlap was provided, so the fix was based on the description plus measurements.

---

## 6. Known limitations (honest list)

1. **Two data sources.** Overview, Check-in, Health Twin and Alerts use the API/sample fallback. Monitoring and Trends use the local store. A manual entry updates Monitoring and Trends only, not the Overview tiles.
2. The Monitoring assessment comes from the API (or sample fallback). It is **not** recomputed from local entries.
3. The 30-day history is **synthetic seeded demo data** (source `demo_seed`), regenerated each day. Only user-entered and simulated readings are saved in the browser.
4. The heart-rate recent-readings chart is categorical (ordered by reading), not time-scaled.
5. The hero astronaut art is a 746×783 crop from the mockups and may look soft on large screens.
6. If the dev server runs on 5174 (port 5173 busy), a backend that allows CORS only for 5173 will reject requests.
7. Tailwind error `text-on-accent does not exist` happens if a stale dev server is running. Restart `npm run dev` (and delete `node_modules\.vite` if it persists).

---

## 7. Questions for the backend developer (data contract)

1. Endpoint(s) and payload shape for observations: a generic `{metric, value, unit, measured_at, source}` list, or the current fixed fields?
2. Is blood pressure one paired record, or two observations linked by a `sessionId`?
3. Are SpO₂, glucose, HRV, temperature and sleep supported as metrics?
4. Who computes the personal baseline: backend or frontend? (Currently the frontend, per the rules in section 2.)
5. Should simulated wearable readings be stored at all? If so, with which `source` value?
6. Should the History & Trends window (7/30 days) be a query parameter?
7. CORS: which dev origins are allowed?

`src/health/service.ts` contains `httpAdapterStub`, ready to be implemented once these are agreed.

---

## 8. How to run

```bash
cd D:\AstroTwin\frontend
npm install
npm run dev
npm run build
```

Environment: `VITE_API_BASE_URL=http://localhost:8000/api/v1` (see `.env.example`).

Suggested prompts for cross-checking with another model:
- "Review `src/health/service.ts` for correctness of the baseline and daily-median logic."
- "Check `Monitoring.tsx` simulator interval for leaks or duplicate ticks."
- "Compare `src/types/api.ts` against the backend schemas for mismatches."
