# Delivery Menu Sync 에이전트 인수인계

- 기준일: 2026-04-14
- 작업 브랜치: `feature/platform-absence-option-management`
- 저장소: `https://github.com/yuniwon/baedal_control.git`
- 현재 목표: 로컬 Electron 앱 하나에서 배민 / 쿠팡이츠 / 땡겨요 메뉴와 옵션 구조를 읽고, 기준 메뉴를 한 번 수정해서 여러 플랫폼에 반영하는 통합 운영 도구 완성

## 1. 지금 바로 알아야 할 상태

- 앱은 실제 운영 DB와 자격 증명을 사용해 실행/검증 가능한 상태다.
- 최근 실운영 검증 기준
  - 배민: 메뉴 46개, 옵션 그룹 15개 import 완료
  - 쿠팡이츠: 로그인된 전용 크롬 세션 재사용 import 완료, 메뉴 35개 / 옵션 그룹 26개
  - 땡겨요: 메뉴 44개 import 완료
- 옵션 관리 화면은 실제 옵션 항목명/가격/연결 메뉴를 기준으로 동작한다.
- 메뉴/매핑에는 `platformMenuPriceVariants`가 구조적으로 저장된다.
- 원본 누락 상태는 `missing_suspected -> absent_confirmed -> resurfaced` 흐름으로 관리된다.

## 2. 이번 커밋 직전 검증 결과

- `npx vitest run tests/unit/main/baemin-adapter.test.ts tests/unit/main/catalog-import-orchestrator.test.ts --reporter=verbose`
  - 17/17 통과
- 이번 정리에서 수정한 핵심
  - 배민 어댑터 테스트가 새 가격 variant 구조와 inspection step 확장을 따라가도록 기대값 보정
  - 바인딩 정보를 제공하지 않는 플랫폼에서는 오래된 매핑 바인딩 메타데이터를 유지하지 않고 `null`로 비우도록 정리

## 3. 실행 방법

### 개발 실행

```powershell
npm install
npm run dev
```

### 빌드 후 실행

```powershell
npm run build
electron out/main/index.js
```

### 실제 운영 DB 경로

```text
C:\Users\WON2\AppData\Roaming\delivery-menu-sync\delivery-menu-sync.db
```

### 실제 자격 증명 저장 파일

```text
C:\Users\WON2\AppData\Roaming\delivery-menu-sync\credentials.json
```

## 4. 플랫폼별 현재 구현 범위

### 배민

- 저장 계정으로 로그인 후 메뉴 페이지 진입 가능
- 메뉴 import 가능
- 옵션 탭 import 가능
- 메뉴명/가격 변경 로직과 상세 검증 가드가 있음
- 금칙어가 설명/구성에 남아 있으면 저장 전에 차단
- 새 메뉴 생성 마법사 구조는 읽어뒀지만, 안전한 숨김 테스트 메뉴 전략은 아직 확정되지 않음

### 쿠팡이츠

- Playwright 직접 로그인은 차단됨
- 대신 전용 크롬 + 로그인 세션 재사용 경로로 메뉴/옵션 import 가능
- 현재 탭 읽기, 현재 세션 import, 현재 탭 반영 1차 경로가 있음
- 숨김 테스트 메뉴 기준 실제 메뉴명/가격 변경 저장 검증 완료
- 확장프로그램 / DevTools / 관리 크롬 관련 코드가 있음

### 땡겨요

- 메뉴 import 가능
- 단일 가격 메뉴의 이름/가격 변경은 실운영 왕복 검증 완료
- 다중 가격 메뉴는 `이름만 변경`하는 경우 반영 가능
- 다중 가격 메뉴의 `가격 변경`은 아직 안전하지 않아서 `price_variant_review`로 차단 중
- 이유: WebSquare 저장 payload가 가격 행 편집까지 들어가면 다른 용량 가격이 평탄화될 수 있음

## 5. 절대 건드리면 안 되는 것

- 운영 중인 실제 판매 메뉴를 테스트용으로 수정/삭제하면 안 된다.
- 테스트가 필요하면 숨김 메뉴 또는 생성 후 즉시 숨김/삭제 가능한 안전 대상만 사용한다.
- 쿠팡이츠는 Playwright 로그인 우회 시도를 계속 붙이기보다, 현재는 전용 크롬 세션 재사용 경로를 기준으로 개선한다.
- 땡겨요 다중 가격 메뉴는 editor/write model이 준비되기 전까지 실행 대상으로 올리지 않는다.
- 로컬 DB나 자격 증명 파일 자체를 저장소에 커밋하면 안 된다.

## 6. 다음 우선순위

1. 땡겨요 다중 가격 메뉴 편집 모델 설계
   - variant 행 단위 편집 구조
   - 가격 채널별 부분 수정 payload 설계
2. 배민 안전한 실저장 테스트 전략 확정
   - 숨김 테스트 메뉴 확보 또는 생성 후 비노출 정리 루틴 설계
3. 옵션 편집/반영 모델 설계
   - 옵션 그룹
   - 옵션 항목
   - 옵션 가격
   - 메뉴 연결 범위
4. 쿠팡이츠 현재 세션 경로 진단 강화
   - 실패 단계, 현재 탭 상태, 저장 결과 검증을 더 선명하게 남기기

## 7. 주요 파일

- 현재 상태 문서: `docs/current-status.md`
- 메인 import 오케스트레이션: `src/main/services/catalog-import-orchestrator.ts`
- 배민 어댑터: `src/main/platforms/baemin/adapter.ts`
- 배민 옵션 파서: `src/main/platforms/baemin/option-parser.ts`
- 배민 상세 검증 가드: `src/main/platforms/baemin/detail-guard.ts`
- 쿠팡이츠 전용 크롬 반영: `src/main/platforms/coupangeats/managed-browser-updater.ts`
- 쿠팡이츠 세션 수집: `src/main/platforms/coupangeats/browser-session-parser.ts`
- 땡겨요 어댑터: `src/main/platforms/ddangyo/adapter.ts`
- 옵션 통합 뷰 서비스: `src/main/services/logical-option-group-service.ts`
- 옵션 화면: `src/renderer/src/pages/OptionPage.tsx`

## 8. 인수인계 메모

- 이번 브랜치에는 기능 코드 외에도 테스트, 문서, 브라우저 확장프로그램 코드가 같이 들어 있다.
- 워크트리에 커밋 대상이 아닌 임시 파일이 남아 있을 수 있다.
  - `-`
  - `.tmp/`
  - `.superpowers/`
- 커밋 전에는 위 임시 파일이 stage되지 않았는지 반드시 다시 확인한다.
