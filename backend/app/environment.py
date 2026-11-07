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

from .db import DATA_DIR, db_path, thread_conn

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
  import_key TEXT NOT NULL UNIQUE,
  mission TEXT,                      -- NASA mission id where the source has one (e.g. RR-28)
  source_url TEXT                    -- public NASA page/API the record came from
);
CREATE INDEX IF NOT EXISTS ix_env ON env_samples(metric, location, measured_at);
CREATE TABLE IF NOT EXISTS env_import_log (
  source_file TEXT PRIMARY KEY, rows_in_file INTEGER, rows_inserted_total INTEGER, rows_skipped_invalid INTEGER, imported_at TEXT,
  file_bytes INTEGER
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


STAGED = DATA_DIR / "nasa" / "nasa_env_2020plus.csv.gz"
EDA_URL = "https://visualization.osdr.nasa.gov/eda/dashboard_RR-1"
RADLAB_URL = "https://visualization.osdr.nasa.gov/radlab/api/"


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(env_samples)")}
    for c in ("mission", "source_url"):  # databases created before the 2020+ import
        if c not in cols:
            conn.execute(f"ALTER TABLE env_samples ADD COLUMN {c} TEXT")
    if "file_bytes" not in {r[1] for r in conn.execute("PRAGMA table_info(env_import_log)")}:
        conn.execute("ALTER TABLE env_import_log ADD COLUMN file_bytes INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_env_mission ON env_samples(metric, mission, measured_at)")


def import_staged(conn: sqlite3.Connection, path: Path | None = None, force: bool = False) -> dict:
    """Import records staged by scripts/fetch_nasa_env.py (real NASA EDA/RadLab records, 2020-01-01 onward)."""
    path = Path(path or os.environ.get("ASTROTWIN_NASA_STAGED", STAGED))
    if not path.exists():
        return {"imported": False, "reason": f"{path.name} not found (run scripts/fetch_nasa_env.py)"}
    import gzip
    done = conn.execute("SELECT file_bytes FROM env_import_log WHERE source_file=?", (path.name,)).fetchone()
    if done and done[0] == path.stat().st_size and not force:  # same file already imported: nothing to do
        return {"imported": True, "skipped_unchanged": True}
    sql = ("INSERT OR IGNORE INTO env_samples(metric,value,unit,unit_verified,measured_at,location,instrument_id,module,spacecraft,"
           "dataset,source_file,source_row,import_key,mission,source_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    batch, total, skipped = [], 0, 0
    with gzip.open(path, "rt", encoding="utf-8", newline="") as fh:
        for n, r in enumerate(csv.DictReader(fh), start=2):
            total += 1
            v = _num(r["value"])
            if v is None or r["metric"] not in METRICS or not r["timestamp"]:
                skipped += 1
                continue
            loc = r["location"] or None
            key = f"staged|{r['dataset']}|{r['metric']}|{loc or ''}|{r['instrument_id']}|{r['timestamp']}"
            batch.append((r["metric"], v, r["unit"], int(r["unit_verified"]), r["timestamp"], loc, r["instrument_id"] or None,
                          r["module"] or None, r["spacecraft"] or None, r["dataset"], path.name, n, key, r["mission"] or None, r["source_url"]))
    before = conn.total_changes
    conn.executemany(sql, batch)
    inserted = conn.total_changes - before
    n_db = conn.execute("SELECT COUNT(*) FROM env_samples WHERE source_file=?", (path.name,)).fetchone()[0]
    conn.execute("INSERT OR REPLACE INTO env_import_log(source_file,rows_in_file,rows_inserted_total,rows_skipped_invalid,imported_at,file_bytes) "
                 "VALUES (?,?,?,?,?,?)", (path.name, total, n_db, skipped, datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), path.stat().st_size))
    conn.commit()
    return {"imported": True, "rows_in_file": total, "samples_inserted_now": inserted, "samples_in_db": n_db, "skipped": skipped}


def import_nasa(conn: sqlite3.Connection, zip_path: Path | None = None, force: bool = False) -> dict:
    ensure_schema(conn)
    done = {r[0] for r in conn.execute("SELECT source_file FROM env_import_log")}
    zip_done = {"RR-1_EDA_Telemetry_table.csv", "RR-1_EDA_Radiation_table.csv", "radiation_readings.csv"} <= done
    res = {"imported": True, "skipped_unchanged": True} if zip_done and not force else _import_zip(conn, zip_path)
    res["staged_2020plus"] = import_staged(conn, force=force)
    # provenance for rows imported before these columns existed (EDA RR-1 files and the RadLab sample)
    conn.execute("UPDATE env_samples SET mission='RR-1', source_url=? WHERE mission IS NULL AND source_file IN (?,?)",
                 (EDA_URL, "RR-1_EDA_Telemetry_table.csv", "RR-1_EDA_Radiation_table.csv"))
    conn.execute("UPDATE env_samples SET source_url=? WHERE source_url IS NULL AND source_file='radiation_readings.csv'", (RADLAB_URL,))
    conn.commit()
    return res


def _import_zip(conn: sqlite3.Connection, zip_path: Path | None = None) -> dict:
    zip_path = Path(zip_path or os.environ.get("ASTROTWIN_NASA_ZIP", ZIP_DEFAULT))
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
            conn.execute("INSERT OR REPLACE INTO env_import_log(source_file,rows_in_file,rows_inserted_total,rows_skipped_invalid,imported_at) VALUES (?,?,?,?,?)",
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

# A "period" is one continuous NASA data set (a mission, or a RadLab extract). Derived in SQL so nothing is hard-coded.
PERIOD = ("CASE WHEN mission IS NOT NULL THEN mission WHEN source_file='radiation_readings.csv' THEN 'RADLAB-2022' "
          "WHEN dataset LIKE 'RadLab%' THEN 'RADLAB-2020PLUS' ELSE source_file END")


def _conn(request: Request) -> sqlite3.Connection:
    return thread_conn()


_CACHE: dict = {}


def _cached(conn: sqlite3.Connection, key: tuple, fn):
    """The aggregates scan ~400k rows; the data only change on import, so memoize per DB until a new row appears."""
    ver = conn.execute("SELECT COALESCE(MAX(id),0) FROM env_samples").fetchone()[0]
    k = (db_path(), *key)
    hit = _CACHE.get(k)
    if hit and hit[0] == ver:
        return hit[1]
    val = fn()
    _CACHE[k] = (ver, val)
    return val


def warm_cache(conn: sqlite3.Connection) -> None:
    """Called after import so the first page view is fast."""
    _metrics_payload(conn)
    _summary_payload(conn)
    for m in METRICS:
        _datasets_payload(conn, m)


def _resolve(metric: str) -> str:
    m = ALIASES.get(metric.lower(), metric.lower())
    if m not in METRICS:
        raise HTTPException(422, detail=f"Unknown metric '{metric}'. Use one of: {', '.join(list(METRICS) + list(ALIASES))}")
    return m


def _meta(m: str):
    label, unit, ver, ds, desc = METRICS[m]
    return {"id": m, "label": label, "unit": unit, "unit_verified": ver, "dataset": ds, "description": desc}


def _day(s: str | None, name: str):
    if s is None:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(422, detail=f"{name} must be YYYY-MM-DD")


@router.get("/metrics")
def env_metrics(request: Request):
    return _metrics_payload(_conn(request))


def _metrics_payload(conn):
    return _cached(conn, ("metrics",), lambda: _metrics_build(conn))


def _metrics_build(conn):
    items = []
    for m in METRICS:
        r = conn.execute("SELECT COUNT(*) n, MIN(measured_at) a, MAX(measured_at) b, GROUP_CONCAT(DISTINCT location) locs, "
                         "GROUP_CONCAT(DISTINCT spacecraft) crafts FROM env_samples WHERE metric=?", (m,)).fetchone()
        periods = conn.execute(f"SELECT COUNT(DISTINCT {PERIOD}) FROM env_samples WHERE metric=?", (m,)).fetchone()[0]
        items.append({**_meta(m), "sample_count": r["n"], "first_timestamp": r["a"], "last_timestamp": r["b"],
                      "latest_observation_date": r["b"][:10] if r["b"] else None,
                      "locations": sorted((r["locs"] or "").split(",")) if r["locs"] else [],
                      "spacecraft": sorted((r["crafts"] or "").split(",")) if r["crafts"] else [],
                      "period_count": periods, "aliases": [a for a, t in ALIASES.items() if t == m]})
    return {"items": items, "data_nature": "historical_research_data", "is_live": False, "disclaimer": DISCLAIMER}


@router.get("/datasets")
def env_datasets(request: Request, metric: str | None = Query(None)):
    """Observation periods actually available (one per mission / RadLab extract), newest first."""
    return _datasets_payload(_conn(request), _resolve(metric) if metric else None)


def _datasets_payload(conn, metric):
    return _cached(conn, ("datasets", metric), lambda: _datasets_build(conn, metric))


def _datasets_build(conn, metric):
    where, args = "", []
    if metric:
        where, args = "WHERE metric=?", [metric]
    rows = conn.execute(
        f"SELECT {PERIOD} pid, metric, MIN(dataset) dataset, MIN(measured_at) a, MAX(measured_at) b, COUNT(*) n, "
        f"GROUP_CONCAT(DISTINCT location) locs, GROUP_CONCAT(DISTINCT spacecraft) crafts, GROUP_CONCAT(DISTINCT instrument_id) insts, "
        f"MIN(source_url) url FROM env_samples {where} GROUP BY pid, metric ORDER BY b DESC", args).fetchall()
    return {"items": [{"period_id": r["pid"], "metric": r["metric"], "dataset": r["dataset"], "first_timestamp": r["a"],
                       "last_timestamp": r["b"], "sample_count": r["n"],
                       "locations": sorted((r["locs"] or "").split(",")) if r["locs"] else [],
                       "spacecraft": sorted((r["crafts"] or "").split(",")) if r["crafts"] else [],
                       "instruments": sorted((r["insts"] or "").split(",")) if r["insts"] else [], "source_url": r["url"]} for r in rows],
            "data_nature": "historical_research_data", "is_live": False, "disclaimer": DISCLAIMER}


@router.get("/summary")
def env_summary(request: Request):
    return _summary_payload(_conn(request))


def _summary_payload(conn):
    return _cached(conn, ("summary",), lambda: _summary_build(conn))


def _summary_build(conn):
    sources = [dict(r) for r in conn.execute("SELECT source_file, rows_in_file, rows_inserted_total AS samples_in_db, "
                                              "rows_skipped_invalid, imported_at FROM env_import_log ORDER BY source_file")]
    stats = []
    for r in conn.execute("SELECT metric, location, COUNT(*) n, MIN(value) mn, MAX(value) mx, AVG(value) av, MIN(measured_at) a, "
                          "MAX(measured_at) b FROM env_samples GROUP BY metric, location ORDER BY metric, location"):
        stats.append({**_meta(r["metric"]), "location": r["location"], "sample_count": r["n"], "min": r["mn"], "max": r["mx"],
                      "mean": round(r["av"], 3), "first_timestamp": r["a"], "last_timestamp": r["b"]})
    datasets = []
    for r in conn.execute(f"SELECT {PERIOD} pid, MIN(dataset) name, MIN(measured_at) a, MAX(measured_at) b, "
                          "GROUP_CONCAT(DISTINCT location) locs, MIN(source_url) url FROM env_samples GROUP BY pid ORDER BY b DESC"):
        datasets.append({"period_id": r["pid"], "name": r["name"], "publisher": "NASA", "first_timestamp": r["a"], "last_timestamp": r["b"],
                         "period": f"{r['a'][:10]} to {r['b'][:10]}", "locations": sorted((r["locs"] or "").split(",")) if r["locs"] else [],
                         "source_url": r["url"]})
    latest = conn.execute("SELECT MAX(measured_at) FROM env_samples").fetchone()[0]
    return {"data_nature": "historical_research_data", "is_live": False, "disclaimer": DISCLAIMER,
            "latest_observation_date": latest[:10] if latest else None,
            "no_data_after_note": "No NASA records after the latest observation date were found in the public sources checked.",
            "datasets": datasets, "sources": sources, "metrics": stats,
            "not_personal_dose": "Radiation values describe the ISS environment in the dataset period, not any astronaut's dose."}


@router.get("/history")
def env_history(request: Request, metric: str = Query("co2"), days: int = Query(7, ge=1, le=60),
                location: str | None = Query(None), bucket: str | None = Query(None),
                period: str | None = Query(None, description="period_id from /environment/datasets"),
                start: str | None = Query(None, description="YYYY-MM-DD"), end: str | None = Query(None, description="YYYY-MM-DD"),
                spacecraft: str | None = Query(None)):
    conn = _conn(request)
    m = _resolve(metric)
    loc = location.lower() if location else None
    if loc and loc not in LOCATIONS:
        raise HTTPException(422, detail="location must be 'iss' or 'ground'")
    if bucket and bucket not in ("raw", "hour", "day"):
        raise HTTPException(422, detail="bucket must be raw, hour or day")
    d_start, d_end = _day(start, "start"), _day(end, "end")
    if d_start and d_end and d_start > d_end:
        raise HTTPException(422, detail="start must not be after end")
    if loc is None and spacecraft is None:  # default: ISS where the metric has one
        has_iss = conn.execute("SELECT 1 FROM env_samples WHERE metric=? AND location='iss' LIMIT 1", (m,)).fetchone()
        loc = "iss" if has_iss else None
    where, args = "metric=?", [m]
    if loc:
        where += " AND location=?"
        args.append(loc)
    if spacecraft:
        where += " AND spacecraft=?"
        args.append(spacecraft)
    if period:
        where += f" AND ({PERIOD})=?"
        args.append(period)
    if d_end:
        where += " AND measured_at < ?"
        args.append((d_end + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ"))
    base = {"metric": _meta(m), "location": loc, "spacecraft": spacecraft, "period": period, "days": days,
            "data_nature": "historical_research_data", "is_live": False, "disclaimer": DISCLAIMER}
    last = conn.execute(f"SELECT MAX(measured_at) FROM env_samples WHERE {where}", args).fetchone()[0]
    if last is None:
        return {**base, "points": [], "window": None, "note": "No samples for this selection."}
    end_dt = datetime.strptime(last, "%Y-%m-%dT%H:%M:%SZ")
    start_dt = d_start if d_start else end_dt - timedelta(days=days)
    s_iso = start_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    cmp_ = ">=" if d_start else ">"
    b = bucket or ("hour" if (end_dt - start_dt).days <= 7 else "day")
    expr = {"raw": "measured_at", "hour": "substr(measured_at,1,13)||':00:00Z'", "day": "substr(measured_at,1,10)"}[b]
    per_inst = m == "radlab_absorbed_dose_rate"
    group = "t, instrument_id" if per_inst else "t"  # never average across different instruments
    rows = conn.execute(
        f"SELECT {expr} t, ROUND(AVG(value),3) v, MIN(value) mn, MAX(value) mx, COUNT(*) n, instrument_id inst, MAX(module) mod, "
        f"MAX(spacecraft) craft FROM env_samples WHERE {where} AND measured_at {cmp_} ? GROUP BY {group} ORDER BY t, instrument_id",
        [*args, s_iso]).fetchall()
    pts = [{"timestamp": r["t"], "value": r["v"], "min": r["mn"], "max": r["mx"], "n": r["n"],
            **({"instrument_id": r["inst"], "module": r["mod"], "spacecraft": r["craft"]} if per_inst else {})} for r in rows]
    return {**base, "bucket": b, "points": pts,
            "window": {"start": s_iso, "end": last,
                       "anchor": "The window ends at the latest matching archived sample (these are historical records, not current data)."}}

