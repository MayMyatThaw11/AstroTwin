# AstroTwin AI — backend (FastAPI + SQLite)

Local MVP. All crew and measurements are **fictional / synthetic**; output is decision support, not diagnosis.

## Run (Windows PowerShell)

```powershell
cd D:\AstroTwin\backend
py -3 -m venv .venv                      # or: python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
# tests
.\.venv\Scripts\python.exe -m pytest -q
```

Frontend: `cd D:\AstroTwin\frontend; npm install; npm run dev` → http://localhost:5173/app#/overview
(`VITE_API_BASE_URL` defaults to `http://localhost:8000/api/v1`; CORS allows localhost/127.0.0.1 on 5173, 5174, 4173).

## Data

- `scripts/generate_data.py` (adapted from the supplied generator, fixed seed 42) writes `data/synthetic/measurements.json`:
  6 astronauts × 30 days (2026-10-01 … 2026-10-30, 08:00 UTC) = 180 records, source `synthetic`.
- Startup seeds SQLite (`data/astrotwin.db`, git-ignored) idempotently: 180 records → 900 observations
  (heart rate, temperature, sleep, stress, mood; `INSERT OR IGNORE` on a deterministic `import_key`).
- AST-002 has a simulated change on its last 3 dates (higher HR/stress, shorter sleep) — a demo scenario.
- SpO₂, blood pressure, glucose, HRV, fatigue are **not** in the dataset; they stay unavailable until entered.
- The NASA archive (`HealthMonitoring_Data.zip`) is **not integrated** (optional; no personal health data in it).

## API (`/api/v1`) — matches `frontend/src/api/client.ts`

`GET /health`, `GET /astronauts`, `GET /astronauts/{id}/overview|trends?days=7|30|alerts|medical-summary`,
`POST /checkins`, plus `GET|POST /astronauts/{id}/observations` (used by the Monitoring/Trends health layer).

## Assessment rules (`app/health_engine.py`)

Daily value = UTC-day median; baseline = median of daily medians over the 28 days before the last 3 days (≥ 5 days);
anchor day = latest saved non-simulated observation (the dataset is historical, so windows end 2026-10-30 until a newer
entry is saved). `review` needs ≥ 2 metrics each deviating on ≥ 2 of the last 3 days, using explicit **demo** criteria
(HR +8 %, sleep −15 %, stress/fatigue +2, temperature +0.4 °C) — not clinical thresholds. A reported symptom yields a neutral
"seek crew medical guidance" message.
