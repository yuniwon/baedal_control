# Delivery Menu Sync 에이전트 인수인계

- 기준일: 2026-04-14
- 작업 브랜치: `main`
- 저장소: `https://github.com/yuniwon/baedal_control.git`
- 현재 목표: 로컬 Electron 앱 하나에서 배민 / 쿠팡이츠 / 땡겨요 메뉴와 옵션 구조를 읽고, 기준 메뉴를 한 번 수정해서 여러 플랫폼에 반영하는 통합 운영 도구 완성

## 1. 지금 바로 알아야 할 상태

- 앱은 실제 운영 DB와 자격 증명을 사용해 실행/검증 가능한 상태다.
- 최근 실운영 검증 기준
  - 배민: 메뉴 47개, 옵션 그룹 15개 import 완료
  - 쿠팡이츠: 로그인된 전용 크롬 세션 재사용 import 완료, 메뉴 35개 / 옵션 그룹 26개
  - 땡겨요: 메뉴 44개 import 완료
- 배민 단일 가격 숨김 메뉴 `숨김피자` 기준 이름/가격 왕복 실운영 검증 완료
  - `숨김피자 / 1,000원 -> 숨김피자 검증A / 1,100원 -> 숨김피자 / 1,000원`
  - 각 단계 뒤 재수집으로 실제 카탈로그와 DB 동기화 확인
  - 단, 2026-04-14 16:05 KST 최신 import에서는 같은 `platform_menu_id 1037277670`이 `판매중`으로 읽혔다.
  - 즉 `숨김피자`는 지금은 안전한 숨김 테스트 대상이 아니며, 고객 노출 가능 메뉴로 취급해야 한다.
- 옵션 관리 화면은 실제 옵션 항목명/가격/연결 메뉴를 기준으로 동작한다.
- 메뉴/매핑에는 `platformMenuPriceVariants`가 구조적으로 저장된다.
- 기준 메뉴도 `basePriceVariants`를 저장할 수 있고, 메뉴 관리에서 다중 가격 초안을 직접 편집할 수 있다.
- 원본 누락 상태는 `missing_suspected -> absent_confirmed -> resurfaced` 흐름으로 관리된다.

## 2. 이번 커밋 직전 검증 결과

- `npm test`
  - 62개 파일, 272개 테스트 통과
- `npm run lint:types`
  - 통과
- `npm run build`
  - 통과
- `npx electron out/main/index.js --task=agent-plan-next-actions --limit=5`
  - 통과
  - 실패 점검은 플랫폼별 1건으로 묶이고, 옵션 구조 검토는 같은 옵션명 기준으로 묶여 반복 제목이 줄어든 것 확인
- `npx electron out/main/index.js --task=agent-plan-next-actions --platformCode=baemin --limit=5`
  - 통과
  - 배민 범위에서는 `즉시 실행 1건 + 검토 3건`으로 정리되고 `도우 추가선택`, `피자 선택` 옵션 검토가 각각 1건씩 출력됨
- `npx electron out/main/index.js --task=inspect-create-menu-flow --platformCode=baemin`
  - 통과
  - 저장된 배민 계정으로 로그인 후 `메뉴 추가` 읽기 전용 점검이 `1/4 -> 2/4 -> 3/4 -> 4/4`까지 완료됨
  - 이번 보강으로 정리된 실제 원인
    - `메뉴 추가` 클릭 뒤 바로 1단계가 뜨는 게 아니라 `추가 메뉴 유형 선택` 드롭다운이 먼저 열림
    - 1단계 진행 버튼은 `적용하기`가 아니라 실제로는 `다음`이 먼저 보이는 경우가 있음
    - 2단계 직후에는 로딩 스피너가 잠깐 뜨며, 페이지 전체의 첫 번째 `select`를 잡으면 헤더 서비스 선택기를 잘못 집게 됨
  - 조치 후 현재 동작
    - 드롭다운에서 `일반메뉴` 자동 선택
    - 1단계에서 보이는 진행 버튼(`다음 -> 적용하기 -> 확인`) 중 활성 버튼 대기
    - 2단계 메뉴그룹 `select`는 페이지 전체가 아니라 모달 내부에서 탐색
  - 최종 저장은 하지 않으므로 운영 카탈로그 변경 없음
