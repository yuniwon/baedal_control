"""SQLite-backed repository for persisting unified catalog snapshots."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Optional

from domain import models, serialization


_SCHEMA = """
CREATE TABLE IF NOT EXISTS unified_catalog (
    store_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


class CatalogRepository:
    """Persists unified catalog state as JSON blobs inside SQLite."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(_SCHEMA)
            conn.commit()

    def save_snapshot(
        self,
        snapshot: models.PlatformSnapshot,
    ) -> None:
        payload = json.dumps(serialization.dump_snapshot(snapshot), ensure_ascii=False)
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "REPLACE INTO unified_catalog(store_id, payload, updated_at) VALUES(?,?,datetime('now'))",
                (snapshot.store_id, payload),
            )
            conn.commit()

    def load_snapshot(self, store_id: str) -> Optional[models.PlatformSnapshot]:
        with sqlite3.connect(self._db_path) as conn:
            row = conn.execute("SELECT payload FROM unified_catalog WHERE store_id=?", (store_id,)).fetchone()
            if not row:
                return None
            payload = json.loads(row[0])
            return serialization.load_snapshot(payload)
