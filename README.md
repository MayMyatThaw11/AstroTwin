# AstroTwin AI

AstroTwin AI is a NASA Space Apps hackathon MVP: a personal health "twin" dashboard for astronauts. It compares each person's readings with their own history and shows plain-language, descriptive status. It is decision support only, not a diagnosis.

All crew and measurements are fictional or synthetic.

## Branches

| Branch | Contents |
|--------|----------|
| `frontend` | React + Vite + TypeScript + Tailwind web app (`frontend/`) |
| `backend` | FastAPI + SQLite API (`backend/`) |

## Backend quick start (Windows PowerShell)

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

API base URL: `http://localhost:8000/api/v1`. Interactive docs: `http://localhost:8000/docs`.

Tests:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

On first start the app creates `backend/data/astrotwin.db` and seeds it from `backend/data/synthetic/measurements.json`. The database is git-ignored and is rebuilt automatically.

See [backend/README.md](backend/README.md) for the data set, endpoints and assessment rules.

## Frontend quick start

Use the `frontend` branch:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/app#/overview`. The frontend reads `VITE_API_BASE_URL` (default `http://localhost:8000/api/v1`) and falls back to labelled sample data when the API is unreachable.

## Honesty notes

- Data is synthetic. Nothing here is real medical data.
- Baselines are personal references (median of daily values), not validated normal ranges.
- Assessment criteria are explicit demo rules, not clinical thresholds.
