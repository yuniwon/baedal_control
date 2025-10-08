from domain import models
from sync import diff


def test_calculate_delta_detects_price_and_availability_changes():
    unified = [
        models.Item(
            id="item-1",
            store_id="store-1",
            category_id="cat-1",
            name="비빔밥",
            desc="고추장 비빔밥",
            price=9000,
            available=True,
        )
    ]
    platform = [
        models.Item(
            id="item-1",
            store_id="store-1",
            category_id="cat-1",
            name="비빔밥",
            desc="고추장 비빔밥",
            price=8500,
            available=False,
        )
    ]
    delta, summary = diff.calculate_delta(unified, platform)
    assert delta.price_updates["item-1"] == 9000
    assert delta.toggled_items["item-1"] is True
    assert summary.price_changed == [("item-1", 8500, 9000)]
    assert summary.availability_changed == [("item-1", False, True)]
