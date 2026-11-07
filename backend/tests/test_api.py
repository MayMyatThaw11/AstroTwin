import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ASTROTWIN_DB", str(tmp_path / "t.db"))
    from app.main import app
    with TestClient(app) as c:
        yield c


def count(client, sql, *args):
    return client.app.state.conn.execute(sql, args).fetchone()[0]


def test_health(client):
    assert client.get("/health").status_code == 200
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_seed_counts_and_idempotent(client):
    assert len(client.get("/api/v1/astronauts").json()["items"]) == 6
    assert count(client, "SELECT COUNT(*) FROM observations") == 180 * 5  # 180 records x 5 metrics
    from app.seed import seed
    again = seed(client.app.state.conn)
    assert again["observations_inserted"] == 0
    assert count(client, "SELECT COUNT(*) FROM observations") == 900


def test_ast002_drift_is_review_others_not(client):
    st = {a: client.get(f"/api/v1/astronauts/{a}/overview").json()["assessment"]["status"]
          for a in ("AST-001", "AST-002", "AST-003", "AST-004", "AST-005", "AST-006")}
    assert st["AST-002"] == "review"
    assert all(v == "stable" for k, v in st.items() if k != "AST-002"), st
    a = client.get("/api/v1/astronauts/AST-002/overview").json()["assessment"]
    assert a["is_simulated"] and len(a["contributors"]) >= 2
    assert client.get("/api/v1/astronauts/AST-002/alerts").json()["items"]
    assert client.get("/api/v1/astronauts/AST-001/alerts").json()["items"] == []


def test_post_observation_persists_and_isolated(client):
    before = client.get("/api/v1/astronauts/AST-001/observations").json()["items"]
    now = datetime.now(timezone.utc).isoformat()
    r = client.post("/api/v1/astronauts/AST-001/observations",
                    json={"items": [{"metric": "heart_rate_bpm", "value": 91, "unit": "bpm", "measured_at": now}]})
    assert r.status_code == 201 and r.json()["saved"]
    after = client.get("/api/v1/astronauts/AST-001/observations").json()["items"]
    assert len(after) == len(before) + 1 and after[-1]["value"] == 91 and after[-1]["source"] == "manual"
    other = client.get("/api/v1/astronauts/AST-003/observations").json()["items"]
    assert not any(o["source"] == "manual" for o in other)
    ov = client.get("/api/v1/astronauts/AST-001/overview").json()
    assert ov["latest"]["resting_heart_rate_bpm"] == 91
    assert "MANUAL" in ov["source_label"]


def test_validation_and_future_rejected(client):
    url = "/api/v1/astronauts/AST-001/observations"
    now = datetime.now(timezone.utc)
    bad = client.post(url, json={"items": [{"metric": "heart_rate_bpm", "value": 900, "measured_at": now.isoformat()}]})
    assert bad.status_code == 422
    fut = client.post(url, json={"items": [{"metric": "heart_rate_bpm", "value": 70, "measured_at": (now + timedelta(days=1)).isoformat()}]})
    assert fut.status_code == 422
    unk = client.post(url, json={"items": [{"metric": "foo", "value": 1, "measured_at": now.isoformat()}]})
    assert unk.status_code == 422
    bp = client.post(url, json={"items": [
        {"metric": "systolic_bp_mmhg", "value": 80, "measured_at": now.isoformat(), "session_id": "s"},
        {"metric": "diastolic_bp_mmhg", "value": 90, "measured_at": now.isoformat(), "session_id": "s"}]})
    assert bp.status_code == 422
    assert client.get("/api/v1/astronauts/NOPE/overview").status_code == 404


def test_checkin_persists_and_updates_assessment(client):
    body = dict(astronaut_id="AST-003", resting_heart_rate_bpm=64, temperature_c=36.6, sleep_hours=7.2, stress_score=2,
                mood_score=4, fatigue_score=2, pain_score=0, concerning_symptom=False, symptom_note="",
                countermeasure_completed=True, captured_at=datetime.now(timezone.utc).isoformat())
    r = client.post("/api/v1/checkins", json=body)
    assert r.status_code == 200 and r.json()["saved"] and r.json()["checkin_id"].startswith("CHK-")
    assert count(client, "SELECT COUNT(*) FROM checkins") == 1
    ov = client.get("/api/v1/astronauts/AST-003/overview").json()
    assert ov["latest"]["fatigue_score"] == 2 and ov["latest"]["mood_score"] == 4
    body["concerning_symptom"] = True
    esc = client.post("/api/v1/checkins", json=body).json()["assessment"]
    assert esc["status"] == "escalate" and "diagnos" not in esc["next_action"].lower().replace("not a diagnosis", "")
    bad = client.post("/api/v1/checkins", json={**body, "resting_heart_rate_bpm": 999})
    assert bad.status_code == 422


