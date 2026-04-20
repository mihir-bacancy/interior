"""SQLite state store for the Pinterest→Instagram pipeline.

All persistent pipeline state lives in a single DB file so that work
survives between Claude sessions. Tables:

  videos   — every Pinterest video we downloaded
  captions — OpenAI-generated captions attached to videos
  posts    — scheduled + published Instagram posts
  config   — key/value settings (e.g. last used account)
"""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "state.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    pin_id        TEXT UNIQUE NOT NULL,
    keyword       TEXT NOT NULL,
    title         TEXT,
    local_path    TEXT NOT NULL,
    source_url    TEXT,
    width         INTEGER,
    height        INTEGER,
    duration_ms   INTEGER,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_for_post INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS captions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id      INTEGER NOT NULL REFERENCES videos(id),
    text          TEXT NOT NULL,
    model         TEXT,
    generated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id             INTEGER NOT NULL REFERENCES videos(id),
    caption_id           INTEGER REFERENCES captions(id),
    outstand_account_id  TEXT NOT NULL,
    scheduled_at         TIMESTAMP NOT NULL,
    status               TEXT DEFAULT 'scheduled',
    outstand_post_id     TEXT,
    outstand_media_id    TEXT,
    error_message        TEXT,
    posted_at            TIMESTAMP,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_status_time ON posts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_videos_used ON videos(used_for_post);

CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


def get_db_path() -> Path:
    override = os.environ.get("INTERIOR_DB_PATH")
    if override:
        return Path(override)
    return DB_PATH


def init() -> Path:
    path = get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)
    return path


@contextmanager
def connect():
    init()
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ---------- videos ----------

def insert_video(**fields) -> int:
    """Insert or return existing id for a pin_id. Returns video id."""
    with connect() as conn:
        cur = conn.execute("SELECT id FROM videos WHERE pin_id = ?", (fields["pin_id"],))
        row = cur.fetchone()
        if row:
            return row["id"]
        cur = conn.execute(
            """
            INSERT INTO videos (pin_id, keyword, title, local_path, source_url,
                                width, height, duration_ms)
            VALUES (:pin_id, :keyword, :title, :local_path, :source_url,
                    :width, :height, :duration_ms)
            """,
            fields,
        )
        return cur.lastrowid


def get_video(video_id: int):
    with connect() as conn:
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        return dict(row) if row else None


def list_unused_videos(limit: int = 50):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM videos WHERE used_for_post = 0 ORDER BY downloaded_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def list_videos_without_caption(limit: int = 50):
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT v.* FROM videos v
            LEFT JOIN captions c ON c.video_id = v.id
            WHERE c.id IS NULL
            ORDER BY v.downloaded_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def mark_video_used(video_id: int):
    with connect() as conn:
        conn.execute("UPDATE videos SET used_for_post = 1 WHERE id = ?", (video_id,))


# ---------- captions ----------

def insert_caption(video_id: int, text: str, model: str) -> int:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO captions (video_id, text, model) VALUES (?, ?, ?)",
            (video_id, text, model),
        )
        return cur.lastrowid


def latest_caption_for_video(video_id: int):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM captions WHERE video_id = ? ORDER BY id DESC LIMIT 1",
            (video_id,),
        ).fetchone()
        return dict(row) if row else None


# ---------- posts ----------

def insert_post(**fields) -> int:
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO posts (video_id, caption_id, outstand_account_id,
                               scheduled_at, status)
            VALUES (:video_id, :caption_id, :outstand_account_id,
                    :scheduled_at, :status)
            """,
            {**{"status": "scheduled"}, **fields},
        )
        return cur.lastrowid


def due_posts(now_iso: str):
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT p.*, v.local_path, v.title, c.text AS caption
            FROM posts p
            JOIN videos v ON v.id = p.video_id
            LEFT JOIN captions c ON c.id = p.caption_id
            WHERE p.status = 'scheduled' AND p.scheduled_at <= ?
            ORDER BY p.scheduled_at ASC
            """,
            (now_iso,),
        ).fetchall()
        return [dict(r) for r in rows]


def list_posts(status: str | None = None, limit: int = 100):
    with connect() as conn:
        if status:
            rows = conn.execute(
                """SELECT p.*, v.title, v.local_path, c.text AS caption
                   FROM posts p JOIN videos v ON v.id=p.video_id
                   LEFT JOIN captions c ON c.id=p.caption_id
                   WHERE p.status = ?
                   ORDER BY p.scheduled_at ASC LIMIT ?""",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT p.*, v.title, v.local_path, c.text AS caption
                   FROM posts p JOIN videos v ON v.id=p.video_id
                   LEFT JOIN captions c ON c.id=p.caption_id
                   ORDER BY p.scheduled_at ASC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]


def update_post(post_id: int, **fields):
    if not fields:
        return
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = post_id
    with connect() as conn:
        conn.execute(f"UPDATE posts SET {sets} WHERE id = :id", fields)


# ---------- config ----------

def set_config(key: str, value: str):
    with connect() as conn:
        conn.execute(
            "INSERT INTO config (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def get_config(key: str, default: str | None = None):
    with connect() as conn:
        row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default
