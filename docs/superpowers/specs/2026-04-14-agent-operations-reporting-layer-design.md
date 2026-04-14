# 에이전트 운영 조회 레이어 설계

- 작성일: 2026-04-14
- 문서 목적: 현재 Electron 앱 위에 `에이전트가 직접 읽고 전략을 세우고 실행 지시를 내리기 쉬운 운영 조회 레이어`를 추가하기 위한 설계를 고정한다.
- 대상 독자: 이 프로젝트를 이어받아 구현하거나 검수하는 에이전트, 운영 자동화 기능을 확장할 개발자
- 적용 범위: 조회 전용 CLI/JSON 리포트, 내부 서비스 구조, 이후 실행 명령과의 연결 방식

## 1. 배경

현재 앱은 사람 운영자가 직접 보고 쓰기에는 많이 정리되었다.

- 계정 저장
- 플랫폼 메뉴/옵션 수집
- 메뉴 관리
- 옵션 관리
- 매핑 검토
- 반영 미리보기
- 실행 기록

하지만 에이전트가 실제로 이 도구를 `운영 도구`처럼 쓰려면 아직 한 단계가 부족하다.

지금도 CLI는 일부 있다.

- `sync-preview`
- `sync-run-item`
- `import-platform`
- `inspect-create-menu-flow`

그러나 이 명령들만으로는 아래 작업이 비효율적이다.

- 전체 메뉴 상태를 한 번에 파악
- 검토 대상만 추려 전략 수립
- 특정 플랫폼의 리스크만 분리 확인
- 최근 실패 패턴을 빠르게 요약
- 옵션/메뉴/가져오기/실행 기록을 한 흐름으로 엮어 해석

즉, 현재는 `실행 엔진`은 어느 정도 있는데, 그 앞단의 `에이전트 운영 조회 레이어`가 부족하다.

## 2. 제품 한줄 정의

현재 Electron 앱의 DB, 수집 결과, 미리보기 엔진을 그대로 사용하면서, 에이전트가 UI를 열지 않아도 운영 상태를 구조적으로 읽고 판단할 수 있게 하는 로컬 조회 레이어

## 3. 목표

### 3.1 이번 범위에서 달성할 것

1. 에이전트가 현재 상태를 CLI/JSON으로 안정적으로 읽을 수 있게 한다.
2. 메뉴/옵션/검토 대상/최근 실패/플랫폼 상태를 한 번에 요약하는 리포트를 제공한다.
3. 이후 `실행 지시`와 연결될 수 있도록 리포트 키와 식별자를 안정화한다.
4. 사람용 UI와 별도로, 에이전트가 DB 직접 조회 없이 같은 진실 원천을 읽게 만든다.

### 3.2 이번 범위에서 하지 않을 것

- 새로운 쓰기 자동화 자체 구현
- 별도 백엔드 서버 추가
- DB를 외부 API처럼 노출
- 사람용 UI 대규모 개편
- 자연어 에이전트 기능 자체 추가

이번 단계는 어디까지나 `읽기 전용 운영 레이어`다.

## 4. 고려한 접근

### 접근 A. CLI/JSON 리포트 우선

- 기존 `CliTaskRunner`를 확장해 조회용 task를 추가한다.
- 내부 서비스가 각 repository, planner, import run, sync run을 조합해 리포트를 만든다.
- 출력은 JSON 중심으로 설계하고, 사람이 빠르게 볼 수 있는 요약 문자열은 보조로 둔다.

장점:

- 가장 빠르게 실전 투입 가능
- 지금 DB와 엔진을 그대로 재사용
- 테스트가 쉽다
- 나중에 앱 패널이나 자연어 지시 계층도 같은 서비스를 재사용할 수 있다

단점:

- 사람 입장에서는 처음엔 화면 변화가 거의 없어 보일 수 있다

### 접근 B. 앱 안에 에이전트 패널 우선

- 별도 탭이나 운영 패널을 만든다.
- 사람이 보는 것과 에이전트가 보는 것을 최대한 통합한다.

장점:

- 사용자가 에이전트의 판단 근거를 같은 화면에서 볼 수 있다

단점:

- 초기에 UI 작업량이 커진다
- 기계적으로 재사용 가능한 인터페이스가 늦게 만들어진다

