from datetime import date

from app import health_engine as eng


def rows(metric, values_by_day, source="manual"):
    return [{"metric": metric, "value": v, "measured_at": f"{d}T08:00:00Z", "source": source} for d, v in values_by_day.items()]


def test_baseline_needs_five_days():
    daily = {date(2026, 10, d): 65.0 for d in range(1, 5)}
    assert eng.baseline_for(daily, date(2026, 10, 30)) is None
    daily = {date(2026, 10, d): 65.0 for d in range(1, 6)}
    assert eng.baseline_for(daily, date(2026, 10, 30))["value"] == 65.0


def test_daily_median_and_gaps():
    r = rows("heart_rate_bpm", {"2026-10-01": 60}) + rows("heart_rate_bpm", {"2026-10-01": 70}) + rows("heart_rate_bpm", {"2026-10-03": 80})
    d = eng.daily_medians(r, "heart_rate_bpm")
    assert d[date(2026, 10, 1)] == 65 and date(2026, 10, 2) not in d


def test_simulated_wearable_excluded_from_anchor():
    r = rows("heart_rate_bpm", {"2026-10-01": 60}) + rows("heart_rate_bpm", {"2026-11-01": 150}, "simulated_wearable")
    assert eng.anchor_of(r) == date(2026, 10, 1)


def test_single_metric_deviation_is_not_review():
    base = {f"2026-10-{d:02d}": 65 for d in range(1, 28)}
    hr = rows("heart_rate_bpm", {**base, "2026-10-28": 90, "2026-10-29": 91, "2026-10-30": 92})
    import sqlite3
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE checkins(astronaut_id,captured_at,concerning_symptom)")
    a = eng.assess(conn, "X", rows=hr)
    assert a["status"] == "stable" and a["rule_id"] == "single_metric_note"
