"""SQLite is the source of truth. Indexes are rebuildable derived state."""

import json
import sqlite3
from pathlib import Path
from threading import RLock
from typing import Any

from .schema import Paper


class Store:
    def __init__(self, path: str | Path):
        self.lock = RLock()
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS papers (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, kind TEXT, created TEXT, payload TEXT);
        """)
        self.db.commit()

    def papers(self) -> list[Paper]:
        with self.lock:
            return [
                Paper.model_validate_json(r[0])
                for r in self.db.execute("SELECT payload FROM papers ORDER BY id").fetchall()
            ]

    def add(self, papers: list[Paper]) -> None:
        with self.lock, self.db:
            self.db.executemany(
                "INSERT OR REPLACE INTO papers VALUES (?,?)", [(p.id, p.model_dump_json()) for p in papers]
            )

    def save_run(self, run: dict[str, Any], kind: str) -> None:
        with self.lock, self.db:
            self.db.execute(
                "INSERT INTO runs VALUES (?,?,?,?)", (run["id"], kind, run["created"], json.dumps(run))
            )

    def runs(self, kind: str | None = None) -> list[dict[str, Any]]:
        with self.lock:
            rows = self.db.execute(
                "SELECT payload FROM runs WHERE (? IS NULL OR kind=?) ORDER BY created DESC LIMIT 100",
                (kind, kind),
            ).fetchall()
            return [json.loads(r[0]) for r in rows]

    def run_counts(self) -> dict[str, int]:
        with self.lock:
            return dict(self.db.execute("SELECT kind, COUNT(*) FROM runs GROUP BY kind").fetchall())

    def close(self) -> None:
        self.db.close()
