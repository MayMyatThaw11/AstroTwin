"""Idempotent import of the synthetic dataset (INSERT OR IGNORE on a deterministic import_key)."""
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from .db import DATA_DIR

DATASET = DATA_DIR / "synthetic" / "measurements.json"

CREW = [
    ("AST-001", "Commander Nova", "Mission Commander"),
    ("AST-002", "Dr. Sol", "Flight Engineer"),
    ("AST-003", "Specialist Vega", "Mission Specialist"),
    ("AST-004", "Dr. Lyra", "Mission Physician"),
    ("AST-005", "Pilot Orion", "Pilot"),
    ("AST-006", "Specialist Atlas", "Systems Specialist"),
]
MISSION = "Mars Transit (simulated)"

# generator field -> (backend metric, unit)
FIELD_MAP = {
    "resting_heart_rate_bpm": ("heart_rate_bpm", "bpm"),
    "body_temperature_c": ("temperature_c", "°C"),
    "sleep_hours": ("sleep_hours", "h"),
    "stress_0_to_10": ("stress_score", "/10"),
    "mood_1_to_5": ("mood_score", "/5"),
}


def seed(conn: sqlite3.Connection) -> dict:
    for aid, name, role in CREW:
        conn.execute("INSERT OR IGNORE INTO astronauts(id,name,role,mission) VALUES (?,?,?,?)", (aid, name, role, MISSION))
    if not DATASET.exists():
        sys.path.insert(0, str(DATASET.parent.parent.parent / "scripts"))
        from generate_data import generate_astro_data  # type: ignore
        generate_astro_data()
    records = json.loads(DATASET.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    inserted = 0
    for r in records:
        for field, (metric, unit) in FIELD_MAP.items():
            if r.get(field) is None:
                continue
            key = f"{r['astronaut_id']}|{metric}|{r['timestamp_utc']}|{r['source']}"
            cur = conn.execute(
                "INSERT OR IGNORE INTO observations(astronaut_id,metric,value,unit,measured_at,source,notes,import_key,created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (r["astronaut_id"], metric, float(r[field]), unit, r["timestamp_utc"], r["source"], r.get("context"), key, now),
            )
            inserted += cur.rowcount
    conn.commit()
    return {"source_records": len(records), "observations_inserted": inserted}
