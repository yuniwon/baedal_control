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
- 기준 메뉴도 `basePriceVariants`를 저장할 수 있고, 메뉴 관리에서 다중 가격 초안을 직접 편집할 수 있다.
- 원본 누락 상태는 `missing_suspected -> absent_confirmed -> resurfaced` 흐름으로 관리된다.

## 2. 이번 커밋 직전 검증 결과

- `npm test`
  - 59개 파일, 237개 테스트 통과
- `npm run lint:types`
  - 통과
- `npm run build`
  - 통과
- `npx electron out/main/index.js --task=inspect-create-menu-flow --platformCode=baemin`
  - 통과
  - 저장된 배민 계정으로 로그인 후 메뉴 목록과 `메뉴 추가` 버튼 존재까지는 확인
  - 하지만 자동화 클릭 후에도 생성 1단계가 열리지 않아 `baemin_create_wizard_not_opened`로 종료
- 이번 정리에서 수정한 핵심
  - `platform_menus`에 한 번도 저장되지 않은 legacy active 매핑도 import 결측 추적 대상에 포함되도록 보강
  - 첫 import에서 `missing_suspected`, 두 번째 import에서 `absent_confirmed + source_absent`로 승격되도록 테스트 추가
  - 배민 쓰기 실패 시 어댑터가 현재 페이지 스냅샷(`platform_page_snapshot`)을 에러에 부착하고, sync 엔진이 이를 실행 기록의 `failure_context_json`으로 저장하도록 보강
    - 현재 화면 종류뿐 아니라 `operationStage`도 함께 남김
  - 실행 기록 UI가 배민 실패 당시 본문 텍스트 일부까지 보여주도록 보강
  - 배민 생성 마법사 읽기 전용 CLI 점검 경로 추가
    - `inspect-create-menu-flow`
    - 메뉴 목록 단계에서는 `메뉴 추가` 같은 핵심 컨트롤을 먼저 노출
    - 생성 1단계가 안 열리면 raw timeout 대신 `baemin_create_wizard_not_opened:{page summary}`로 명확히 실패 기록
  - 실제 운영 DB 기준으로 배민 import 2회 연속 실행 검증 완료
    - 결과: 오래된 숨김 배민 매핑들이 `source_absent`로 정리되고 해당 로컬 메뉴도 `is_managed = 0` 처리됨
  - 실제 운영 DB 기준으로 배민 `통마늘바베큐피자(59707584)` 실패 재현 검증 완료
    - 로컬 기준 메뉴명만 일시 변경해 실행 후보를 만든 뒤 저장 전 차단 실패를 유도
    - 결과: `failure_context_json`에 `platform_page_snapshot`, `operationStage: 이름 변경 전 상세 검증`, `menu_detail`, 실패 직전 본문 텍스트가 저장됨
    - 검증 직후 로컬 DB 원복 및 `sync-preview` 0건 재확인

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
- legacy active 매핑이 `platform_menus`에 없더라도 import 2회로 `source_absent`까지 자동 정리됨
- 쓰기 실패 시 현재 배민 화면 제목 / 화면 종류 / 실패 단계 / 본문 텍스트 일부를 `failure_context_json`으로 남긴다.
- 생성 마법사 구조는 사용자 수동 캡처 기준으로 파악했지만, 현재 자동화 경로에서는 `메뉴 추가` 클릭 후 1단계가 열리지 않는다.
- 즉, 배민 새 테스트 메뉴 생성 자동화는 아직 미완료이며 안전한 실저장 검증은 기존 숨김/품절 메뉴 중심으로 이어가야 한다.

### 쿠팡이츠

- Playwright 직접 로그인은 차단됨
- 대신 전용 크롬 + 로그인 세션 재사용 경로로 메뉴/옵션 import 가능
- 현재 탭 읽기, 현재 세션 import, 현재 탭 반영 1차 경로가 있음
- 숨김 테스트 메뉴 기준 실제 메뉴명/가격 변경 저장 검증 완료
- 확장프로그램 / DevTools / 관리 크롬 관련 코드가 있음

### 땡겨요

