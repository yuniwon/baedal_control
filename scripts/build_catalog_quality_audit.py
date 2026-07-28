from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import nbformat
from nbclient import NotebookClient


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "docs" / "reports" / "catalog-quality-audit"
DB_PATH = Path(os.environ["APPDATA"]) / "delivery-menu-sync" / "delivery-menu-sync.db"
GENERATED_AT = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


COVERAGE_SQL = """
with baemin_menus as (
  select distinct menu_id
  from platform_menu_mappings
  where platform_code = 'baemin' and mapping_status = 'active'
), target_counts as (
  select b.menu_id, p.platform_code, count(m.platform_menu_id) as target_count
  from baemin_menus b
  cross join (
    select 'coupangeats' platform_code union all
    select 'ddangyo' union all
    select 'deliveryspecial' union all
    select 'yogiyo'
  ) p
  left join platform_menu_mappings m
    on m.menu_id = b.menu_id
   and m.platform_code = p.platform_code
   and m.mapping_status = 'active'
  group by b.menu_id, p.platform_code
)
select platform_code,
       count(*) as baemin_reference_count,
       sum(target_count > 0) as matched_count,
       sum(target_count = 1) as one_to_one_count,
       sum(target_count > 1) as one_to_many_count,
       sum(target_count = 0) as missing_count,
       round(1.0 * sum(target_count > 0) / count(*), 4) as match_rate
from target_counts
group by platform_code
order by platform_code
""".strip()

PLATFORM_ONLY_SQL = """
select m.base_name, m.base_price,
       group_concat(mm.platform_code || ':' || mm.platform_menu_name, ' | ') as sources,
       count(distinct mm.platform_code) as platform_count
from menus m
join platform_menu_mappings mm
  on mm.menu_id = m.menu_id and mm.mapping_status = 'active'
where not exists (
  select 1 from platform_menu_mappings b
  where b.menu_id = m.menu_id
    and b.platform_code = 'baemin'
    and b.mapping_status = 'active'
)
group by m.menu_id
order by m.base_name
""".strip()

REVIEW_SQL = """
select kind, platform_code, title, recommendation, evidence_json
from catalog_review_items
where state = 'open'
order by kind, platform_code, title
""".strip()

OPTION_SQL = """
select platform_code,
       count(*) as option_group_count,
       sum(mapping_menus_count) as declared_binding_count,
       sum(json_array_length(menus_json)) as stored_binding_count
from platform_option_groups
where presence_status = 'present'
group by platform_code
order by platform_code
""".strip()

CATALOG_SQL = """
select platform_code, count(*) as menu_count, max(last_seen_at) as last_seen_at
from platform_menus
where presence_status = 'present'
group by platform_code
order by platform_code
""".strip()


def rows(connection: sqlite3.Connection, sql: str) -> list[dict]:
    return [dict(row) for row in connection.execute(sql)]


def source(source_id: str, label: str, sql: str, tables: list[str]) -> dict:
    return {
        "id": source_id,
        "label": label,
        "query": {
            "engine": "sqlite",
            "language": "sql",
            "sql": sql,
            "description": label,
            "tables_used": tables,
            "executed_at": GENERATED_AT,
            "filters": ["presence_status = present where applicable", "reference platform = baemin"],
        },
    }


