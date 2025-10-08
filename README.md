# 배달앱 통합관리 콘솔 (시뮬레이터)

이 저장소는 PRD 요구사항을 토대로 설계된 "배달앱 통합관리" 프로그램의 참조 구현입니다. 실제 WinUI 대신 파이썬 기반 CLI/서비스 계층을 구현하여 **통합 카탈로그 관리, 커넥터, 감사 로그, 사전 검증** 흐름을 재현합니다.

## 주요 기능

- `domain/`: 통합 카탈로그 스키마(스토어, 메뉴, 옵션, 영업시간 등) 데이터클래스 정의
- `infrastructure/`: SQLite 카탈로그 저장소, 자격증명 저장소(DPAPI 대체), 감사 로그
- `connectors/`: 배달의민족, 요기요, 쿠팡이츠 커넥터. 버전드 셀렉터 JSON을 읽어 가짜 포털 상태(JSON)와 동기화
- `sync/`: Diff 계산, 플랫폼별 사전 검증 룰, 동기화 오케스트레이터 및 에러 코드 사전
- `app/`: CLI 엔트리포인트 (`python -m app.main`)와 부트스트랩 유틸리티
- `data/`: PRD에서 정의한 셀렉터/룰 템플릿 및 샘플 스토어/메뉴 데이터

## 빠른 시작

```bash
# 1) 테스트 실행
python -m pytest

# 2) 통합 카탈로그를 3개 플랫폼에 동기화 (샘플 데이터)
PYTHONPATH=src python -m app.main sync

# 3) 영업 중지/해제
PYTHONPATH=src python -m app.main pause pause --reason "점검" --until 2025-10-08T22:00:00+09:00
PYTHONPATH=src python -m app.main pause resume

# 4) 영업시간 일괄 변경
PYTHONPATH=src python -m app.main hours 10:00 22:00
```

`runtime/` 디렉터리에는 SQLite DB, 자격증명 파일, 감사 로그가 생성됩니다. 커넥터는 `data/platform_state/`에 플랫폼별 스냅샷을 JSON으로 저장하여 RPA 시뮬레이션을 쉽게 확인할 수 있습니다.

## 테스트

- `pytest` 기반 단위 테스트 (`src/tests/`)

## 한계

- WinUI UI는 포함되어 있지 않으며 CLI 기반으로 논리/백엔드 흐름을 검증합니다.
- RPA 자동화 대신 JSON 파일을 통한 모의 플랫폼 상태 업데이트로 대체했습니다.
- 실서비스에서는 DPAPI, Playwright, Windows Service 등과 연계해야 합니다.
