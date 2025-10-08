"""Connector contracts and shared helpers."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Protocol

from domain import models, serialization


@dataclass(slots=True)
class SelectorMap:
    platform: models.Platform
    version: str
    payload: Dict[str, object]

    @classmethod
    def load(cls, path: Path) -> "SelectorMap":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            platform=models.Platform(data["meta"]["platform"]),
            version=data["meta"]["version"],
            payload=data,
        )


class IPlatformConnector(Protocol):
    def login(self, credential: models.CredentialBinding, username: str, password: str) -> models.AuthSession:
        ...

    def fetch_snapshot(self, session: models.AuthSession) -> models.PlatformSnapshot:
        ...

    def apply_changes(self, session: models.AuthSession, delta: models.UnifiedDelta) -> models.ApplyResult:
        ...

    def set_pause(self, session: models.AuthSession, command: models.PauseCommand) -> models.ApplyResult:
        ...

    def set_operating_hours(self, session: models.AuthSession, command: models.HoursCommand) -> models.ApplyResult:
        ...


class FileBackedConnector:
    """A connector that stores state in JSON to emulate portal behaviour."""

    def __init__(self, platform: models.Platform, selectors: SelectorMap, state_dir: Path) -> None:
        self.platform = platform
        self.selectors = selectors
        self._state_dir = state_dir
        self._state_dir.mkdir(parents=True, exist_ok=True)
        self._valid_credentials: Dict[str, str] = {}

    def _state_path(self, shop_id: str) -> Path:
        return self._state_dir / f"{shop_id.lower()}_{self.platform.value.lower()}.json"

    def register_credentials(self, shop_id: str, username: str) -> None:
        """Registers the username expected for a shop.

        Password validation is not simulated to keep the sample lightweight, but
        the mapping allows us to raise descriptive errors when a shop ID is
        unknown.
        """

        self._valid_credentials[shop_id] = username

    def login(self, credential: models.CredentialBinding, username: str, password: str) -> models.AuthSession:
        expected_username = self._valid_credentials.get(credential.shop_id)
        if expected_username is not None and expected_username != username:
            raise ValueError("AUTH_INVALID: username mismatch")
        token = f"session-{credential.shop_id}-{username}"
        return models.AuthSession(
            platform=self.platform,
            shop_id=credential.shop_id,
            token=token,
            selector_version=self.selectors.version,
        )

    def _load_state(self, shop_id: str) -> models.PlatformSnapshot:
        path = self._state_path(shop_id)
        if not path.exists():
            snapshot = models.PlatformSnapshot(
                platform=self.platform,
                store_id=shop_id,
                items=[],
                hours=[],
                state=models.StoreState(store_id=shop_id),
            )
            path.write_text(json.dumps(serialization.dump_snapshot(snapshot), ensure_ascii=False, indent=2), encoding="utf-8")
            return snapshot
        data = json.loads(path.read_text(encoding="utf-8"))
        return serialization.load_snapshot(data)

    def _save_state(self, snapshot: models.PlatformSnapshot) -> None:
        path = self._state_path(snapshot.store_id)
        path.write_text(json.dumps(serialization.dump_snapshot(snapshot), ensure_ascii=False, indent=2), encoding="utf-8")

    def fetch_snapshot(self, session: models.AuthSession) -> models.PlatformSnapshot:
        return self._load_state(session.shop_id)

    def apply_changes(self, session: models.AuthSession, delta: models.UnifiedDelta) -> models.ApplyResult:
        snapshot = self._load_state(session.shop_id)
        item_index: Dict[str, models.Item] = {item.id: item for item in snapshot.items}
        errors: List[str] = []
        for item in delta.updated_items:
            item_index[item.id] = item
        for item_id, available in delta.toggled_items.items():
            if item_id in item_index:
                item_index[item_id].available = available
            else:
                errors.append(f"Item {item_id} not found for availability toggle")
        for item_id, price in delta.price_updates.items():
            if item_id in item_index:
                item_index[item_id].price = price
            else:
                errors.append(f"Item {item_id} not found for price update")
        for item_id, sold_out in delta.sold_out_items.items():
            if item_id in item_index:
                item_index[item_id].available = not sold_out
            else:
                errors.append(f"Item {item_id} not found for sold-out toggle")
        snapshot.items = list(item_index.values())
        self._save_state(snapshot)
        return models.ApplyResult(success=len(errors) == 0, partial=bool(errors), message="Applied changes", errors=errors)

    def set_pause(self, session: models.AuthSession, command: models.PauseCommand) -> models.ApplyResult:
        snapshot = self._load_state(session.shop_id)
        snapshot.state.paused = command.paused
        snapshot.state.reason = command.reason
        snapshot.state.until = command.until
        self._save_state(snapshot)
        return models.ApplyResult(success=True, message="Updated pause state")

    def set_operating_hours(self, session: models.AuthSession, command: models.HoursCommand) -> models.ApplyResult:
        snapshot = self._load_state(session.shop_id)
        snapshot.hours = command.hours
        self._save_state(snapshot)
        return models.ApplyResult(success=True, message="Updated operating hours")
