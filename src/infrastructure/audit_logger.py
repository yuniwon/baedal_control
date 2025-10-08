"""Serilog-inspired structured audit logging."""
from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Iterable

from domain.models import AuditLog


class AuditLogger:
    def __init__(self, file_path: Path) -> None:
        self._path = file_path
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, log: AuditLog) -> None:
        entry = asdict(log)
        entry["ts"] = log.ts.isoformat()
        with self._path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def load_recent(self, limit: int = 100) -> Iterable[AuditLog]:
        if not self._path.exists():
            return []
        lines = self._path.read_text(encoding="utf-8").splitlines()[-limit:]
        logs: list[AuditLog] = []
        for line in lines:
            payload = json.loads(line)
            payload["ts"] = datetime.fromisoformat(payload["ts"])
            logs.append(AuditLog(**payload))
        return logs
