# Delivery Menu Sync

Windows 로컬 PC에서 배민, 쿠팡이츠, 땡겨요 메뉴명을 한 곳에서 관리하고 반영 준비까지 할 수 있는 Electron 기반 데스크톱 앱입니다.

## 현재 범위

- 기준 메뉴명 / 가격 관리
- 플랫폼 계정 로컬 저장
- 메뉴 매핑 검토
- 반영 전 미리보기
- 실행 기록 저장
- 배민 / 쿠팡이츠 / 땡겨요 어댑터 골격과 파서 fixture 테스트

## 개발 실행

```bash
npm install --ignore-scripts
npm run dev
```

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

## 현재 주의사항

- 플랫폼 HTML 파서는 fixture 기반 테스트가 있으며, 실제 사장님 사이트 셀렉터는 운영 계정으로 한 번 더 검증해야 합니다.
- 메뉴 추가/수정/실행 기록 흐름은 로컬에서 동작하도록 연결되어 있습니다.
- 실제 자동 로그인 후 메뉴 수정은 사이트 구조 변경 시 셀렉터 보정이 필요할 수 있습니다.