### 접근 C. DB 직결 스크립트 우선

- SQLite를 직접 조회하는 스크립트를 만든다.

장점:

- 가장 빠르게 출력물을 만들 수 있다

단점:

- repository/service를 우회해 규칙 중복이 생긴다
- 구조가 거칠고 유지보수성이 나빠진다
- UI와 에이전트가 서로 다른 해석을 할 위험이 생긴다

### 권장안

접근 A를 채택한다.

이 프로젝트는 이미 Electron 앱 내부에 도메인 규칙과 repository가 쌓여 있다.  
따라서 DB 직접 조회 대신, 현재 진실 원천을 조합하는 공용 조회 서비스를 만들고 그 위에 CLI를 얹는 편이 맞다.

## 5. 설계 원칙

### 5.1 사람용 화면과 에이전트용 레이어를 분리하되, 진실 원천은 하나로 유지한다

- 사람은 React 화면을 본다.
- 에이전트는 CLI/JSON 리포트를 본다.
- 두 쪽 모두 같은 repository, planner, run history를 읽는다.

즉, UI와 CLI는 달라도 해석 기준은 달라지면 안 된다.

### 5.2 리포트는 “실행 가능한 판단”을 위해 존재해야 한다

단순 조회만으로 끝나면 가치가 낮다.  
리포트는 이후 질문에 바로 답할 수 있어야 한다.

예:

- 어떤 플랫폼이 불안정한가
- 어떤 메뉴가 검토 필요 상태인가
- 어떤 항목은 바로 실행 가능하고 어떤 항목은 막혀 있는가
- 어떤 실패는 재시도 가능하고 어떤 실패는 수동 검토가 필요한가

### 5.3 식별자는 안정적이어야 한다

이후 에이전트가 메뉴를 지목해 실행하려면 리포트에 다음 식별자가 있어야 한다.

- `menuId`
- `platformCode`
- `platformMenuId`
- `mappingId` 또는 대응 가능한 연결 정보
- `logicalGroupKey` 또는 옵션 식별 키

사람용 UI에서는 숨길 수 있지만, 에이전트 리포트에는 포함되어야 한다.

### 5.4 JSON은 사람이 아니라 기계가 소비하는 형식으로 설계한다

- 짧고 안정적인 키
- 중첩 구조는 명확하게
- 화면 문구 대신 상태 코드와 요약 데이터를 우선
- 사람이 읽는 문장은 `summary` 필드 같은 보조 정보로 제공

## 6. 제공할 첫 리포트 범위

첫 단계에서는 아래 리포트를 제공한다.

### 6.1 전체 개요 리포트

목적:

- 지금 프로젝트 상태를 한 번에 파악

포함 항목:

- 기준 메뉴 수
- 관리 대상 메뉴 수
- 관리 제외 메뉴 수
- 플랫폼별 메뉴 수 / 옵션 그룹 수
- 검토 필요 항목 수
- 실행 가능한 항목 수
- 최근 가져오기 결과
- 최근 실행 실패 수
- managed browser 세션 상태

예상 task:

- `agent-report-overview`

### 6.2 검토 큐 리포트

목적:

- 실제로 사람이 판단하거나 에이전트가 전략을 세워야 하는 항목만 분리

포함 항목:

- `missing_mapping`
- `binding_review`
- `source_missing_review`
- `price_variant_review`
- `managed_session_write_review`

필터:

- 플랫폼별
- 메뉴별
- reason별

예상 task:

- `agent-report-review-queue`

### 6.3 특정 메뉴 상세 리포트

목적:

- 한 메뉴를 기준으로 현재 기준값, 플랫폼 상태, 옵션, 최근 실행 기록을 같이 본다.

포함 항목:

- 기준 메뉴
- 플랫폼별 연결 상태
- 가격 variants
- 원본 상태
- 옵션 요약
- 최근 가져오기 변경점
- 최근 실행 기록

예상 task:

- `agent-report-menu --menuId <id>`

### 6.4 옵션 현황 리포트

목적:

- 옵션 구조를 전략적으로 검토

포함 항목:

