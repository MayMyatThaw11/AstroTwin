"""NASA historical environmental research data (RR-1 EDA, ISS RadLab). NOT live telemetry and NOT personal dose.

Imported read-only from HealthMonitoring_Data.zip via zipfile (nothing is extracted to disk). Values are stored exactly as
published; invalid/blank cells are skipped and counted, never filled in.
"""
import csv
import io
import os
import sqlite3
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request

from .db import DATA_DIR, thread_conn

ZIP_DEFAULT = DATA_DIR / "HealthMonitoring_Data.zip"
P = "HealthMonitoring_Data/"
TELEMETRY = P + "Environmental Data/RR-1_EDA_Telemetry_table.csv"
RADIATION = P + "Environmental Data/RR-1_EDA_Radiation_table.csv"
SUMMARY = P + "Environmental Data/RR-1_EDA_Summary_table.csv"
RADLAB = P + "RadLabData/radiation_readings.csv"

DISCLAIMER = ("Historical research data published by NASA. Not live spacecraft telemetry, not a forecast, and not any "
              "individual astronaut's personal radiation dose.")

# metric id -> (label, unit, unit_verified, dataset, description)
METRICS = {
    "temperature_c": ("Cabin temperature", "°C", True, "RR-1 EDA telemetry (2014)", "Temp_degC_ISS / Temp_degC_Ground"),
    "humidity_pct": ("Relative humidity", "%", True, "RR-1 EDA telemetry (2014)", "RH_percent_ISS / RH_percent_Ground"),
    "co2_ppm": ("CO₂ concentration", "ppm", True, "RR-1 EDA telemetry (2014)", "CO2_ppm_ISS / CO2_ppm_Ground"),
    "radiation_gcr_mgy_d": ("GCR dose (daily)", "mGy/day", True, "RR-1 EDA radiation (2014)", "GCR_Dose_mGy_d"),
    "radiation_saa_mgy_d": ("SAA dose (daily)", "mGy/day", True, "RR-1 EDA radiation (2014)", "SAA_Dose_mGy_d"),
    "radiation_total_mgy_d": ("Total dose (daily)", "mGy/day", True, "RR-1 EDA radiation (2014)", "Total_Dose_mGy_d"),
    "radiation_accumulated_mgy_d": ("Accumulated dose", "mGy/day (as labelled by source)", False, "RR-1 EDA radiation (2014)",
                                    "Accumulated_Dose_mGy_d - a running total; the source labels it mGy/day, so the unit is shown as published"),
    "radlab_absorbed_dose_rate": ("RadLab absorbed dose rate", "unverified (source-native)", False, "ISS RadLab (2022)",
                                  "absorbed_dose_rate; units are not stated in the file, so none is assumed"),
}
ALIASES = {"co2": "co2_ppm", "temperature": "temperature_c", "temp": "temperature_c", "humidity": "humidity_pct",
           "rh": "humidity_pct", "radiation": "radiation_total_mgy_d", "radlab": "radlab_absorbed_dose_rate"}
LOCATIONS = ("iss", "ground")

SCHEMA = """
CREATE TABLE IF NOT EXISTS env_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_verified INTEGER NOT NULL,
  measured_at TEXT NOT NULL,         -- UTC ISO-8601 as published (no timezone shift applied)
  location TEXT,                     -- 'iss' | 'ground' (RR-1 ground-control unit) | NULL
  instrument_id TEXT, module TEXT, spacecraft TEXT,
  dataset TEXT NOT NULL, source_file TEXT NOT NULL, source_row INTEGER NOT NULL,
  import_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS ix_env ON env_samples(metric, location, measured_at);
CREATE TABLE IF NOT EXISTS env_import_log (
  source_file TEXT PRIMARY KEY, rows_in_file INTEGER, rows_inserted_total INTEGER, rows_skipped_invalid INTEGER, imported_at TEXT
);
"""


def _num(s):
    try:
        v = float(str(s).strip())
    except ValueError:
        return None
    return v if v == v and abs(v) != float("inf") else None


def _rows(z, name):
    return list(csv.DictReader(io.StringIO(z.read(name).decode("utf-8-sig"))))


