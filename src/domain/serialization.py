"""Utility helpers for serialising domain models to and from dictionaries."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, time
from typing import Any, Dict, Iterable, List, Type, TypeVar

from . import models

T = TypeVar("T")


def _time_to_string(value: time) -> str:
    return value.strftime("%H:%M")


def _time_from_string(raw: str) -> time:
    hour, minute = [int(x) for x in raw.split(":")]
    return time(hour=hour, minute=minute)


def _datetime_to_string(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _datetime_from_string(raw: str | None) -> datetime | None:
    return datetime.fromisoformat(raw) if raw else None


def dump_item(item: models.Item) -> Dict[str, Any]:
    data = asdict(item)
    for group in data["options"]:
        for option in group["options"]:
            # dataclasses already flattened, nothing to adjust
            pass
    return data


def load_item(data: Dict[str, Any]) -> models.Item:
    groups: List[models.OptionGroup] = []
    for group in data.get("options", []):
        options = [models.Option(**option) for option in group.get("options", [])]
        groups.append(models.OptionGroup(options=options, **{k: v for k, v in group.items() if k != "options"}))
    mappings = [models.ItemMapping(**mapping) for mapping in data.get("external_mappings", [])]
    return models.Item(options=groups, external_mappings=mappings, **{k: v for k, v in data.items() if k not in {"options", "external_mappings"}})


def dump_hours(hours: Iterable[models.OperatingHours]) -> List[Dict[str, Any]]:
    payload: List[Dict[str, Any]] = []
    for entry in hours:
        payload.append(
            {
                "store_id": entry.store_id,
                "dow": entry.dow,
                "open": _time_to_string(entry.open),
                "close": _time_to_string(entry.close),
                "holiday": entry.holiday,
                "break_times": [
                    {"start": _time_to_string(br.start), "end": _time_to_string(br.end)} for br in entry.break_times
                ],
            }
        )
    return payload


def load_hours(rows: Iterable[Dict[str, Any]]) -> List[models.OperatingHours]:
    hours: List[models.OperatingHours] = []
    for row in rows:
        breaks = [models.OperatingHoursBreak(start=_time_from_string(b["start"]), end=_time_from_string(b["end"])) for b in row.get("break_times", [])]
        hours.append(
            models.OperatingHours(
                store_id=row["store_id"],
                dow=row["dow"],
                open=_time_from_string(row["open"]),
                close=_time_from_string(row["close"]),
                break_times=breaks,
                holiday=row.get("holiday", False),
            )
        )
    return hours


def dump_store_state(state: models.StoreState) -> Dict[str, Any]:
    return {
        "store_id": state.store_id,
        "paused": state.paused,
        "reason": state.reason,
        "until": _datetime_to_string(state.until),
    }


def load_store_state(data: Dict[str, Any]) -> models.StoreState:
    return models.StoreState(
        store_id=data["store_id"],
        paused=data.get("paused", False),
        reason=data.get("reason"),
        until=_datetime_from_string(data.get("until")),
    )


def load_snapshot(data: Dict[str, Any]) -> models.PlatformSnapshot:
    return models.PlatformSnapshot(
        platform=models.Platform(data["platform"]),
        store_id=data["store_id"],
        items=[load_item(item) for item in data.get("items", [])],
        hours=load_hours(data.get("hours", [])),
        state=load_store_state(data.get("state", {"store_id": data["store_id"]})),
    )


def dump_snapshot(snapshot: models.PlatformSnapshot) -> Dict[str, Any]:
    return {
        "platform": snapshot.platform.value,
        "store_id": snapshot.store_id,
        "items": [dump_item(item) for item in snapshot.items],
        "hours": dump_hours(snapshot.hours),
        "state": dump_store_state(snapshot.state),
    }


def load_items(rows: Iterable[Dict[str, Any]]) -> List[models.Item]:
    return [load_item(row) for row in rows]


def dump_items(items: Iterable[models.Item]) -> List[Dict[str, Any]]:
    return [dump_item(item) for item in items]


def load_entity(entity_cls: Type[T], data: Dict[str, Any]) -> T:
    return entity_cls(**data)