- 논리 옵션 그룹 목록
- `single`, `merge_candidate`, `shape_conflict`, `missing_suspected`, `absent_confirmed`, `resurfaced`
- 연결 메뉴 수
- 샘플 옵션명/가격

예상 task:

- `agent-report-options`

### 6.5 플랫폼 상태 리포트

목적:

- 플랫폼별로 import 상태, 세션 상태, 실패 경향, 원본 누락 상황을 빠르게 확인

포함 항목:

- 최근 import run
- 최근 import change 요약
- 최근 sync failure 요약
- managed browser 필요 여부
- 세션 연결 여부

예상 task:

- `agent-report-platform --platformCode baemin|coupangeats|ddangyo`

## 7. 내부 구조 설계

### 7.1 새 서비스 계층

추가 대상:

- `src/main/services/agent-operations-report-service.ts`

역할:

- 여러 repository와 planner 결과를 조합해 에이전트 리포트를 만든다.

이 서비스는 아래를 입력으로 사용한다.

- `MenuRepository`
- `MappingRepository`
- `PlatformMenuRepository`
- `PlatformOptionGroupRepository`
- `PlatformImportRunRepository`
- `PlatformImportChangeRepository`
- `SyncRunRepository`
- `SyncRunItemRepository`
- `buildSyncPreview`
- `buildLogicalOptionGroups`
- `ManagedChromeSessionProbe`

### 7.2 CLI task 확장

확장 대상:

- `src/main/services/cli-task-runner.ts`

추가 task:

- `agent-report-overview`
- `agent-report-review-queue`
- `agent-report-menu`
- `agent-report-options`
- `agent-report-platform`

규칙:

- 모든 task는 `exitCode + payload` 패턴 유지
- payload는 JSON serialization 가능한 순수 데이터만 포함
- 에러는 기존 task와 같은 방식으로 반환

### 7.3 앱 엔트리 연결

수정 대상:

- `src/main/index.ts`

역할:

- report service를 생성
- `CliTaskRunner`에 주입

## 8. 리포트 데이터 구조

### 8.1 전체 개요 리포트 초안

```ts
type AgentOverviewReport = {
  generatedAt: string
  menuCounts: {
    total: number
    managed: number
    unmanaged: number
    dirty: number
  }
  preview: {
    executableCount: number
    needsReviewCount: number
    byPlatform: Record<PlatformCode, { executable: number; needsReview: number }>
  }
  imports: Array<{
    platformCode: PlatformCode
    status: 'completed' | 'partial_failed' | 'running' | 'idle'
    fetchedCount?: number
    optionGroupCount?: number
    duplicateMenuCount?: number
    fetchMode?: 'managed_browser'
    errorMessage?: string | null
    finishedAt?: string | null
  }>
  syncFailures: {
    recentFailureCount: number
    latest?: {
      platformCode: PlatformCode
      errorCode?: string | null
      errorMessage?: string | null
      action?: string | null
      startedAt: string
    } | null
  }
  managedChrome?: {
    connected: boolean
    tabs: Array<{
      platformCode: PlatformCode | null
      pageKind: string
      url: string
    }>
  } | null
}
```

### 8.2 검토 큐 리포트 초안

```ts
type AgentReviewQueueReport = {
  generatedAt: string
  total: number
  items: Array<{
    menuId: string
    menuName: string
    menuBasePrice: number
    platformCode?: PlatformCode
    platformMenuId?: string
    reason: string
    detail?: string
    sourceStatus?: string | null
    bindingStatus?: string | null
    latestImportAt?: string | null
  }>
}
```

### 8.3 메뉴 상세 리포트 초안

```ts
type AgentMenuReport = {
  generatedAt: string
  menu: {
    menuId: string
    baseName: string
    basePrice: number
    basePriceVariants?: unknown[] | null
    isManaged: boolean
    isDirty: boolean
  }
  mappings: Array<{
    mappingId: string
    platformCode: PlatformCode
    platformMenuId: string
    platformMenuName: string
    mappingStatus?: string
    platformMenuStatus?: string | null
    platformMenuGroupName?: string | null
    platformMenuPriceSummary?: string | null
    platformMenuBindingStatus?: string | null
    lastVerifiedAt?: string | null
  }>
  preview: {
    executable: SyncPreviewItem[]
    needsReview: SyncPreviewNeedsReview[]
  }
  optionSummary: {
    logicalGroupCount: number
    groups: Array<{
      logicalGroupKey: string
      displayName: string
      status: string
      connectedMenuCount: number
    }>
  }
  recentRuns: Array<{
    syncRunId: string
    startedAt: string
    platformCode: PlatformCode
    status: string
    errorCode?: string | null
    errorMessage?: string | null
  }>
}
```

