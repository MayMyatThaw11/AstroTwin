import os
import sqlite3
import threading
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def db_path() -> str:
    return os.environ.get("ASTROTWIN_DB", str(DATA_DIR / "astrotwin.db"))


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


_local = threading.local()


def thread_conn() -> sqlite3.Connection:
    """One connection per worker thread (a shared sqlite3 connection is not safe under concurrent requests)."""
    cache = getattr(_local, "conns", None)
    if cache is None:
        cache = _local.conns = {}
    path = db_path()
    if path not in cache:
        cache[path] = connect()
    return cache[path]


SCHEMA = """
CREATE TABLE IF NOT EXISTS astronauts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, mission TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  astronaut_id TEXT NOT NULL REFERENCES astronauts(id),
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  measured_at TEXT NOT NULL,          -- UTC ISO-8601 'YYYY-MM-DDTHH:MM:SSZ'
  source TEXT NOT NULL,               -- synthetic | manual | simulated_wearable | demo_seed
  session_id TEXT,
  notes TEXT,
  import_key TEXT UNIQUE,             -- makes dataset import idempotent
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_obs ON observations(astronaut_id, metric, measured_at);
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  astronaut_id TEXT NOT NULL REFERENCES astronauts(id),
  captured_at TEXT NOT NULL,
  concerning_symptom INTEGER NOT NULL,
  symptom_note TEXT,
  countermeasure_completed INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
"""


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    conn.commit()
