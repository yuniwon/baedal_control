"""Connector factory utilities."""
from __future__ import annotations

from pathlib import Path
from typing import Dict

from domain import models
from .base import FileBackedConnector, SelectorMap


def load_default_connectors(base_dir: Path) -> Dict[models.Platform, FileBackedConnector]:
    selectors_dir = base_dir / "data" / "selectors"
    state_dir = base_dir / "data" / "platform_state"
    mapping = {}
    for platform, file_name in [
        (models.Platform.BAEMIN, "baemin.v2025-10-08.json"),
        (models.Platform.YOGIYO, "yogiyo.v2025-10-08.json"),
        (models.Platform.CEATS, "ceats.v2025-10-08.json"),
    ]:
        selector = SelectorMap.load(selectors_dir / file_name)
        mapping[platform] = FileBackedConnector(platform=platform, selectors=selector, state_dir=state_dir)
    return mapping