핵심은 “사람 친화 문구”보다 “다음 지시로 바로 이어질 수 있는 구조화 데이터”다.

## 9. 필터 설계

첫 단계부터 아래 필터를 허용한다.

- `--platformCode`
- `--menuId`
- `--platformMenuId`
- `--reason`
- `--limit`

추가 후보:

- `--managed-only`
- `--dirty-only`
- `--status`

하지만 첫 구현에서는 YAGNI 원칙상 위 5개만 먼저 둔다.

## 10. 사람이 읽는 요약과 기계가 읽는 데이터의 관계

각 리포트는 다음 둘을 같이 갖는다.

1. `summary`
   - 터미널에서 빠르게 읽는 용도
2. `data`
   - 에이전트가 다음 명령을 만들 때 쓰는 구조화 데이터

예를 들면:

```json
{
  "task": "agent-report-overview",
  "summary": "관리 대상 메뉴 46개, 실행 가능 7건, 검토 필요 12건",
  "data": { ... }
}
```

이 구조를 쓰면, 나중에 자연어 지시 레이어가 생겨도 `summary`와 `data`를 같이 소비할 수 있다.

## 11. 테스트 전략

### 11.1 단위 테스트

추가 대상:

- `tests/unit/main/agent-operations-report-service.test.ts`
- `tests/unit/main/cli-task-runner.test.ts`

검증 내용:

- overview 집계 정확성
- review queue reason 필터 정확성
- menu report가 preview, mapping, recent runs를 함께 엮는지
- options report 상태 집계
- platform report가 latest import, recent failures, session state를 포함하는지

### 11.2 회귀 테스트

기존 기능이 깨지면 안 된다.

- 기존 `sync-preview`
- 기존 `sync-run-item`
- 기존 `import-platform`
- 기존 `inspect-create-menu-flow`

즉, CLI 조회 레이어는 기존 실행 task를 대체하는 것이 아니라 보완해야 한다.

## 12. 이후 확장 경로

이 설계는 읽기 전용이지만, 이후 바로 아래 확장으로 이어진다.

### 12.1 에이전트 계획 레이어

리포트를 읽고 다음 작업 묶음을 제안한다.

예:

- `검토 필요 12건 중 source_missing_review 5건 먼저 정리`
- `배민 실행 가능 3건만 우선 반영`

### 12.2 에이전트 실행 레이어

리포트의 식별자를 받아 실제 작업을 실행한다.

예:

- `sync-run-item --menuId ...`
- 이후 `sync-run-batch --platformCode baemin --reason ...` 같은 확장 가능

### 12.3 앱 내부 운영 패널

사람이 같은 데이터를 보고 싶어지면, 나중에 `운영 리포트` 패널을 추가할 수 있다.  
이때도 같은 report service를 재사용한다.

## 13. 최종 정리

지금 이 프로젝트에 필요한 것은 또 하나의 UI가 아니라, 에이전트가 현재 상태를 정확히 읽을 수 있는 공용 조회 계층이다.

이번 설계의 핵심은 세 가지다.

1. 사람용 화면과 에이전트용 인터페이스를 분리하되, 진실 원천은 하나로 유지한다.
2. 조회 결과를 실행 지시로 바로 연결할 수 있게 식별자와 상태 코드를 안정화한다.
3. UI보다 먼저 CLI/JSON 리포트를 만들고, 이후 패널과 실행 계층은 그 위에 얹는다.

즉, 이 단계가 완성되면 나는 더 이상 DB를 임의로 뒤지지 않고도,

- 어떤 메뉴가 문제인지
- 어떤 플랫폼이 막혀 있는지
- 무엇을 먼저 손대야 하는지
- 무엇은 자동으로 실행 가능한지

를 앱이 제공하는 공식 인터페이스로 읽고 판단할 수 있게 된다.
