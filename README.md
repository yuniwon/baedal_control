# Delivery Menu Sync

Windows 로컬 PC에서 배민, 쿠팡이츠, 땡겨요 메뉴명을 한 곳에서 관리하고 반영 준비까지 할 수 있는 Electron 기반 데스크톱 앱입니다.

상세 진행 현황과 현재 구현 상태는 [docs/current-status.md](docs/current-status.md)를 기준으로 확인합니다.

## 현재 범위

- 기준 메뉴명 / 가격 관리
- 플랫폼 계정 로컬 저장
- 계정 저장 직후 메뉴 수집
- 수집 검사 패널
- 메뉴 매핑 검토
- 메뉴 카테고리 묶음 표시
- 메뉴 원본 상태 추적
- 배민 옵션 그룹 읽기 전용 수집 / 표시
- 옵션 관리 탭
- 반영 전 미리보기
- 실행 기록 저장
- 배민 기준 메뉴 수집 검증
- 쿠팡이츠 / 땡겨요 연동 구조와 저장 흐름

## 개발 실행

```bash
npm install --ignore-scripts
npm run setup:electron
npm run dev
```

`--ignore-scripts`로 설치했기 때문에 처음 한 번은 Electron 바이너리를 별도로 받아야 합니다. `npm run setup:electron`을 실행하면 자동으로 내려받습니다.

## 빌드

```bash
npm run build
```

## 테스트

```bash
npm run test
npm run lint:types
```

## 저장 위치

- SQLite: Electron `userData` 경로의 `delivery-menu-sync.db`
- 계정 정보: Electron `userData` 경로의 `credentials.json`
- 계정 정보는 Electron `safeStorage`로 암호화된 문자열로 저장
- 개발 실행과 직접 Electron 실행도 모두 같은 `delivery-menu-sync` 경로를 사용하도록 고정

## 현재 주의사항

- 플랫폼 HTML 파서는 fixture 기반 테스트가 있으며, 실제 사장님 사이트 셀렉터는 운영 계정으로 한 번 더 검증해야 합니다.
- 메뉴 추가/수정/실행 기록 흐름은 로컬에서 동작하도록 연결되어 있습니다.
- 원본 메뉴/옵션이 2회 연속 누락되면 `플랫폼에 없음`으로 확정되며, 이 상태는 미리보기 실행 대상에서 제외됩니다.
- 메뉴와 옵션 기본 화면에서는 내부 ID를 숨기고 운영자에게 필요한 상태 정보만 먼저 보여줍니다.
- 실제 자동 로그인 후 메뉴 수정은 사이트 구조 변경 시 셀렉터 보정이 필요할 수 있습니다.