def test_trends_windows_and_gaps(client):
    t7 = client.get("/api/v1/astronauts/AST-001/trends?days=7").json()
    t30 = client.get("/api/v1/astronauts/AST-001/trends?days=30").json()
    assert len(t7["points"]) == 7 and len(t30["points"]) == 30
    assert t7["points"][-1]["date"] == "2026-10-30"  # historical dataset anchor, not today
    # a later manual entry moves the anchor and leaves a null gap (never 0)
    when = datetime.now(timezone.utc).isoformat()
    client.post("/api/v1/astronauts/AST-001/observations", json={"items": [{"metric": "heart_rate_bpm", "value": 70, "measured_at": when}]})
    t7 = client.get("/api/v1/astronauts/AST-001/trends?days=7").json()["points"]
    assert t7[-1]["resting_heart_rate_bpm"] == 70 and t7[-1]["sleep_hours"] is None
    assert all(p["resting_heart_rate_bpm"] is None or p["resting_heart_rate_bpm"] > 0 for p in t7)


def test_missing_metrics_unavailable(client):
    ms = {o["metric"] for o in client.get("/api/v1/astronauts/AST-001/observations").json()["items"]}
    assert not ms & {"spo2_pct", "glucose_mg_dl", "hrv_ms", "systolic_bp_mmhg", "diastolic_bp_mmhg"}


def test_cors(client):
    for origin in ("http://localhost:5173", "http://localhost:5174"):
        r = client.options("/api/v1/checkins", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                                        "Access-Control-Request-Headers": "content-type"})
        assert r.headers.get("access-control-allow-origin") == origin
    r = client.get("/api/v1/astronauts", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_medical_summary(client):
    s = client.get("/api/v1/astronauts/AST-002/medical-summary").json()
    assert s["transmitted"] is False and "Decision support only" in s["report_text"]


def test_concurrent_requests_do_not_fail(client):
    from concurrent.futures import ThreadPoolExecutor
    urls = [f"/api/v1/astronauts/AST-00{i % 6 + 1}/{p}" for i in range(24) for p in ("overview", "trends?days=7", "alerts")]
    with ThreadPoolExecutor(12) as ex:
        codes = list(ex.map(lambda u: client.get(u).status_code, urls))
    assert set(codes) == {200}

def test_environment_import_idempotent_and_counts(client):
    c = client.app.state.conn
    n = lambda sql, *a: c.execute(sql, a).fetchone()[0]
    total = n("SELECT COUNT(*) FROM env_samples")
    assert total == 12087 * 6 + 39 * 4 + 2969
    assert n("SELECT COUNT(*) FROM env_samples WHERE metric='co2_ppm'") == 12087 * 2
    assert n("SELECT COUNT(*) FROM env_samples WHERE metric='radlab_absorbed_dose_rate'") == 2969
    from app.environment import import_nasa
    import_nasa(c)
    assert n("SELECT COUNT(*) FROM env_samples") == total


def test_environment_endpoints(client):
    m = client.get("/api/v1/environment/metrics").json()
    assert m["is_live"] is False and {i["id"] for i in m["items"]} >= {"co2_ppm", "temperature_c", "humidity_pct", "radiation_total_mgy_d"}
    assert any(i["id"] == "radlab_absorbed_dose_rate" and i["unit_verified"] is False for i in m["items"])
    s = client.get("/api/v1/environment/summary").json()
    assert s["is_live"] is False and "not any astronaut" in s["not_personal_dose"] and len(s["sources"]) == 3
    h = client.get("/api/v1/environment/history?metric=co2&days=7").json()
    assert h["location"] == "iss" and h["points"] and h["window"]["end"].startswith("2014-11-01")
    assert all(1862 <= p["min"] and p["max"] <= 4667 for p in h["points"])
    g = client.get("/api/v1/environment/history?metric=co2&days=7&location=ground").json()
    assert g["points"][0]["value"] != h["points"][0]["value"] or g["location"] == "ground"
    r = client.get("/api/v1/environment/history?metric=radiation&days=30").json()
    assert r["bucket"] == "day" and r["metric"]["unit"] == "mGy/day"
    assert client.get("/api/v1/environment/history?metric=bogus").status_code == 422
    assert client.get("/api/v1/environment/history?metric=co2&location=mars").status_code == 422
    assert client.get("/api/v1/environment/history?metric=co2&days=0").status_code == 422


def test_health_data_not_mixed_with_environment(client):
    obs = client.get("/api/v1/astronauts/AST-001/observations").json()["items"]
    assert all(not o["metric"].startswith(("co2", "radi", "humid")) for o in obs)