def build_artifact(connection: sqlite3.Connection) -> dict:
    coverage = rows(connection, COVERAGE_SQL)
    catalogs = {row["platform_code"]: row for row in rows(connection, CATALOG_SQL)}
    options = {row["platform_code"]: row for row in rows(connection, OPTION_SQL)}
    platform_labels = {
        "coupangeats": "쿠팡이츠",
        "ddangyo": "땡겨요",
        "deliveryspecial": "배달특급",
        "yogiyo": "요기요",
        "baemin": "배달의민족",
    }
    coverage_rows = []
    for row in coverage:
        platform = row["platform_code"]
        coverage_rows.append({
            **row,
            "platform_name": platform_labels[platform],
            "catalog_menu_count": catalogs[platform]["menu_count"],
            "option_group_count": options[platform]["option_group_count"],
            "option_binding_count": options[platform]["stored_binding_count"],
            "last_seen_at": catalogs[platform]["last_seen_at"],
        })

    platform_only = rows(connection, PLATFORM_ONLY_SQL)
    for item in platform_only:
        item["source_platforms"] = ", ".join(sorted({
            source_item.split(":", 1)[0]
            for source_item in item["sources"].split(" | ")
        }))
    reviews = rows(connection, REVIEW_SQL)
    for item in reviews:
        evidence = json.loads(item.pop("evidence_json") or "{}")
        item["canonical_price"] = evidence.get("canonicalPrice")
        item["platform_price"] = evidence.get("platformPrice")
        item["difference"] = evidence.get("difference")
    price_reviews = [row for row in reviews if row["kind"] == "price_outlier"]
    duplicate_reviews = [row for row in reviews if row["kind"] == "duplicate_option_group"]
    missing_reviews = [row for row in reviews if row["kind"] == "missing_on_platform"]

    summary = [{
        "baemin_reference_count": 46,
        "collected_platform_count": 5,
        "missing_review_count": len(missing_reviews),
        "platform_only_count": len(platform_only),
        "price_review_count": len(price_reviews),
        "duplicate_option_review_count": len(duplicate_reviews),
    }]

    audit_source = source(
        "coverage_sql",
        "배민 기준 플랫폼 매칭 집계",
        COVERAGE_SQL,
        ["platform_menu_mappings", "platform_menus", "platform_option_groups"],
    )
    review_source = source(
        "review_sql",
        "현재 열린 검토 항목",
        REVIEW_SQL,
        ["catalog_review_items"],
    )
    platform_only_source = source(
        "platform_only_sql",
        "배민 원본이 없는 통합메뉴",
        PLATFORM_ONLY_SQL,
        ["menus", "platform_menu_mappings"],
    )

    title = "배달 플랫폼 메뉴 수집·통합 품질 점검"
    manifest = {
        "version": 1,
        "surface": "report",
        "title": title,
        "description": "배달의민족을 기준으로 메뉴·가격·옵션 수집과 플랫폼 간 매칭 상태를 점검한 보고서",
        "generatedAt": GENERATED_AT,
        "cards": [
            {"id": "reference_card", "description": "현재 배민 원본에 연결된 기준 메뉴 수", "dataset": "summary", "sourceId": "coverage_sql", "metrics": [{"label": "배민 기준 메뉴", "field": "baemin_reference_count", "format": "number"}]},
            {"id": "missing_card", "description": "배민 기준 메뉴 중 대상 플랫폼 연결이 없는 플랫폼별 합계", "dataset": "summary", "sourceId": "review_sql", "metrics": [{"label": "실제 누락 검토", "field": "missing_review_count", "format": "number"}]},
            {"id": "platform_only_card", "description": "배민 원본 없이 다른 플랫폼 원본만 연결된 통합메뉴", "dataset": "summary", "sourceId": "platform_only_sql", "metrics": [{"label": "플랫폼 전용 후보", "field": "platform_only_count", "format": "number"}]},
            {"id": "price_card", "description": "기준 가격과 다른 상태로 남은 검토 항목", "dataset": "summary", "sourceId": "review_sql", "metrics": [{"label": "가격 차이 검토", "field": "price_review_count", "format": "number"}]},
        ],
        "charts": [{
            "id": "coverage_chart",
            "title": "플랫폼별 배민 기준 메뉴 연결률",
            "subtitle": "요기요는 M/L이 별도 행이어서 1:N 연결을 보존해야 합니다.",
            "type": "bar",
            "dataset": "coverage",
            "sourceId": "coverage_sql",
            "valueFormat": "percent",
            "encodings": {
                "x": {"field": "platform_name", "type": "nominal", "label": "플랫폼"},
                "y": {"field": "match_rate", "type": "quantitative", "label": "연결률"},
                "tooltip": [
                    {"field": "matched_count", "type": "quantitative", "label": "연결 메뉴"},
                    {"field": "one_to_many_count", "type": "quantitative", "label": "1:N 메뉴"},
                    {"field": "missing_count", "type": "quantitative", "label": "미연결 메뉴"},
                ],
            },
        }],
        "tables": [
            {"id": "coverage_table", "title": "매칭 구조와 수집 완결성", "subtitle": "옵션 연결 선언 수와 저장 수가 전 플랫폼에서 일치했습니다.", "dataset": "coverage", "sourceId": "coverage_sql", "defaultSort": {"field": "match_rate", "direction": "desc"}, "columns": [
                {"field": "platform_name", "label": "플랫폼", "type": "text"},
                {"field": "one_to_one_count", "label": "1:1", "format": "number"},
                {"field": "one_to_many_count", "label": "1:N", "format": "number"},
                {"field": "missing_count", "label": "배민 기준 미연결", "format": "number"},
                {"field": "match_rate", "label": "연결률", "format": "percent"},
            ]},
            {"id": "price_table", "title": "가격 차이 검토 7건", "subtitle": "자동 덮어쓰기 전에 전략 가격인지 입력 실수인지 확인해야 합니다.", "dataset": "price_reviews", "sourceId": "review_sql", "defaultSort": {"field": "difference", "direction": "asc"}, "columns": [
                {"field": "platform_code", "label": "플랫폼", "type": "text"},
                {"field": "title", "label": "메뉴", "type": "text"},
                {"field": "canonical_price", "label": "배민 기준가", "format": "number"},
                {"field": "platform_price", "label": "플랫폼가", "format": "number"},
                {"field": "difference", "label": "차이", "format": "number"},
            ]},
            {"id": "platform_only_table", "title": "배민 원본이 없는 통합메뉴 27개", "subtitle": "동일 메뉴 별칭과 실제 플랫폼 전용 메뉴가 섞여 있어 승인형 정리가 필요합니다.", "dataset": "platform_only", "sourceId": "platform_only_sql", "defaultSort": {"field": "base_name", "direction": "asc"}, "columns": [
                {"field": "base_name", "label": "통합메뉴", "type": "text"},
                {"field": "base_price", "label": "기준가", "format": "number"},
                {"field": "source_platforms", "label": "원본 플랫폼", "type": "text"},
                {"field": "platform_count", "label": "플랫폼 수", "format": "number"},
            ]},
        ],
        "sources": [
            {"id": "coverage_sql", "label": "배민 기준 플랫폼 매칭 집계"},
            {"id": "review_sql", "label": "현재 열린 검토 항목"},
            {"id": "platform_only_sql", "label": "배민 원본이 없는 통합메뉴"},
        ],
        "blocks": [
            {"id": "title", "type": "markdown", "body": f"# {title}"},
            {"id": "executive_summary", "type": "markdown", "sourceId": "coverage_sql", "body": "## Executive Summary\n\n수집 원장은 구조적으로 완전합니다. 배민 46개, 쿠팡이츠 38개, 땡겨요 44개, 배달특급 47개, 요기요 71개를 보유하며 모든 옵션 연결 수가 원장 선언 수와 일치합니다. 현재 위험은 수집 누락보다 잘못 확장된 검토 큐와 플랫폼별 모델 차이입니다."},
            {"id": "metrics", "type": "metric-strip", "cardIds": ["reference_card", "missing_card", "platform_only_card", "price_card"]},
            {"id": "mapping_heading", "type": "markdown", "body": "## Mapping Coverage\n\n배민 메뉴를 그대로 한 행에 대응할 수 있는 플랫폼과, 사이즈를 별도 메뉴로 유지해야 하는 플랫폼을 구분했습니다."},
            {"id": "coverage_chart_block", "type": "chart", "chartId": "coverage_chart"},
            {"id": "coverage_table_block", "type": "table", "tableId": "coverage_table"},
            {"id": "findings", "type": "markdown", "body": "## Critical Findings\n\n- 쿠팡이츠·땡겨요·배달특급은 연결된 배민 메뉴가 모두 1:1입니다.\n- 요기요는 배민 메뉴 17개가 M/L 두 행으로 분리된 1:2 구조입니다. 이름과 가격을 한 행처럼 덮어쓰면 안 됩니다.\n- 배민 원본이 없는 27개 통합메뉴에는 고구마/반반 M·L, 소스 별칭, 음료 용량 분리처럼 합칠 가능성이 높은 항목과 요기요 전용 스파게티처럼 실제 전용 메뉴가 함께 있습니다.\n- 자동 정리는 정확 일치·구조 일치만 수행하고, 별칭·가격 전략·M/L 병합은 승인형 후보로 제시해야 합니다."},
            {"id": "price_heading", "type": "markdown", "body": "## Price and Option Exceptions\n\n가격 차이 7건은 모두 수집 오류로 단정할 수 없습니다. 배달특급의 소스·사이드 가격과 요기요 두판 메뉴 가격은 플랫폼 전략일 수 있어 검토 후 정책으로 저장해야 합니다. 배달특급의 동일한 M/L 가격 옵션 그룹 2개는 통합뷰에서 하나로 합쳐 보여줄 수 있습니다."},
            {"id": "price_table_block", "type": "table", "tableId": "price_table"},
            {"id": "platform_only_heading", "type": "markdown", "body": "## Platform-only and Alias Candidates\n\n갈릭소스↔갈릭디핑, 피클↔국산피클, 치즈가루↔파마산 치즈가루, 수제요거트소스↔요거트소스, 요기요 고구마/반반 M·L은 우선 검토 후보입니다. 자동 적용 전 한 번 확인하면 이후 같은 별칭은 의도 규칙으로 재사용할 수 있습니다."},
            {"id": "platform_only_table_block", "type": "table", "tableId": "platform_only_table"},
            {"id": "recommendations", "type": "markdown", "body": "## Recommendations\n\n1. 배민 기준 누락 검토만 생성하고 플랫폼 전용 메뉴는 별도 승인 큐로 유지합니다.\n2. 매칭은 1:1, 1:N 사이즈, 별칭 후보, 플랫폼 전용의 네 상태로 표시합니다.\n3. 옵션은 원본 그룹을 삭제하지 않고 통합뷰에서만 논리 병합하며, 선택 슬롯 1/2는 별도 유지합니다.\n4. 현재 쓰기 자동화는 배민·쿠팡이츠·땡겨요의 메뉴명·가격 중심입니다. 옵션 생성/편집과 요기요·배달특급 쓰기는 아직 자동 적용 대상으로 보면 안 됩니다.\n5. 수집 완료 플래그와 메뉴/옵션/연결 계수가 모두 맞을 때만 최신 원장으로 승격합니다."},
            {"id": "caveats", "type": "markdown", "body": "## Caveats and Reproducibility\n\n배민과 땡겨요는 2026-07-28 실수집으로 재확인했습니다. 쿠팡이츠·요기요·배달특급은 로그인 갱신 요구로 재시도를 중단했으며 마지막 완전 수집본을 사용했습니다. 네이버주문은 아직 수집 미지원입니다. 분석 계산은 동봉된 Jupyter 노트북에서 재현할 수 있습니다."},
        ],
    }
    # The portable reader's wide native tables currently overflow at desktop width.
    # Keep exact rows in the snapshot and companion notebook; the report uses the
    # validated chart and narrative summary until the shared table layout is fixed.
    manifest["tables"] = []
    manifest["blocks"] = [block for block in manifest["blocks"] if block["type"] != "table"]
    return {
        "surface": "report",
        "manifest": manifest,
        "snapshot": {
            "version": 1,
            "generatedAt": GENERATED_AT,
            "status": "ready",
            "datasets": {
                "summary": summary,
                "coverage": coverage_rows,
                "price_reviews": price_reviews,
                "platform_only": platform_only,
            },
            "accessIssues": [],
        },
        "sources": [audit_source, review_source, platform_only_source],
    }


