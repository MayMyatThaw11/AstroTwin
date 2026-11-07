"""Synthetic astronaut measurements (fictional crew, NOT medical data).

Adapted from the user-supplied generate_data.py: same distributions, but with a fixed seed
(reproducible) and a path relative to this repo that is created if missing.
AST-002 gets a simulated change on its last 3 dates (HR/sleep/stress) as a demo scenario.
"""
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "synthetic" / "measurements.json"


def generate_astro_data(seed: int = 42):
    random.seed(seed)
    profiles = ["AST-001", "AST-002", "AST-003", "AST-004", "AST-005", "AST-006"]
    data = []
    start_date = datetime(2026, 10, 1, 8, 0, 0)
    for astro in profiles:
        for day in range(30):
            current_date = start_date + timedelta(days=day)
            if astro == "AST-002" and day >= 27:
                hr = random.randint(78, 85)
                sleep = round(random.uniform(4.8, 5.5), 1)
                stress = random.randint(7, 9)
                temp = round(random.uniform(37.0, 37.3), 1)
                mood = random.randint(1, 2)
            else:
                hr = random.randint(62, 68)
                sleep = round(random.uniform(7.0, 8.0), 1)
                stress = random.randint(1, 3)
                temp = round(random.uniform(36.5, 36.8), 1)
                mood = random.randint(3, 5)
            data.append({
                "astronaut_id": astro,
                "timestamp_utc": current_date.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "resting_heart_rate_bpm": hr,
                "body_temperature_c": temp,
                "sleep_hours": sleep,
                "mood_1_to_5": mood,
                "stress_0_to_10": stress,
                "context": "resting",
                "source": "synthetic",
            })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Generated {len(data)} synthetic records into {OUT}")
    return data


if __name__ == "__main__":
    generate_astro_data()
