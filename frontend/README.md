# AstroTwin AI — Frontend

React + Vite + TypeScript + Tailwind. Fictional astronauts, synthetic data only.

```bash
npm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:8000/api/v1
npm run dev            # http://localhost:5173
npm run build
```

If the backend is unreachable, read-only views use clearly labelled sample data
("Demo fallback — not saved"); check-ins are never faked and fail with a retry message.