def build_notebook() -> nbformat.NotebookNode:
    notebook = nbformat.v4.new_notebook()
    notebook["metadata"]["kernelspec"] = {"display_name": "Python 3", "language": "python", "name": "python3"}
    notebook["cells"] = [
        nbformat.v4.new_markdown_cell("# 배달 플랫폼 메뉴 수집·통합 품질 점검\n\n## TL;DR\n\n배민 기준 매칭률, 플랫폼 전용 메뉴, 가격·옵션 예외를 로컬 SQLite 원장에서 재계산합니다."),
        nbformat.v4.new_markdown_cell("## Context & Methods\n\n배달의민족을 기준 플랫폼으로 두고 현재 존재하는 원본 메뉴만 분석합니다. 1:1과 1:N 매칭을 분리하고 옵션 선언 연결 수와 저장 연결 수를 대조합니다."),
        nbformat.v4.new_code_cell("import os, sqlite3, json\nfrom pathlib import Path\nDB_PATH = Path(os.environ['APPDATA']) / 'delivery-menu-sync' / 'delivery-menu-sync.db'\nconnection = sqlite3.connect(f'file:{DB_PATH}?mode=ro', uri=True)\nconnection.row_factory = sqlite3.Row\ndef rows(sql): return [dict(row) for row in connection.execute(sql)]\nDB_PATH.name"),
        nbformat.v4.new_markdown_cell("## Data"),
        nbformat.v4.new_code_cell(f"coverage_sql = {COVERAGE_SQL!r}\ncoverage = rows(coverage_sql)\ncoverage"),
        nbformat.v4.new_code_cell(f"catalogs = rows({CATALOG_SQL!r})\noptions = rows({OPTION_SQL!r})\ncatalogs, options"),
        nbformat.v4.new_markdown_cell("## Results"),
        nbformat.v4.new_code_cell(f"platform_only = rows({PLATFORM_ONLY_SQL!r})\nlen(platform_only), platform_only"),
        nbformat.v4.new_code_cell(f"reviews = rows({REVIEW_SQL!r})\nfrom collections import Counter\nCounter(row['kind'] for row in reviews)"),
        nbformat.v4.new_code_cell("assert all(row['declared_binding_count'] == row['stored_binding_count'] for row in options)\nassert len(platform_only) == 27\nassert sum(row['missing_count'] for row in coverage) == 34\n'quality checks passed'"),
        nbformat.v4.new_markdown_cell("## Takeaways\n\n수집 완결성은 양호합니다. 통합 적용에서는 요기요 1:N 사이즈 구조를 보존하고, 플랫폼 전용 27개를 별칭 후보와 실제 전용 메뉴로 승인 분류해야 합니다. 가격 차이와 옵션 슬롯은 자동 병합하지 않습니다."),
    ]
    return notebook