- `npx electron out/main/index.js --task=sync-preview --platformCode=baemin`
  - 통과
  - 실제 운영 DB 기준으로 `칠성사이다(59707776)`가 더 이상 `price_variant_review`가 아니라 실행 항목으로 내려오는 것 확인
  - `nextPriceVariants`는 배민 채널 기준(`delivery/pickup`)으로 투영되어 `1.25L 3,000원` 변경이 포함됨
- `npx electron out/main/index.js --task=sync-run-item --platformCode=baemin --menuId=0137b56c-d097-4690-804a-6612dfdc0515`
  - 통과
  - 숨김 테스트 메뉴 `숨김피자` 기준 이름/가격 변경과 원복이 모두 `성공 1건, 실패 0건`
- `npx electron out/main/index.js --task=import-platform --platformCode=baemin`
  - 통과
  - 최신 실행 결과 `메뉴 47개 / 옵션 그룹 15개 / verified 47`
  - `숨김피자`는 최신 import에서 `판매중`으로 재분류됨
- 이번 정리에서 수정한 핵심
  - 읽기 전용 에이전트 운영 리포트 레이어 추가
    - `agent-report-overview`
    - `agent-report-review-queue`
    - `agent-report-menu`
    - `agent-report-options`
    - `agent-report-platform`
  - 새 리포트는 기존 repository, `buildSyncPreview`, `buildLogicalOptionGroups`, managed Chrome 세션 상태를 조합해 JSON 리포트로 출력
  - 실제 운영 DB 기준 스모크 검증 완료
    - overview: 관리 대상 49개 / 실행 가능 1건 / 검토 필요 1건
    - review queue: 1건
    - menu: `칠성사이다` 상세 리포트
    - options: 배민 옵션 묶음 15개
    - platform: 배민 메뉴 47개
  - 읽기 전용 실행 제안 레이어 추가
    - `agent-plan-next-actions`
    - 리포트 레이어 위에서 `즉시 실행 가능한 동기화`, `사람 검토 필요`, `옵션 구조 검토`, `최근 실패 점검`을 우선순위와 추천 명령까지 함께 출력
    - 같은 제안 DTO를 앱 IPC/preload에도 연결해서 대시보드 `지금 할 일` 패널에서 동일한 우선순위 목록을 그대로 재사용
    - 최근 실패는 플랫폼별 1건으로 묶고, 옵션 구조 검토는 같은 옵션명 기준으로 묶어 반복 제목을 줄임
    - 실행 가능 항목은 실제 변경 필드만 요약하고, 다중 가격 변경은 `가격 구조 변경`으로 보여 줌
    - 실제 운영 DB 기준 스모크 검증 완료
      - 전체 범위: `즉시 실행 1건 + 검토/실패 점검 4건`
      - 배민 범위: `즉시 실행 1건 + 검토 3건`
      - 배민 옵션 검토는 `도우 추가선택`, `피자 선택`처럼 옵션명 단위로 묶여 출력
  - `platform_menus`에 한 번도 저장되지 않은 legacy active 매핑도 import 결측 추적 대상에 포함되도록 보강
  - 첫 import에서 `missing_suspected`, 두 번째 import에서 `absent_confirmed + source_absent`로 승격되도록 테스트 추가
  - 배민 쓰기 실패 시 어댑터가 현재 페이지 스냅샷(`platform_page_snapshot`)을 에러에 부착하고, sync 엔진이 이를 실행 기록의 `failure_context_json`으로 저장하도록 보강
    - 현재 화면 종류뿐 아니라 `operationStage`도 함께 남김
  - 실행 기록 UI가 배민 실패 당시 본문 텍스트 일부까지 보여주도록 보강
  - 공용 실패 분류기(`src/shared/sync-error-catalog.ts`)를 확장해
    - 배민 raw 오류 문자열을 구조화된 `errorCode`로 정리하고
    - 실행 기록 UI에서 `다음 조치 ...` 문구까지 바로 보여주도록 보강
  - 배민 생성 마법사 읽기 전용 CLI 점검 경로 추가
    - `inspect-create-menu-flow`
    - 메뉴 목록 단계에서는 `메뉴 추가` 같은 핵심 컨트롤을 먼저 노출
    - 현재는 `일반메뉴` 선택, 1단계 진행 버튼 대기, 2단계 모달 내부 select 탐색까지 포함해 4단계 읽기 전용 점검 완료
    - 초기에 막혔던 경우에는 raw timeout 대신 `baemin_create_wizard_not_opened:{page summary}`로 명확히 실패 기록하고 `createWizardEntryState.beforeClick/afterClick`까지 남긴다
  - 배민 다중 가격 1차 쓰기 경로 추가
    - 기준 메뉴의 공용 `basePriceVariants`를 플랫폼별 채널 구조로 투영한 뒤 비교
    - 배민 어댑터가 이제 secondary variant 가격 차이도 실제 가격 변경으로 인식
    - 배민 가격 변경 패널의 visible input을 읽어 `variant label -> 배달가 입력` 기준으로 multi-row 입력 계획을 세움
    - 픽업 금액이 배달 금액과 다르면 아직 안전하지 않다고 보고 차단
  - 배민 메뉴 상세 진입 보강
    - 하단 구간에서 DOM `data-index`가 API 순서보다 `+1` 밀리는 실운영 읽기 전용 재현 확인
    - raw index를 그대로 클릭하지 않고, 현재 렌더된 후보 행의 이름/가격/바인딩 문구를 다시 대조해 실제 DOM row를 고르도록 보강
  - 배민 숨김/품절 메뉴 검색 보강
    - 이전 코드가 `숨김`, `오늘만 품절` 액션 버튼을 잘못 누르고 있었던 문제를 수정
    - 이제 메뉴 상태가 `숨김`이면 검색 전 `판매상태 전체 -> 숨김`, `품절`이면 `판매상태 전체 -> 품절` 드롭다운 옵션을 먼저 맞춘다.
    - 이 보강으로 `숨김피자` 실운영 쓰기에서 발생하던 `baemin_menu_match_not_found` 해결
  - 배민 DOM 후보 모호 시 후퇴 경로 보강
    - API가 대상을 유일하게 특정했는데 렌더된 DOM 후보 재매칭이 `ambiguous`인 경우 raw API index 클릭으로 후퇴
    - 이 보강으로 `숨김피자` 실운영 쓰기에서 발생하던 `baemin_menu_match_ambiguous` 해결
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

