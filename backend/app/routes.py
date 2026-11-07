import sqlite3
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request

from . import health_engine as eng
from .db import thread_conn
from .schemas import CheckinRequest, ObservationsIn

router = APIRouter()

# metric -> (unit, min, max). Ranges are data-entry sanity bounds only, not clinical thresholds.
FRONTEND_METRICS = {
    "heart_rate_bpm": ("bpm", 20, 250), "systolic_bp_mmhg": ("mmHg", 50, 260), "diastolic_bp_mmhg": ("mmHg", 30, 160),
    "spo2_pct": ("%", 50, 100), "temperature_c": ("°C", 30, 43), "sleep_hours": ("h", 0, 24),
    "glucose_mg_dl": ("mg/dL", 20, 600), "hrv_ms": ("ms", 1, 300), "stress_score": ("/10", 0, 10),
    "fatigue_score": ("/10", 0, 10),
}
BACKEND_ONLY_METRICS = {"mood_score": ("/5", 1, 5), "pain_score": ("/10", 0, 10)}
MISSION_START = date(2026, 9, 20)
FMT = "%Y-%m-%dT%H:%M:%SZ"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime(FMT)


def db(request: Request) -> sqlite3.Connection:
    return thread_conn()


def err(loc, msg):
    return HTTPException(422, detail=[{"loc": ["body", *loc], "msg": msg}])


def check_time(ts: str, loc) -> str:
    """Normalise to UTC ISO-8601 and refuse future timestamps (90 s clock tolerance)."""
    try:
        d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        raise err(loc, f"'{ts}' is not a valid ISO-8601 timestamp")
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    d = d.astimezone(timezone.utc)
    if d > datetime.now(timezone.utc) + timedelta(seconds=90):
        raise err(loc, "Measurement time cannot be in the future.")
    return d.strftime(FMT)


def astro_row(conn, astro_id: str):
    r = conn.execute("SELECT * FROM astronauts WHERE id=?", (astro_id,)).fetchone()
    if not r:
        raise HTTPException(404, detail=f"Unknown astronaut {astro_id}")
    return r


def astro_json(r, anchor):
    ref = anchor or datetime.now(timezone.utc).date()
    return {"id": r["id"], "name": r["name"], "role": r["role"], "mission": r["mission"],
            "mission_day": max(1, (ref - MISSION_START).days + 1), "is_simulated": True}


def obs_json(r):
    return {"id": f"OBS-{r['id']}", "astronaut_id": r["astronaut_id"], "metric": r["metric"], "value": r["value"],
            "unit": r["unit"], "measured_at": r["measured_at"], "source": r["source"],
            "notes": r["notes"], "session_id": r["session_id"]}


def source_label(rows):
    names = {"synthetic": "SYNTHETIC DATASET", "manual": "MANUAL ENTRY", "demo_seed": "DEMO SEED"}
    srcs = sorted({r["source"] for r in rows if r["source"] != "simulated_wearable"})
    return " + ".join(names.get(s, s.upper()) for s in srcs) or "NO DATA"


@router.get("/health")
def health():
    return {"status": "ok", "mode": "local-sqlite", "data_source": "synthetic crew dataset + manual entries"}


@router.get("/astronauts")
def astronauts(request: Request):
    conn = db(request)
    items = [astro_json(r, eng.anchor_of(eng.load(conn, r["id"]))) for r in conn.execute("SELECT * FROM astronauts ORDER BY id")]
    return {"items": items}


@router.get("/astronauts/{astro_id}/overview")
def overview(astro_id: str, request: Request):
    conn = db(request)
    a = astro_row(conn, astro_id)
    rows = eng.load(conn, astro_id)
    latest, base, anchor = eng.overview_blocks(rows)
    return {"astronaut": astro_json(a, anchor), "latest": latest, "baseline": base,
            "assessment": eng.assess(conn, astro_id, rows=rows), "source_label": source_label(rows)}


@router.get("/astronauts/{astro_id}/trends")
def trends(astro_id: str, request: Request, days: int = Query(7, ge=1, le=90)):
    conn = db(request)
    astro_row(conn, astro_id)
    rows = eng.load(conn, astro_id)
    return {"astronaut_id": astro_id, "days": days, "points": eng.trend_points(rows, eng.anchor_of(rows), days)}


@router.get("/astronauts/{astro_id}/alerts")
def alerts(astro_id: str, request: Request):
    conn = db(request)
    astro_row(conn, astro_id)
    return {"items": eng.alert_events(conn, astro_id)}


