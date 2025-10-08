"""Preview validation against platform rules."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List

from domain import models


@dataclass(slots=True)
class ValidationIssue:
    item_id: str
    field: str
    message: str


class PreviewRuleEngine:
    def __init__(self, rule_path: Path) -> None:
        self._rules = json.loads(rule_path.read_text(encoding="utf-8"))

    def validate(self, platform: models.Platform, items: Iterable[models.Item]) -> List[ValidationIssue]:
        rules = self._rules["platforms"][platform.value]
        issues: List[ValidationIssue] = []
        for item in items:
            if item.price < rules["price"]["min"]:
                issues.append(ValidationIssue(item.id, "price", f"최소 가격({rules['price']['min']}) 미만"))
            step = rules["price"]["step"]
            if (item.price - rules["price"]["min"]) % step != 0:
                issues.append(ValidationIssue(item.id, "price", f"가격 단위({step})에 맞지 않습니다"))
            if len(item.name) > rules["name"]["maxLen"]:
                issues.append(ValidationIssue(item.id, "name", f"최대 글자수 {rules['name']['maxLen']} 초과"))
            if len(item.desc) > rules["desc"]["maxLen"]:
                issues.append(ValidationIssue(item.id, "desc", f"설명 글자수 {rules['desc']['maxLen']} 초과"))
            if len(item.options) > rules["optionGroup"]["maxGroupsPerItem"]:
                issues.append(ValidationIssue(item.id, "optionGroup", "옵션 그룹 개수 초과"))
            for group in item.options:
                if len(group.options) > rules["option"]["maxOptionsPerGroup"]:
                    issues.append(ValidationIssue(item.id, f"optionGroup:{group.id}", "옵션 개수 초과"))
                if rules["option"].get("priceDeltaStep"):
                    step_delta = rules["option"]["priceDeltaStep"]
                    for option in group.options:
                        if option.price_delta % step_delta != 0:
                            issues.append(
                                ValidationIssue(
                                    item.id,
                                    f"option:{option.id}",
                                    f"추가금 단위({step_delta})에 맞지 않습니다",
                                )
                            )
        return issues