### 에이전트 운영 리포트 실행

```powershell
npx electron out/main/index.js --task=agent-report-overview
npx electron out/main/index.js --task=agent-report-review-queue --limit=5
npx electron out/main/index.js --task=agent-report-menu --menuId=<menuId> --limit=5
npx electron out/main/index.js --task=agent-report-options --platformCode=baemin --limit=5
npx electron out/main/index.js --task=agent-report-platform --platformCode=baemin --limit=5
npx electron out/main/index.js --task=agent-plan-next-actions --limit=5
```

- 이 리포트들은 읽기 전용이다.
- 목적은 에이전트가 DB 직접 조회 없이 현재 상태를 공식 인터페이스로 읽는 것이다.
- `agent-plan-next-actions`는 읽기 전용 제안 레이어다.
  - `sync-run-item` 같은 실제 실행 명령을 바로 추천하지만, 제안 자체는 저장/수정을 하지 않는다.
- 최근 실검증 기준
  - `agent-report-overview`: 관리 대상 49개 / 실행 가능 1건 / 검토 필요 1건
  - `agent-report-review-queue`: 현재 검토 큐 1건
  - `agent-report-menu`: `칠성사이다` 상세 리포트 정상 출력
  - `agent-report-options --platformCode=baemin`: 배민 옵션 묶음 15개
  - `agent-report-platform --platformCode=baemin`: 배민 메뉴 47개, 최신 변경점과 최근 실패 정상 출력
  - `agent-plan-next-actions --limit=5`: 전체 범위 우선순위 제안 5건 정상 출력
    - 실패 점검은 플랫폼별 1건으로 묶이고 옵션 검토도 옵션명 기준으로 정리됨
  - `agent-plan-next-actions --platformCode=baemin --limit=5`: 배민 범위 우선순위 제안 4건 정상 출력
    - `도우 추가선택`, `피자 선택` 옵션 검토가 각각 1건씩만 노출됨
    - `칠성사이다` 실행 후보는 `가격 구조 변경`으로 읽히고 단일 가격이 그대로인 것처럼 보이지 않음

