"""Deterministic, explainable personal-baseline assessment. DECISION SUPPORT ONLY - not a diagnosis.

Daily value   = median of that metric's readings on a UTC calendar day (missing day = absent, never 0).
Anchor day    = UTC day of the astronaut's latest non-simulated observation. The dataset is historical
                (Oct 2026); a newer manual entry moves the anchor forward.
Recent window = anchor-2 .. anchor (3 days).
Baseline      = median of daily medians for anchor-30 .. anchor-3 (28 days), needs >= 5 observed days.
Drift criteria below are explicit DEMO criteria (configurable, NOT clinically validated thresholds).
A "review" needs persistent deviation (>= 2 of the 3 recent days) in >= 2 different metrics.
"""
import sqlite3
from datetime import date, datetime, timedelta, timezone
from statistics import median

RECENT_DAYS = 3
LOOKBACK_DAYS = 28
MIN_BASELINE_DAYS = 5
MIN_PERSISTENT_DAYS = 2
SIMULATED_SOURCES = ("synthetic", "demo_seed", "simulated_wearable")

# metric -> (label, unit, direction, kind, threshold). kind 'rel' = fraction of baseline, 'abs' = absolute units
DRIFT_RULES = {
    "heart_rate_bpm": ("Resting heart rate", "bpm", +1, "rel", 0.08),
    "sleep_hours": ("Sleep duration", "h", -1, "rel", 0.15),
    "stress_score": ("Self-reported stress", "/10", +1, "abs", 2.0),
    "fatigue_score": ("Self-reported fatigue", "/10", +1, "abs", 2.0),
    "temperature_c": ("Body temperature", "C", +1, "abs", 0.4),
}
OVERVIEW_BASELINE = {  # Baseline response key -> metric
    "resting_heart_rate_bpm": "heart_rate_bpm", "temperature_c": "temperature_c",
    "sleep_hours": "sleep_hours", "stress_score": "stress_score",
}
DISCLAIMER = ("Decision support only. Not a diagnosis and not a validated medical threshold. "
              "Follow approved crew medical guidance.")


def _day(ts: str) -> date:
    return datetime.strptime(ts[:10], "%Y-%m-%d").date()


def load(conn: sqlite3.Connection, astro: str):
    rows = conn.execute(
        "SELECT metric,value,measured_at,source FROM observations WHERE astronaut_id=? ORDER BY measured_at", (astro,)
    ).fetchall()
    return [dict(r) for r in rows]


def daily_medians(rows, metric: str) -> dict:
    per: dict = {}
    for r in rows:
        if r["metric"] == metric and r["source"] != "simulated_wearable":
            per.setdefault(_day(r["measured_at"]), []).append(r["value"])
    return {d: median(v) for d, v in per.items()}


def anchor_of(rows) -> date | None:
    days = [_day(r["measured_at"]) for r in rows if r["source"] != "simulated_wearable"]
    return max(days) if days else None


def baseline_for(daily: dict, anchor: date):
    lo, hi = anchor - timedelta(days=LOOKBACK_DAYS + RECENT_DAYS - 1), anchor - timedelta(days=RECENT_DAYS)
    vals = [v for d, v in daily.items() if lo <= d <= hi]
    if len(vals) < MIN_BASELINE_DAYS:
        return None
    return {"value": median(vals), "days": len(vals), "window": f"{lo.isoformat()}..{hi.isoformat()}"}


def _deviates(value, base, direction, kind, thr) -> bool:
    delta = (value - base) * direction
    return delta >= (base * thr if kind == "rel" else thr)