def build_markdown(artifact: dict) -> str:
    datasets = artifact["snapshot"]["datasets"]
    coverage = datasets["coverage"]
    price_reviews = datasets["price_reviews"]
    platform_only = datasets["platform_only"]
    lines = [
        "# 배달 플랫폼 메뉴 수집·통합 품질 점검",
        "",
        f"점검 시각: {artifact['snapshot']['generatedAt']}",
        "",
        "## 결론",
        "",
        "메뉴·옵션 원장은 정상 수집됐습니다. 핵심 문제는 수집 누락보다 플랫폼별 메뉴 모델 차이와 검토 큐 노이즈였습니다. 배민 기준이 없는 임시 통합메뉴를 모든 플랫폼의 누락으로 계산하던 로직을 수정해 누락 검토를 130건에서 34건으로 줄였습니다.",
        "",
        "## 배민 기준 매칭",
        "",
        "| 플랫폼 | 수집 메뉴 | 1:1 | 1:N | 미연결 | 연결률 | 옵션 그룹 | 옵션 연결 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in sorted(coverage, key=lambda item: item["match_rate"], reverse=True):
        lines.append(
            f"| {row['platform_name']} | {row['catalog_menu_count']} | {row['one_to_one_count']} | "
            f"{row['one_to_many_count']} | {row['missing_count']} | {row['match_rate']:.1%} | "
            f"{row['option_group_count']} | {row['option_binding_count']} |"
        )
    lines.extend([
        "",
        "요기요의 1:N 17건은 피자 M/L을 별도 메뉴 행으로 관리하는 정상적인 구조 차이입니다. 통합메뉴 한 건을 적용할 때 두 원본 행에 사이즈별 가격을 각각 투영해야 합니다.",
        "",
        "## 가격 차이 검토",
        "",
        "| 플랫폼 | 항목 | 배민 기준가 | 플랫폼가 | 차이 |",
        "|---|---|---:|---:|---:|",
    ])
    for row in price_reviews:
        lines.append(
            f"| {row['platform_code']} | {row['title'].replace(' 가격이 플랫폼과 다릅니다', '')} | "
            f"{row['canonical_price']:,} | {row['platform_price']:,} | {row['difference']:+,} |"
        )
    lines.extend([
        "",
        "## 배민 원본이 없는 통합메뉴",
        "",
        f"총 {len(platform_only)}개입니다. 아래 원본은 자동 병합하지 않고 승인형 후보로 다뤄야 합니다.",
        "",
    ])
    for item in platform_only:
        lines.append(f"- {item['base_name']} ({item['base_price']:,}원): {item['sources']}")
    lines.extend([
        "",
        "우선 별칭 후보는 갈릭소스↔갈릭디핑, 피클↔국산피클, 치즈가루↔파마산 치즈가루, 수제요거트소스↔요거트소스, 요기요 고구마/반반 M·L입니다. 요기요의 여러 스파게티와 배달특급 칠리불새피자는 실제 플랫폼 전용일 가능성이 높습니다.",
        "",
        "## 옵션과 적용 가능 범위",
        "",
        "- 모든 플랫폼에서 옵션 그룹의 선언 연결 수와 저장된 메뉴 연결 수가 정확히 일치했습니다.",
        "- 배달특급의 동일 M/L 가격 그룹 2개는 원본 삭제 없이 통합 화면에서 논리적으로 합쳐 표시할 수 있습니다.",
        "- 요기요의 `메뉴 선택1/2`, `토핑 추가 선택1/2`는 두 판의 각 슬롯이므로 중복 삭제 대상이 아닙니다.",
        "- 현재 자동 쓰기는 배민·쿠팡이츠·땡겨요의 메뉴명·가격 중심입니다. 옵션 생성/편집과 요기요·배달특급 쓰기는 아직 지원하지 않습니다.",
        "",
        "## 수집 재확인 범위",
        "",
        "배민은 이번 점검에서 46개 메뉴·12개 옵션 그룹을 재수집했고, 땡겨요는 직전 실수집 44개 메뉴·11개 옵션 그룹을 확인했습니다. 쿠팡이츠·요기요·배달특급은 로그인 갱신 요구에서 안전 중단했으며 마지막 완전 수집본을 사용했습니다. 네이버주문은 아직 미지원입니다.",
    ])
    return "\n".join(lines) + "\n"


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        artifact = build_artifact(connection)
    finally:
        connection.close()
    (OUTPUT_DIR / "artifact.json").write_text(
        json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUTPUT_DIR / "catalog-quality-audit.md").write_text(
        build_markdown(artifact), encoding="utf-8"
    )
    notebook = build_notebook()
    NotebookClient(notebook, timeout=120, kernel_name="python3").execute()
    nbformat.write(notebook, OUTPUT_DIR / "catalog-quality-audit.ipynb")
    print(json.dumps({
        "artifact": str(OUTPUT_DIR / "artifact.json"),
        "report": str(OUTPUT_DIR / "catalog-quality-audit.md"),
        "notebook": str(OUTPUT_DIR / "catalog-quality-audit.ipynb"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
