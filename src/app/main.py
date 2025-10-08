"""Command line entrypoint emulating the integrated operations console."""
from __future__ import annotations

import argparse
from datetime import datetime, time
from typing import List

from domain import models
from sync.orchestrator import SyncOutcome
from .bootstrap import build_orchestrator


class ConsolePrinter:
    def sync_outcome(self, outcomes: List[SyncOutcome]) -> None:
        for outcome in outcomes:
            print(f"[{outcome.platform.value}] 적용 성공 여부: {outcome.result.success}")
            if outcome.validation_issues:
                print("  - 사전 검증 실패:")
                for issue in outcome.validation_issues:
                    print(f"    • {issue.item_id} - {issue.field}: {issue.message}")
            print(f"  - 가격 변경: {outcome.summary.price_changed}")
            print(f"  - 품절 변경: {outcome.summary.availability_changed}")
            if outcome.result.errors:
                print("  - 오류:")
                for error in outcome.result.errors:
                    print(f"    • {error}")

    def pause_result(self, results: List[models.ApplyResult]) -> None:
        for result in results:
            status = "성공" if result.success else "실패"
            print(f"- {status}: {result.message}")


def cmd_sync(args: argparse.Namespace) -> None:
    orchestrator, store, items = build_orchestrator()
    printer = ConsolePrinter()
    outcomes = orchestrator.sync_store(store, items, actor="console")
    printer.sync_outcome(outcomes)


def cmd_pause(args: argparse.Namespace) -> None:
    orchestrator, store, _ = build_orchestrator()
    printer = ConsolePrinter()
    command = models.PauseCommand(
        store_id=store.id,
        paused=args.action == "pause",
        reason=args.reason,
        until=datetime.fromisoformat(args.until) if args.until else None,
    )
    results = orchestrator.toggle_pause(store, command, actor="console")
    printer.pause_result(results)


def cmd_hours(args: argparse.Namespace) -> None:
    orchestrator, store, _ = build_orchestrator()
    printer = ConsolePrinter()
    hours = [
        models.OperatingHours(
            store_id=store.id,
            dow=i,
            open=time.fromisoformat(args.open_time),
            close=time.fromisoformat(args.close_time),
            break_times=[],
            holiday=False,
        )
        for i in range(1, 8)
    ]
    command = models.HoursCommand(store_id=store.id, hours=hours)
    results = orchestrator.update_hours(store, command, actor="console")
    printer.pause_result(results)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="배달앱 통합관리 콘솔 (시뮬레이터)")
    sub = parser.add_subparsers(dest="command")

    sync_parser = sub.add_parser("sync", help="통합 카탈로그를 3사에 동기화")
    sync_parser.set_defaults(func=cmd_sync)

    pause_parser = sub.add_parser("pause", help="영업 상태를 일시중지 또는 해제")
    pause_parser.add_argument("action", choices=["pause", "resume"], help="pause=중지, resume=해제")
    pause_parser.add_argument("--reason", default="자동화 유지보수", help="중지 사유")
    pause_parser.add_argument("--until", help="재개 예정 시각(ISO8601)")
    pause_parser.set_defaults(func=cmd_pause)

    hours_parser = sub.add_parser("hours", help="영업 시간을 일괄 설정")
    hours_parser.add_argument("open_time", help="오픈 시간(HH:MM)")
    hours_parser.add_argument("close_time", help="마감 시간(HH:MM)")
    hours_parser.set_defaults(func=cmd_hours)

    return parser


def main(argv: List[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "func"):
        parser.print_help()
        return
    args.func(args)


if __name__ == "__main__":
    main()