def _fmt(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def assess(conn: sqlite3.Connection, astro: str, anchor: date | None = None, rows=None) -> dict:
    rows = rows if rows is not None else load(conn, astro)
    anchor = anchor or anchor_of(rows)
    visible = [r for r in rows if anchor and _day(r["measured_at"]) <= anchor]
    recent_start = anchor - timedelta(days=RECENT_DAYS - 1) if anchor else None
    sim = any(r["source"] in SIMULATED_SOURCES for r in visible if _day(r["measured_at"]) >= recent_start) if anchor else False
    created = max((r["measured_at"] for r in visible), default=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))

    def make(rule, status, title, summary, contributors, nxt):
        return {"id": f"ASM-{astro}-{anchor}-{rule}", "status": status, "title": title, "summary": summary,
                "contributors": contributors, "next_action": nxt, "created_at": created,
                "is_simulated": sim, "rule_id": rule}

    if anchor is None:
        return make("no_data", "insufficient_data", "Not enough readings yet",
                    "No measurements have been recorded for this astronaut.", [], "Complete a daily check-in.")

    # explicit symptom flag from a recent check-in -> neutral medical-review message, never a treatment directive
    sym = conn.execute(
        "SELECT captured_at FROM checkins WHERE astronaut_id=? AND concerning_symptom=1 AND substr(captured_at,1,10)>=? "
        "AND substr(captured_at,1,10)<=? ORDER BY captured_at DESC LIMIT 1",
        (astro, recent_start.isoformat(), anchor.isoformat())).fetchone()
    if sym:
        return make("symptom_reported", "escalate", "Symptom reported - medical review recommended",
                    "A concerning symptom was reported in a recent check-in. This tool cannot assess it.",
                    [f"Symptom flagged in check-in at {sym['captured_at']}"],
                    "Seek crew medical guidance now and follow approved crew medical protocols.")

    recent_days = [anchor - timedelta(days=i) for i in range(RECENT_DAYS)]
    persistent, single, steady, measured = [], [], [], 0
    for metric, (label, unit, direction, kind, thr) in DRIFT_RULES.items():
        daily = daily_medians(visible, metric)
        base = baseline_for(daily, anchor)
        recent = {d: daily[d] for d in recent_days if d in daily}
        if base is None or not recent:
            continue
        measured += 1
        dev = [d for d, v in recent.items() if _deviates(v, base["value"], direction, kind, thr)]
        latest_day = max(recent)
        text = (f"{label}: recent median {_fmt(median(recent.values()))} {unit} vs personal reference {_fmt(base['value'])} {unit} "
                f"({base['days']} baseline days); {len(dev)} of {len(recent)} recent observed days beyond the demo criterion "
                f"[latest {latest_day.isoformat()}: {_fmt(recent[latest_day])} {unit}]")
        (persistent if len(dev) >= MIN_PERSISTENT_DAYS else single if dev else steady).append((metric, text))

    if measured == 0:
        return make("insufficient_baseline", "insufficient_data", "Not enough readings yet",
                    "A personal baseline needs readings on at least 5 earlier days, plus recent readings.",
                    [], "Complete daily check-ins so a personal trend can be described.")
    if len(persistent) >= 2:
        names = ", ".join(DRIFT_RULES[m][0].lower() for m, _ in persistent)
        return make("multi_metric_drift", "review", "Changes worth reviewing",
                    f"Persistent change versus this astronaut's own baseline: {names}. Demo trend criteria; not a diagnosis.",
                    [t for _, t in persistent] + [t for _, t in single],
                    "Recheck after rest and follow approved crew medical guidance if the change or any symptoms persist.")
    if persistent or single:
        return make("single_metric_note", "stable", "Minor change noted",
                    "One measure differs from the personal reference with no supporting change in other measures. Keep monitoring.",
                    [t for _, t in persistent + single], "Continue the daily check-in routine and recheck tomorrow.")
    return make("within_personal_range", "stable", "Consistent with personal trend",
                "Recent measurements are consistent with this astronaut's own baseline.",
                [t for _, t in steady], "Continue the daily check-in routine.")


def overview_blocks(rows):
    anchor = anchor_of(rows)
    if anchor is None:
        return None, None, None
    real = [r for r in rows if r["source"] != "simulated_wearable"]
    last: dict = {}
    for r in real:  # rows are time-ordered, last wins
        last[r["metric"]] = r
    pick = lambda m: last[m]["value"] if m in last else None
    latest = {
        "resting_heart_rate_bpm": pick("heart_rate_bpm"), "temperature_c": pick("temperature_c"),
        "sleep_hours": pick("sleep_hours"), "stress_score": pick("stress_score"),
        "mood_score": pick("mood_score"), "fatigue_score": pick("fatigue_score"), "pain_score": pick("pain_score"),
        "captured_at": max(r["measured_at"] for r in real),
    }
    base = {}
    for key, metric in OVERVIEW_BASELINE.items():
        b = baseline_for(daily_medians(real, metric), anchor)
        base[key] = round(b["value"], 1) if b else None
    return latest, (base if any(v is not None for v in base.values()) else None), anchor


def trend_points(rows, anchor: date | None, days: int):
    if anchor is None:
        return []
    maps = {m: daily_medians(rows, m) for m in ("heart_rate_bpm", "sleep_hours", "temperature_c", "stress_score")}
    out = []
    for i in range(days - 1, -1, -1):
        d = anchor - timedelta(days=i)
        g = lambda m: (round(maps[m][d], 1) if d in maps[m] else None)
        out.append({"date": d.isoformat(), "resting_heart_rate_bpm": g("heart_rate_bpm"), "sleep_hours": g("sleep_hours"),
                    "temperature_c": g("temperature_c"), "stress_score": g("stress_score")})
    return out


def alert_events(conn, astro: str, rows=None, span: int = 7):
    rows = rows if rows is not None else load(conn, astro)
    anchor = anchor_of(rows)
    if anchor is None:
        return []
    out = []
    for i in range(span):
        a = assess(conn, astro, anchor - timedelta(days=i), rows)
        if a["status"] in ("review", "escalate"):
            out.append(a)
    return out