def import_nasa(conn: sqlite3.Connection, zip_path: Path | None = None) -> dict:
    zip_path = Path(zip_path or os.environ.get("ASTROTWIN_NASA_ZIP", ZIP_DEFAULT))
    conn.executescript(SCHEMA)
    if not zip_path.exists():
        return {"imported": False, "reason": f"{zip_path} not found"}
    sql = ("INSERT OR IGNORE INTO env_samples(metric,value,unit,unit_verified,measured_at,location,instrument_id,module,spacecraft,"
           "dataset,source_file,source_row,import_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    report = {}
    with zipfile.ZipFile(zip_path) as z:
        def load(fname, gen):
            total = skipped = 0
            batch = []
            for n, row in enumerate(_rows(z, fname), start=2):  # n = CSV line number
                total += 1
                made = gen(row)
                if not made:
                    skipped += 1
                for (metric, value, ts, loc, inst, mod, craft) in made:
                    _, unit, ver, ds, _ = METRICS[metric]
                    key = f"{fname}|{n}|{metric}|{loc or ''}|{inst or ''}"
                    batch.append((metric, value, unit, int(ver), ts, loc, inst, mod, craft, ds, fname.split("/")[-1], n, key))
            before = conn.total_changes
            conn.executemany(sql, batch)
            inserted = conn.total_changes - before
            n_db = conn.execute("SELECT COUNT(*) FROM env_samples WHERE source_file=?", (fname.split("/")[-1],)).fetchone()[0]
            conn.execute("INSERT OR REPLACE INTO env_import_log VALUES (?,?,?,?,?)",
                         (fname.split("/")[-1], total, n_db, skipped, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")))
            report[fname.split("/")[-1]] = {"rows_in_file": total, "rows_with_no_valid_value": skipped,
                                            "samples_inserted_now": inserted, "samples_in_db": n_db}

        def telemetry(r):
            try:
                ts = datetime.strptime(r["Controller_Time_GMT"].strip(), "%Y-%m-%d %H:%M").strftime("%Y-%m-%dT%H:%M:00Z")
            except (ValueError, KeyError):
                return []
            out = []
            for col, metric, loc in (("Temp_degC_ISS", "temperature_c", "iss"), ("Temp_degC_Ground", "temperature_c", "ground"),
                                     ("RH_percent_ISS", "humidity_pct", "iss"), ("RH_percent_Ground", "humidity_pct", "ground"),
                                     ("CO2_ppm_ISS", "co2_ppm", "iss"), ("CO2_ppm_Ground", "co2_ppm", "ground")):
                v = _num(r.get(col))
                if v is not None:
                    out.append((metric, v, ts, loc, "RR-1 EDA", None, "ISS" if loc == "iss" else "Ground control"))
            return out

        def radiation(r):
            try:
                ts = datetime.strptime(r["Date"].strip(), "%Y-%m-%d").strftime("%Y-%m-%dT00:00:00Z")
            except (ValueError, KeyError):
                return []
            out = []
            for col, metric in (("GCR_Dose_mGy_d", "radiation_gcr_mgy_d"), ("SAA_Dose_mGy_d", "radiation_saa_mgy_d"),
                                ("Total_Dose_mGy_d", "radiation_total_mgy_d"), ("Accumulated_Dose_mGy_d", "radiation_accumulated_mgy_d")):
                v = _num(r.get(col))
                if v is not None:
                    out.append((metric, v, ts, "iss", "RR-1 EDA", None, "ISS"))
            return out

        def radlab(r):
            v = _num(r.get("absorbed_dose_rate"))
            try:
                ts = datetime.fromisoformat(r["timestamp"].strip()).strftime("%Y-%m-%dT%H:%M:%SZ")
            except (ValueError, KeyError, AttributeError):
                return []
            if v is None:
                return []
            return [("radlab_absorbed_dose_rate", v, ts, "iss", r.get("instrument_id") or r.get("instrument"), r.get("module"), r.get("spacecraft"))]

        load(TELEMETRY, telemetry)
        load(RADIATION, radiation)
        load(RADLAB, radlab)
        # The summary table is descriptive statistics, not a time series: kept for reference only (not imported as samples).
        report["RR-1_EDA_Summary_table.csv"] = {"rows_in_file": len(_rows(z, SUMMARY)), "note": "descriptive statistics; not imported as samples"}
    conn.commit()
    return {"imported": True, "files": report}


# ----------------------------------------------------------------- API

router = APIRouter(prefix="/environment")


def _conn(request: Request) -> sqlite3.Connection:
    c = thread_conn()
    c.executescript(SCHEMA)  # harmless if already present
    return c


def _resolve(metric: str) -> str:
    m = ALIASES.get(metric.lower(), metric.lower())
    if m not in METRICS:
        raise HTTPException(422, detail=f"Unknown metric '{metric}'. Use one of: {', '.join(list(METRICS) + list(ALIASES))}")
    return m


def _meta(m: str):
    label, unit, ver, ds, desc = METRICS[m]
    return {"id": m, "label": label, "unit": unit, "unit_verified": ver, "dataset": ds, "description": desc}


@router.get("/metrics")
def env_metrics(request: Request):
    conn = _conn(request)
    items = []
    for m in METRICS:
        r = conn.execute("SELECT COUNT(*) n, MIN(measured_at) a, MAX(measured_at) b, "
                         "GROUP_CONCAT(DISTINCT location) locs FROM env_samples WHERE metric=?", (m,)).fetchone()
        items.append({**_meta(m), "sample_count": r["n"], "first_timestamp": r["a"], "last_timestamp": r["b"],
                      "locations": sorted((r["locs"] or "").split(",")) if r["locs"] else [],
                      "aliases": [a for a, t in ALIASES.items() if t == m]})
    return {"items": items, "data_nature": "historical_research_data", "is_live": False, "disclaimer": DISCLAIMER}


@router.get("/summary")
def env_summary(request: Request):
    conn = _conn(request)
    sources = [dict(r) for r in conn.execute("SELECT source_file, rows_in_file, rows_inserted_total AS samples_in_db, "
                                              "rows_skipped_invalid, imported_at FROM env_import_log ORDER BY source_file")]
    stats = []
    for r in conn.execute("SELECT metric, location, COUNT(*) n, MIN(value) mn, MAX(value) mx, AVG(value) av, MIN(measured_at) a, "
                          "MAX(measured_at) b FROM env_samples GROUP BY metric, location ORDER BY metric, location"):
        stats.append({**_meta(r["metric"]), "location": r["location"], "sample_count": r["n"], "min": r["mn"], "max": r["mx"],
                      "mean": round(r["av"], 3), "first_timestamp": r["a"], "last_timestamp": r["b"]})
    return {"data_nature": "historical_research_data", "is_live": False,
            "datasets": [
                {"name": "RR-1 EDA telemetry", "period": "2014-09-20 to 2014-11-01", "publisher": "NASA", "locations": ["iss", "ground"],
                 "note": "'ground' is the ground-control unit, kept separate from 'iss'"},
                {"name": "RR-1 EDA daily radiation", "period": "2014-09-21 to 2014-10-29", "publisher": "NASA", "locations": ["iss"]},
                {"name": "ISS RadLab readings", "period": "2022-03-01 to 2022-03-02", "publisher": "NASA", "locations": ["iss"],
                 "note": "per-instrument; the absorbed_dose_rate unit is not stated in the file"}],
            "sources": sources, "metrics": stats, "disclaimer": DISCLAIMER,
            "not_personal_dose": "Radiation values describe the ISS environment in the dataset period, not any astronaut's dose."}


@router.get("/history")
def env_history(request: Request, metric: str = Query("co2"), days: int = Query(7, ge=1, le=60),
                location: str | None = Query(None), bucket: str | None = Query(None)):
    conn = _conn(request)
    m = _resolve(metric)
    loc = location.lower() if location else None
    if loc and loc not in LOCATIONS:
        raise HTTPException(422, detail="location must be 'iss' or 'ground'")
    if bucket and bucket not in ("raw", "hour", "day"):
        raise HTTPException(422, detail="bucket must be raw, hour or day")
    if loc is None:  # default: ISS where the metric has one, else whatever exists
        has_iss = conn.execute("SELECT 1 FROM env_samples WHERE metric=? AND location='iss' LIMIT 1", (m,)).fetchone()
        loc = "iss" if has_iss else None
    where, args = "metric=?", [m]
    if loc:
        where += " AND location=?"
        args.append(loc)
    last = conn.execute(f"SELECT MAX(measured_at) FROM env_samples WHERE {where}", args).fetchone()[0]
    if last is None:
        return {"metric": _meta(m), "location": loc, "days": days, "points": [], "window": None, "data_nature": "historical_research_data",
                "is_live": False, "disclaimer": DISCLAIMER, "note": "No samples imported for this metric."}
    end = datetime.strptime(last, "%Y-%m-%dT%H:%M:%SZ")
    start = (end - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    b = bucket or ("hour" if days <= 7 else "day")
    expr = {"raw": "measured_at", "hour": "substr(measured_at,1,13)||':00:00Z'", "day": "substr(measured_at,1,10)"}[b]
    rows = conn.execute(
        f"SELECT {expr} t, ROUND(AVG(value),3) v, MIN(value) mn, MAX(value) mx, COUNT(*) n, MAX(instrument_id) inst, MAX(module) mod "
        f"FROM env_samples WHERE {where} AND measured_at > ? GROUP BY t ORDER BY t", [*args, start]).fetchall()
    if b != "raw" and m == "radlab_absorbed_dose_rate":
        # several instruments report at once: never average across different instruments
        rows = conn.execute(
            f"SELECT {expr} t, ROUND(AVG(value),3) v, MIN(value) mn, MAX(value) mx, COUNT(*) n, instrument_id inst, module mod "
            f"FROM env_samples WHERE {where} AND measured_at > ? GROUP BY t, instrument_id ORDER BY t, instrument_id", [*args, start]).fetchall()
    pts = [{"timestamp": r["t"], "value": r["v"], "min": r["mn"], "max": r["mx"], "n": r["n"],
            **({"instrument_id": r["inst"], "module": r["mod"]} if m == "radlab_absorbed_dose_rate" else {})} for r in rows]
    return {"metric": _meta(m), "location": loc, "days": days, "bucket": b, "points": pts,
            "window": {"start_exclusive": start, "end": last,
                       "anchor": "Window ends at the latest imported sample for this metric (the data are historical, not current)."},
            "data_nature": "historical_research_data", "is_live": False, "disclaimer": DISCLAIMER}
