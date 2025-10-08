from pathlib import Path

from domain import models
from sync.preview import PreviewRuleEngine


def test_preview_validation_enforces_option_group_constraints():
    rules_path = Path(__file__).resolve().parents[1] / "data" / "rules" / "preview.rules.json"
    engine = PreviewRuleEngine(rules_path)
    item = models.Item(
        id="item-constraint",
        store_id="store-1",
        category_id="cat-1",
        name="세트 메뉴",
        desc="테스트용 세트",
        price=6000,
        available=True,
        options=[
            models.OptionGroup(
                id="grp-1",
                item_id="item-constraint",
                name="추가 선택",
                min=2,
                max=12,
                required=False,
                sort=0,
                options=[
                    models.Option(
                        id="opt-1",
                        group_id="grp-1",
                        name="김치 추가",
                        price_delta=0,
                        default=False,
                        available=True,
                    ),
                    models.Option(
                        id="opt-2",
                        group_id="grp-1",
                        name="단무지 추가",
                        price_delta=0,
                        default=False,
                        available=True,
                    ),
                ],
            )
        ],
        external_mappings=[],
    )

    issues = engine.validate(models.Platform.BAEMIN, [item])
    fields_and_messages = {(issue.field, issue.message) for issue in issues}

    assert ("optionGroup:grp-1", "최대 선택 수는 10 이하여야 합니다") in fields_and_messages
    assert ("optionGroup:grp-1", "최소 선택 수가 0보다 크면 필수 선택으로 설정해야 합니다") in fields_and_messages