- 메뉴 import 가능
- 단일 가격 메뉴의 이름/가격 변경은 실운영 왕복 검증 완료
- 다중 가격 메뉴도 `variant 구조가 현재 플랫폼과 같을 때`는 가격 변경까지 실행 가능
- 숨김 다중 가격 메뉴 `칠성사이다` 기준 `2,900원 -> 3,000원 -> 2,900원` 실운영 왕복 검증 완료
- 저장 성공 메시지 `적용 완료되었습니다.`가 남아 다음 동작을 막지 않도록 성공 후 `확인/닫기` 정리 로직이 들어가 있음
- 성공 직후 `SyncSuccessReconciler`가 mapping / platform_menus를 낙관적으로 갱신하고, 같은 기준 메뉴에 남은 작업이 없으면 `menus.is_dirty = 0`으로 자동 정리함
- 단일 플랫폼 숨김 메뉴 `고구마베이컨 피자` 기준 `21,900원 -> 22,000원 -> 21,900원` 실운영 왕복 검증에서 clean 자동 정리 확인
- planner와 adapter가 `previousPriceVariants / nextPriceVariants`를 사용해 구조를 비교한다.
- WebSquare 입력 ID `gen_menuPrc_{row}_ibx_menuPrc{channel}` 기준으로 행/채널별 금액을 개별 입력한다.
- 구조가 다르거나 variant 정보가 비어 있으면 계속 `price_variant_review`로 차단한다.

## 5. 절대 건드리면 안 되는 것

- 운영 중인 실제 판매 메뉴를 테스트용으로 수정/삭제하면 안 된다.
- 테스트가 필요하면 숨김 메뉴 또는 생성 후 즉시 숨김/삭제 가능한 안전 대상만 사용한다.
- 쿠팡이츠는 Playwright 로그인 우회 시도를 계속 붙이기보다, 현재는 전용 크롬 세션 재사용 경로를 기준으로 개선한다.
- 땡겨요 다중 가격 메뉴는 `variant 구조 일치`가 확인된 경우에만 실행한다.
- 로컬 DB나 자격 증명 파일 자체를 저장소에 커밋하면 안 된다.

## 6. 다음 우선순위

1. 배민 안전한 실저장 테스트 전략 확정
   - legacy 숨김 매핑 정리는 끝났고, 이제 실제로 저장을 왕복 검증할 안전 대상만 남음
   - 현재 생성 마법사 자동화는 `baemin_create_wizard_not_opened`에서 막히므로, 우선은 기존 숨김/품절 메뉴 기반 검증을 계속하고 별도로 새 메뉴 진입 조건을 조사
2. 배민 저장 성공 후 후속 단계 진단 보강
   - 실패 직전 화면 기록은 붙었음
   - 다음은 저장 성공 직후 토스트/잔존 모달/재진입 지연 같은 후속 단계 로그를 더 선명하게 남기는 것
3. 옵션 편집/반영 모델 설계
   - 옵션 그룹
   - 옵션 항목
   - 옵션 가격
   - 메뉴 연결 범위
4. 쿠팡이츠 현재 세션 경로 진단 강화
   - 실패 단계, 현재 탭 상태, 저장 결과 검증을 더 선명하게 남기기

## 6.1 실제 운영 DB 메모

- 2026-04-14 배민 import를 2회 연속 실행해 아래 오래된 숨김 매핑이 `source_absent`로 정리됨
  - `69971302 Set 5`
  - `69971308 Set 6`
  - `59707679 / 69971252 쉬림프골드`
  - `59707692 / 69971257 포테이토골드`
  - `59712444 / 69971240 오지즈후라이피자`
- 같은 패턴의 오래된 세트/사이드 메뉴들도 함께 `absent_confirmed`로 정리되었으니, 다음 에이전트는 이 상태를 정상으로 보고 이어서 작업하면 됨

## 7. 주요 파일

- 현재 상태 문서: `docs/current-status.md`
- 메인 import 오케스트레이션: `src/main/services/catalog-import-orchestrator.ts`
- 배민 어댑터: `src/main/platforms/baemin/adapter.ts`
- 배민 옵션 파서: `src/main/platforms/baemin/option-parser.ts`
- 배민 상세 검증 가드: `src/main/platforms/baemin/detail-guard.ts`
- 쿠팡이츠 전용 크롬 반영: `src/main/platforms/coupangeats/managed-browser-updater.ts`
- 쿠팡이츠 세션 수집: `src/main/platforms/coupangeats/browser-session-parser.ts`
- 땡겨요 어댑터: `src/main/platforms/ddangyo/adapter.ts`
- sync 성공 후 정리: `src/main/services/sync-success-reconciler.ts`
- 공용 가격 요약: `src/shared/platform-menu-price-summary.ts`
- 옵션 통합 뷰 서비스: `src/main/services/logical-option-group-service.ts`
- 옵션 화면: `src/renderer/src/pages/OptionPage.tsx`

## 8. 인수인계 메모

- 이번 브랜치에는 기능 코드 외에도 테스트, 문서, 브라우저 확장프로그램 코드가 같이 들어 있다.
- 워크트리에 커밋 대상이 아닌 임시 파일이 남아 있을 수 있다.
  - `-`
  - `.tmp/`
  - `.superpowers/`
- 커밋 전에는 위 임시 파일이 stage되지 않았는지 반드시 다시 확인한다.
