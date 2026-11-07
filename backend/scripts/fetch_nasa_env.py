"""Fetch real NASA environment records dated 2020-01-01 .. today from the public OSDR apps and stage them as a
normalized CSV that the backend imports (app/environment.py). Nothing is generated or shifted in time.

Sources (public, no key):
  * Environmental Data App (EDA): https://visualization.osdr.nasa.gov/eda/dashboard_<MISSION>
        telemetry (temperature, relative humidity, CO2; ISS cabin and ground-control unit) + daily radiation doses
  * RadLab Data API:             https://visualization.osdr.nasa.gov/radlab/api/
        absorbed_dose_rate per instrument (unit not stated by the API)

Reduction (declared, never silent):
  * EDA telemetry is recorded about once a minute: this stages the FIRST valid raw reading of each UTC hour
    (original timestamp and value kept; no averaging).
  * RadLab is queried for ONE hour (00:00-01:00 UTC) of every STRIDE-th day (default: every day); every raw row
    returned in that hour is kept. The stride used is written to data/nasa/README.txt.
Run:  python scripts/fetch_nasa_env.py [stride]            (resumable; RadLab day results are cached in data/nasa/cache)
"""
import csv
import gzip
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "nasa" / "nasa_env_2020plus.csv.gz"
CACHE = ROOT / "data" / "nasa" / "cache"
START = "2020-01-01"
UA = {"User-Agent": "Mozilla/5.0 (AstroTwin research import)"}
EDA = "https://visualization.osdr.nasa.gov/eda/dashboard_{}"
RADLAB = "https://visualization.osdr.nasa.gov/radlab/api/"
MISSIONS = ["RR-19", "RR-10", "RR-23", "RR-18", "RR-22", "RR-25", "RR-20", "RR-28"]
FIELDS = ["dataset", "mission", "metric", "location", "timestamp", "value", "unit", "unit_verified", "instrument_id",
          "module", "spacecraft", "source_url"]

TEL = {  # EDA key -> (metric, location, unit)
    "temperature_iss": ("temperature_c", "iss", "°C"), "temperature_ground": ("temperature_c", "ground", "°C"),
    "rh_iss": ("humidity_pct", "iss", "%"), "rh_ground": ("humidity_pct", "ground", "%"),
    "co2_iss": ("co2_ppm", "iss", "ppm"), "co2_ground": ("co2_ppm", "ground", "ppm"),
}
RAD = {"gcr": "radiation_gcr_mgy_d", "saa": "radiation_saa_mgy_d", "total": "radiation_total_mgy_d",
       "accumulated": "radiation_accumulated_mgy_d"}


def get(url, tries=4, timeout=240):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            time.sleep(3 * (i + 1))
            print("  retry", url[:90], e, file=sys.stderr)


def num(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v else None


def eda_mission(m):
    f = CACHE / f"eda_{m}.json"
    if f.exists():
        return json.loads(f.read_text())
    rows = _eda_mission(m)
    f.write_text(json.dumps(rows))
    return rows


def _eda_mission(m):
    url = EDA.format(m)
    s = get(url)
    i = s.find('type="application/json">')
    d, _ = json.JSONDecoder().raw_decode(s[i + len('type="application/json">'):])
    rows, seen_hours = [], set()
    tel = json.loads(d["telemetry_data"]) if isinstance(d.get("telemetry_data"), str) and d["telemetry_data"] not in ("", "{}") else None
    ds_tel = f"EDA telemetry · {m}"
    if tel and tel.get("time"):
        times = tel["time"]
        for key, (metric, loc, unit) in TEL.items():
            vals = tel.get(key) or []
            seen = set()
            for t, v in zip(times, vals):
                x = num(v)
                if x is None or t < START:
                    continue
                hour = t[:13]
                if hour in seen:
                    continue
                seen.add(hour)
                rows.append([ds_tel, m, metric, loc, t.replace(" ", "T") + "Z", x, unit, 1, "RR-EDA", "",
                             "ISS" if loc == "iss" else "Ground control", url])
    rad = json.loads(d["radiation_data"]) if isinstance(d.get("radiation_data"), str) and d["radiation_data"] not in ("", "{}") else None
    if rad and rad.get("time"):
        for key, metric in RAD.items():
            for t, v in zip(rad["time"], rad.get(key) or []):
                x = num(v)
                if x is None or t < START:
                    continue
                unit_ok = 0 if key == "accumulated" else 1
                rows.append([f"EDA daily radiation · {m}", m, metric, "iss", t[:10] + "T00:00:00Z", x, "mGy/day", unit_ok, "RR-EDA", "", "ISS", url])
    return rows


def radlab_day(day):
    f = CACHE / f"{day}.json"
    if f.exists():
        return json.loads(f.read_text())
    a, b = f"{day}T00:00:00", f"{day}T01:00:00"
    url = RADLAB + "?columns+=absorbed_dose_rate,spacecraft,module&query=" + urllib.parse.quote(f'"timestamp>={a} AND timestamp<{b}"')
    txt = get(url)
    if not txt.startswith("timestamp,"):
        raise RuntimeError(f"unexpected RadLab answer for {day}: {txt[:120]}")
    rows = [[r["timestamp"] + "Z", r["instrument_id"], num(r["absorbed_dose_rate"]), r.get("module", ""), r.get("spacecraft", "")]
            for r in csv.DictReader(txt.splitlines())]
    rows = [r for r in rows if r[2] is not None]
    f.write_text(json.dumps(rows))
    return rows


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    out = []
    for m in MISSIONS:
        r = eda_mission(m)
        print(f"EDA {m}: {len(r)} staged rows", flush=True)
        out += r
    days, d, end = [], date.fromisoformat(START), datetime.now(timezone.utc).date()
    while d <= end:
        days.append(d.isoformat())
        d += timedelta(days=1)
    stride = int(sys.argv[1]) if len(sys.argv) > 1 else 1  # e.g. 3 = every third day (recorded in data/nasa/README.txt)
    days = days[::stride]
    n = 0
    with ThreadPoolExecutor(4) as ex:
        for day, rows in zip(days, ex.map(radlab_day, days)):
            n += 1
            if n % 100 == 0:
                print(f"RadLab {day} ({n}/{len(days)})", flush=True)
            for ts, inst, v, module, craft in rows:
                out.append(["RadLab absorbed dose rate", "", "radlab_absorbed_dose_rate", "iss" if craft == "ISS" else "", ts, v,
                            "unverified", 0, inst, module, craft, RADLAB])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT, "wt", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(FIELDS)
        w.writerows(out)
    print("wrote", OUT, len(out), "rows")


if __name__ == "__main__":
    main()
