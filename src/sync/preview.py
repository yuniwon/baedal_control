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
        group_rules = rules.get("optionGroup", {})
        option_rules = rules.get("option", {})
        min_select = group_rules.get("minSelect")
        max_select = group_rules.get("maxSelect")
        require_if_min_gt0 = group_rules.get("requireIfMinGt0", False)
        price_delta_step = option_rules.get("priceDeltaStep")
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
            if len(item.options) > group_rules.get("maxGroupsPerItem", float("inf")):
                issues.append(ValidationIssue(item.id, "optionGroup", "옵션 그룹 개수 초과"))
            for group in item.options:
                if min_select is not None and group.min < min_select:
                    issues.append(
                        ValidationIssue(
                            item.id,
                            f"optionGroup:{group.id}",
                            f"최소 선택 수는 {min_select} 이상이어야 합니다",
                        )
                    )
                if max_select is not None and group.max > max_select:
                    issues.append(
                        ValidationIssue(
                            item.id,
                            f"optionGroup:{group.id}",
                            f"최대 선택 수는 {max_select} 이하여야 합니다",
                        )
                    )
                if group.min > group.max:
                    issues.append(
                        ValidationIssue(
                            item.id,
                            f"optionGroup:{group.id}",
                            "최소 선택 수가 최대 선택 수보다 큽니다",
                        )
                    )
                if require_if_min_gt0 and group.min > 0 and not group.required:
                    issues.append(
                        ValidationIssue(
                            item.id,
                            f"optionGroup:{group.id}",
                            "최소 선택 수가 0보다 크면 필수 선택으로 설정해야 합니다",
                        )
                    )
                if len(group.options) > option_rules.get("maxOptionsPerGroup", float("inf")):
                    issues.append(ValidationIssue(item.id, f"optionGroup:{group.id}", "옵션 개수 초과"))
                if price_delta_step:
                    for option in group.options:
                        if option.price_delta % price_delta_step != 0:
                            issues.append(
                                ValidationIssue(
                                    item.id,
                                    f"option:{option.id}",
                                    f"추가금 단위({price_delta_step})에 맞지 않습니다",
                                )
                            )
        return issues
