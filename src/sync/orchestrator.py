"""High level orchestration of sync pipeline."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Dict, Iterable, List, Tuple

from connectors.base import FileBackedConnector, SelectorMap
from domain import models
from infrastructure.audit_logger import AuditLogger
from infrastructure.catalog_repository import CatalogRepository
from infrastructure.credential_store import Credential, CredentialStore
from . import diff, preview


@dataclass(slots=True)
class SyncOutcome:
    platform: models.Platform
    applied: bool
    summary: diff.DiffSummary
    result: models.ApplyResult
    validation_issues: List[preview.ValidationIssue]


class SyncOrchestrator:
    def __init__(
        self,
        catalog: CatalogRepository,
        credential_store: CredentialStore,
        audit_logger: AuditLogger,
        rule_engine: preview.PreviewRuleEngine,
        connectors: Dict[models.Platform, FileBackedConnector],
    ) -> None:
        self._catalog = catalog
        self._credential_store = credential_store
        self._audit = audit_logger
        self._rules = rule_engine
        self._connectors = connectors

    def _load_credentials(self, binding: models.CredentialBinding) -> Credential:
        return self._credential_store.load(binding.cred_ref)

    def _login(self, binding: models.CredentialBinding) -> models.AuthSession:
        connector = self._connectors[binding.platform]
        cred = self._load_credentials(binding)
        return connector.login(binding, cred.username, cred.password)

    def sync_store(self, store: models.Store, unified_items: Iterable[models.Item], actor: str) -> List[SyncOutcome]:
        unified_items_list = list(unified_items)
        snapshot = models.PlatformSnapshot(
            platform=models.Platform.BAEMIN,  # placeholder; actual store state saved per platform
            store_id=store.id,
            items=unified_items_list,
            hours=[],
            state=models.StoreState(store_id=store.id),
        )
        self._catalog.save_snapshot(snapshot)

        outcomes: List[SyncOutcome] = []
        for binding in store.bindings:
            connector = self._connectors.get(binding.platform)
            if not connector:
                continue
            try:
                session = self._login(binding)
            except ValueError as exc:
                outcomes.append(
                    SyncOutcome(
                        platform=binding.platform,
                        applied=False,
                        summary=diff.DiffSummary(updated=[], price_changed=[], availability_changed=[]),
                        result=models.ApplyResult(success=False, message=str(exc), errors=[str(exc)]),
                        validation_issues=[],
                    )
                )
                continue
            remote_snapshot = connector.fetch_snapshot(session)
            delta, summary = diff.calculate_delta(unified_items_list, remote_snapshot.items)
            issues = self._rules.validate(binding.platform, unified_items_list)
            if issues:
                outcome = SyncOutcome(
                    platform=binding.platform,
                    applied=False,
                    summary=summary,
                    result=models.ApplyResult(success=False, message="Validation failed", errors=[i.message for i in issues]),
                    validation_issues=issues,
                )
                outcomes.append(outcome)
                continue
            result = connector.apply_changes(session, delta)
            self._audit.append(
                models.AuditLog(
                    id=uuid.uuid4().hex,
                    actor=actor,
                    action=models.AuditAction.APPLY,
                    entity=f"{binding.platform.value}:{binding.shop_id}",
                    before={},
                    after={"summary": asdict(summary)},
                    ts=datetime.utcnow(),
                )
            )
            outcomes.append(
                SyncOutcome(
                    platform=binding.platform,
                    applied=result.success,
                    summary=summary,
                    result=result,
                    validation_issues=[],
                )
            )
        return outcomes

    def toggle_pause(self, store: models.Store, command: models.PauseCommand, actor: str) -> List[models.ApplyResult]:
        results: List[models.ApplyResult] = []
        for binding in store.bindings:
            connector = self._connectors[binding.platform]
            session = self._login(binding)
            result = connector.set_pause(session, command)
            results.append(result)
            self._audit.append(
                models.AuditLog(
                    id=uuid.uuid4().hex,
                    actor=actor,
                    action=models.AuditAction.PAUSE,
                    entity=f"{binding.platform.value}:{binding.shop_id}",
                    before={},
                    after={"paused": command.paused},
                    ts=datetime.utcnow(),
                )
            )
        return results

    def update_hours(self, store: models.Store, command: models.HoursCommand, actor: str) -> List[models.ApplyResult]:
        results: List[models.ApplyResult] = []
        for binding in store.bindings:
            connector = self._connectors[binding.platform]
            session = self._login(binding)
            result = connector.set_operating_hours(session, command)
            results.append(result)
            self._audit.append(
                models.AuditLog(
                    id=uuid.uuid4().hex,
                    actor=actor,
                    action=models.AuditAction.HOURS,
                    entity=f"{binding.platform.value}:{binding.shop_id}",
                    before={},
                    after={"hours": [h.__dict__ for h in command.hours]},
                    ts=datetime.utcnow(),
                )
            )
        return results