## 4. 플랫폼별 현재 구현 범위

### 배민

- 저장 계정으로 로그인 후 메뉴 페이지 진입 가능
- 메뉴 import 가능
- 옵션 탭 import 가능
- 메뉴명/가격 변경 로직과 상세 검증 가드가 있음
- 다중 가격 메뉴도 `variant 구조가 배민 채널(delivery/pickup) 기준으로 맞으면` preview 단계에서 실행 항목으로 내려온다.
- 어댑터도 `previousPriceVariants / nextPriceVariants` 차이를 가격 변경으로 인식하고, 배달 가격 입력칸을 variant 행별로 채울 준비가 되어 있다.
- 단일 가격 숨김 메뉴의 이름/가격 수정은 실운영 왕복 검증까지 완료했다.
- 다만 최신 import 기준으로 기존 테스트 메뉴 `숨김피자`가 `판매중`이라 현재는 안전한 숨김 검증 대상이 없다.
- 다만 다중 가격 실운영 저장 검증과 새 메뉴 생성/삭제 **실저장** 자동화는 아직 보류 상태다.
  - 현재 배민 `present + multi-price` 메뉴는 모두 판매중이라 바로 실저장하기 위험
  - 읽기 전용 생성 마법사 진입은 해결됐지만, 실제 저장 후 숨김 처리/삭제까지 검증할 안전 대상이 없음
- 금칙어가 설명/구성에 남아 있으면 저장 전에 차단
- legacy active 매핑이 `platform_menus`에 없더라도 import 2회로 `source_absent`까지 자동 정리됨
- 쓰기 실패 시 현재 배민 화면 제목 / 화면 종류 / 실패 단계 / 본문 텍스트 일부를 `failure_context_json`으로 남긴다.
- 생성 마법사 구조는 이제 fresh Playwright 기준으로도 4단계까지 자동 진입이 확인됐다.
- 즉, 배민 새 테스트 메뉴 **읽기 전용 생성 점검**은 완료됐고, 남은 건 실저장 경로와 안전한 정리 자동화다.

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
- 현재 배민에는 확정된 숨김 안전 대상이 없다. `숨김피자`는 최신 import에서 `판매중`이므로 손대지 않는다.
- 배민 테스트를 재개하려면
  - 새 숨김 테스트 메뉴를 확보하거나
  - 기존 테스트 메뉴를 다시 숨김으로 돌린 뒤 재수집해 상태를 확인해야 한다.
- 쿠팡이츠는 Playwright 로그인 우회 시도를 계속 붙이기보다, 현재는 전용 크롬 세션 재사용 경로를 기준으로 개선한다.
- 땡겨요 다중 가격 메뉴는 `variant 구조 일치`가 확인된 경우에만 실행한다.
- 로컬 DB나 자격 증명 파일 자체를 저장소에 커밋하면 안 된다.

## 6. 다음 우선순위

1. 배민 `최종 저장 -> 숨김 처리 -> 필요 시 삭제` 실저장 경로 확보
   - 과거 숨김 테스트 메뉴 기반 수정 왕복은 완료
   - 새 메뉴 생성 마법사 읽기 전용 4단계 진입도 확보
   - 남은 핵심은 안전한 테스트 대상을 다시 확보한 뒤, 실제 저장 요청과 생성 직후 숨김/삭제 정리 순서를 검증하는 것
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
5. 에이전트 제안 레이어 후속
   - 같은 플랫폼 실패를 묶어서 더 짧은 실행 계획으로 요약
   - 실패/검토/옵션 제안의 우선순위 규칙을 실데이터 기준으로 더 다듬기
   - 향후 UI 패널에서 같은 DTO를 그대로 재사용

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
