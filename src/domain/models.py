"""Domain models representing the unified catalog schema described in the PRD."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time
from enum import Enum
from typing import Dict, List, Optional


class Platform(str, Enum):
    BAEMIN = "BAEMIN"
    YOGIYO = "YOGIYO"
    CEATS = "CEATS"


@dataclass(slots=True)
class CredentialBinding:
    platform: Platform
    shop_id: str
    cred_ref: str


@dataclass(slots=True)
class Store:
    id: str
    name: str
    bindings: List[CredentialBinding] = field(default_factory=list)


@dataclass(slots=True)
class Category:
    id: str
    store_id: str
    name: str
    sort: int = 0
    active: bool = True


@dataclass(slots=True)
class Option:
    id: str
    group_id: str
    name: str
    price_delta: int = 0
    default: bool = False
    available: bool = True


@dataclass(slots=True)
class OptionGroup:
    id: str
    item_id: str
    name: str
    min: int = 0
    max: int = 0
    required: bool = False
    sort: int = 0
    options: List[Option] = field(default_factory=list)


@dataclass(slots=True)
class ItemMapping:
    platform: Platform
    external_id: str


@dataclass(slots=True)
class Item:
    id: str
    store_id: str
    category_id: str
    name: str
    desc: str
    price: int
    sku: Optional[str] = None
    image_url: Optional[str] = None
    available: bool = True
    options: List[OptionGroup] = field(default_factory=list)
    external_mappings: List[ItemMapping] = field(default_factory=list)


@dataclass(slots=True)
class OperatingHoursBreak:
    start: time
    end: time


@dataclass(slots=True)
class OperatingHours:
    store_id: str
    dow: int
    open: time
    close: time
    break_times: List[OperatingHoursBreak] = field(default_factory=list)
    holiday: bool = False


class InventoryType(str, Enum):
    INFINITE = "INFINITE"
    COUNT = "COUNT"


@dataclass(slots=True)
class Inventory:
    item_id: str
    type: InventoryType
    qty: Optional[int] = None
    low: Optional[int] = None
    auto_sold_out: bool = True


@dataclass(slots=True)
class StoreState:
    store_id: str
    paused: bool = False
    reason: Optional[str] = None
    until: Optional[datetime] = None


class AuditAction(str, Enum):
    APPLY = "APPLY"
    PAUSE = "PAUSE"
    HOURS = "HOURS"
    SYNC = "SYNC"


@dataclass(slots=True)
class AuditLog:
    id: str
    actor: str
    action: AuditAction
    entity: str
    before: Dict[str, object]
    after: Dict[str, object]
    ts: datetime


@dataclass(slots=True)
class PlatformSnapshot:
    platform: Platform
    store_id: str
    items: List[Item]
    hours: List[OperatingHours]
    state: StoreState


@dataclass(slots=True)
class UnifiedDelta:
    updated_items: List[Item] = field(default_factory=list)
    toggled_items: Dict[str, bool] = field(default_factory=dict)
    price_updates: Dict[str, int] = field(default_factory=dict)
    sold_out_items: Dict[str, bool] = field(default_factory=dict)


@dataclass(slots=True)
class PauseCommand:
    store_id: str
    paused: bool
    reason: Optional[str] = None
    until: Optional[datetime] = None


@dataclass(slots=True)
class HoursCommand:
    store_id: str
    hours: List[OperatingHours]


@dataclass(slots=True)
class ApplyResult:
    success: bool
    message: str
    errors: List[str] = field(default_factory=list)
    partial: bool = False


@dataclass(slots=True)
class AuthSession:
    platform: Platform
    shop_id: str
    token: str
    selector_version: str
