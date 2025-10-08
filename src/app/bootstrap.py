"""Bootstrap utilities for loading sample data and infrastructure objects."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Tuple

from connectors.registry import load_default_connectors
from domain import models, serialization
from infrastructure.audit_logger import AuditLogger
from infrastructure.catalog_repository import CatalogRepository
from infrastructure.credential_store import Credential, CredentialStore
from sync.preview import PreviewRuleEngine
from sync.orchestrator import SyncOrchestrator


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"


def _load_store_config(path: Path) -> Tuple[models.Store, Iterable[models.Item]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    store_data = payload["store"]
    store = models.Store(
        id=store_data["id"],
        name=store_data["name"],
        bindings=[
            models.CredentialBinding(
                platform=models.Platform(binding["platform"]),
                shop_id=binding["shopId"],
                cred_ref=binding["credRef"],
            )
            for binding in store_data["bindings"]
        ],
    )
    items = [serialization.load_item(item) for item in payload["items"]]
    return store, items


def _ensure_credentials(store: models.Store, credential_store: CredentialStore) -> None:
    defaults = {
        "cred-baemin": ("manager@baemin", "password1!"),
        "cred-yogiyo": ("manager@yogiyo", "password1!"),
        "cred-ceats": ("manager@ceats", "password1!"),
    }
    for binding in store.bindings:
        cred_id = binding.cred_ref
        if cred_id not in defaults:
            continue
        try:
            credential_store.load(cred_id)
        except KeyError:
            username, password = defaults[cred_id]
            credential_store.save(cred_id, Credential(username=username, password=password))


def build_orchestrator() -> Tuple[SyncOrchestrator, models.Store, Iterable[models.Item]]:
    store, items = _load_store_config(DATA_DIR / "sample_store.json")
    catalog = CatalogRepository(BASE_DIR / "runtime" / "catalog.db")
    credentials = CredentialStore(BASE_DIR / "runtime" / "credentials.json")
    _ensure_credentials(store, credentials)
    audit = AuditLogger(BASE_DIR / "runtime" / "audit.log")
    rules = PreviewRuleEngine(DATA_DIR / "rules" / "preview.rules.json")
    connectors = load_default_connectors(BASE_DIR)
    for binding in store.bindings:
        connector = connectors.get(binding.platform)
        if connector:
            connector.register_credentials(binding.shop_id, credentials.load(binding.cred_ref).username)
    orchestrator = SyncOrchestrator(
        catalog=catalog,
        credential_store=credentials,
        audit_logger=audit,
        rule_engine=rules,
        connectors=connectors,
    )
    return orchestrator, store, items
