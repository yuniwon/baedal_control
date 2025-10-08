"""Diff utilities between unified catalog and platform snapshots."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from domain import models


@dataclass(slots=True)
class DiffSummary:
    updated: List[str]
    price_changed: List[Tuple[str, int, int]]
    availability_changed: List[Tuple[str, bool, bool]]


def calculate_delta(unified: Iterable[models.Item], platform: Iterable[models.Item]) -> Tuple[models.UnifiedDelta, DiffSummary]:
    unified_index: Dict[str, models.Item] = {item.id: item for item in unified}
    platform_index: Dict[str, models.Item] = {item.id: item for item in platform}

    updated_items: List[models.Item] = []
    price_updates: Dict[str, int] = {}
    availability: Dict[str, bool] = {}
    sold_out: Dict[str, bool] = {}

    updated: List[str] = []
    price_changed: List[Tuple[str, int, int]] = []
    availability_changed: List[Tuple[str, bool, bool]] = []

    for item_id, unified_item in unified_index.items():
        platform_item = platform_index.get(item_id)
        if platform_item is None:
            updated_items.append(unified_item)
            updated.append(item_id)
            continue
        if unified_item.price != platform_item.price:
            price_updates[item_id] = unified_item.price
            price_changed.append((item_id, platform_item.price, unified_item.price))
        if unified_item.available != platform_item.available:
            availability[item_id] = unified_item.available
            sold_out[item_id] = not unified_item.available
            availability_changed.append((item_id, platform_item.available, unified_item.available))
        if unified_item.desc != platform_item.desc or unified_item.name != platform_item.name:
            updated_items.append(unified_item)
            updated.append(item_id)

    delta = models.UnifiedDelta(
        updated_items=updated_items,
        toggled_items=availability,
        price_updates=price_updates,
        sold_out_items=sold_out,
    )
    summary = DiffSummary(updated=updated, price_changed=price_changed, availability_changed=availability_changed)
    return delta, summary