@router.get("/astronauts/{astro_id}/medical-summary")
def medical_summary(astro_id: str, request: Request):
    conn = db(request)
    a = astro_row(conn, astro_id)
    rows = eng.load(conn, astro_id)
    latest, base, anchor = eng.overview_blocks(rows)
    asm = eng.assess(conn, astro_id, rows=rows)
    lines = [f"MEDICAL SUMMARY - {a['name']} ({a['id']}), {a['role']}",
             f"Data as of: {anchor.isoformat() if anchor else 'n/a'} (UTC) | Data: {source_label(rows)} (fictional crew, not real medical records)",
             "", f"Status: {asm['status'].upper()} - {asm['title']}", asm["summary"], "", "Contributing observations:"]
    lines += [f"  - {c}" for c in asm["contributors"]] or ["  - none"]
    if latest:
        lines += ["", "Latest vs personal reference:"]
        for k, label in (("resting_heart_rate_bpm", "Resting HR (bpm)"), ("sleep_hours", "Sleep (h)"),
                         ("temperature_c", "Temperature (C)"), ("stress_score", "Stress (/10)")):
            b = base.get(k) if base else None
            v = latest[k]
            lines.append(f"  {label}: {v if v is not None else 'n/a'} (reference {b if b is not None else 'unavailable'})")
    lines += ["", f"Suggested next action: {asm['next_action']}", "", eng.DISCLAIMER]
    return {"astronaut_id": astro_id, "generated_at": now_iso(), "report_text": "\n".join(lines),
            "is_simulated": True, "transmitted": False}


@router.get("/astronauts/{astro_id}/observations")
def list_observations(astro_id: str, request: Request):
    conn = db(request)
    astro_row(conn, astro_id)
    marks = ",".join("?" for _ in FRONTEND_METRICS)
    rows = conn.execute(f"SELECT * FROM observations WHERE astronaut_id=? AND metric IN ({marks}) ORDER BY measured_at, id",
                        (astro_id, *FRONTEND_METRICS)).fetchall()
    return {"items": [obs_json(r) for r in rows]}


def insert_obs(conn, astro_id, metric, value, unit, ts, source, notes=None, session_id=None):
    cur = conn.execute(
        "INSERT INTO observations(astronaut_id,metric,value,unit,measured_at,source,session_id,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (astro_id, metric, value, unit, ts, source, session_id, notes, now_iso()))
    return cur.lastrowid


@router.post("/astronauts/{astro_id}/observations", status_code=201)
def add_observations(astro_id: str, body: ObservationsIn, request: Request):
    conn = db(request)
    astro_row(conn, astro_id)
    prepared = []
    for i, it in enumerate(body.items):
        if it.metric not in FRONTEND_METRICS:
            raise err(["items", i, "metric"], f"Unknown metric '{it.metric}'. Allowed: {', '.join(FRONTEND_METRICS)}")
        unit, lo, hi = FRONTEND_METRICS[it.metric]
        if not (lo <= it.value <= hi):
            raise err(["items", i, "value"], f"{it.metric} must be between {lo} and {hi} {unit}.")
        prepared.append((it, unit, check_time(it.measured_at, ["items", i, "measured_at"])))
    by_session: dict = {}
    for it, _, _ in prepared:
        if it.session_id:
            by_session.setdefault(it.session_id, {})[it.metric] = it.value
    for s in by_session.values():
        if "systolic_bp_mmhg" in s and "diastolic_bp_mmhg" in s and s["diastolic_bp_mmhg"] >= s["systolic_bp_mmhg"]:
            raise err(["items"], "Diastolic must be lower than systolic.")
    ids = [insert_obs(conn, astro_id, it.metric, it.value, unit, ts, it.source, it.notes, it.session_id) for it, unit, ts in prepared]
    conn.commit()
    marks = ",".join("?" for _ in ids)
    saved = conn.execute(f"SELECT * FROM observations WHERE id IN ({marks}) ORDER BY id", ids).fetchall()
    return {"saved": True, "items": [obs_json(r) for r in saved]}


@router.post("/checkins")
def checkin(body: CheckinRequest, request: Request):
    conn = db(request)
    astro_row(conn, body.astronaut_id)
    ts = check_time(body.captured_at, ["captured_at"])
    cur = conn.execute(
        "INSERT INTO checkins(astronaut_id,captured_at,concerning_symptom,symptom_note,countermeasure_completed,created_at) VALUES (?,?,?,?,?,?)",
        (body.astronaut_id, ts, int(body.concerning_symptom), body.symptom_note, int(body.countermeasure_completed), now_iso()))
    cid = f"CHK-{cur.lastrowid:06d}"
    fields = {"heart_rate_bpm": body.resting_heart_rate_bpm, "temperature_c": body.temperature_c, "sleep_hours": body.sleep_hours,
              "stress_score": body.stress_score, "fatigue_score": body.fatigue_score, "mood_score": body.mood_score,
              "pain_score": body.pain_score}
    for metric, value in fields.items():
        unit = (FRONTEND_METRICS.get(metric) or BACKEND_ONLY_METRICS[metric])[0]
        insert_obs(conn, body.astronaut_id, metric, value, unit, ts, "manual", None, cid)
    conn.commit()
    return {"checkin_id": cid, "saved": True, "assessment": eng.assess(conn, body.astronaut_id)}
