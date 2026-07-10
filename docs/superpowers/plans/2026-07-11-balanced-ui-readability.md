# Balanced UI Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 게임 화면의 글자 겹침, 강제 줄바꿈, 불균형한 카드 높이를 제거하고 핵심 정보가 우선순위대로 읽히는 균형형 UI를 제공한다.

**Architecture:** 기존 `ui-shell.js` 구조와 상태 ID를 유지하며, `mobile-first.css` 끝의 단일 가독성 계층에서 이전 CSS 충돌을 정리한다. 정적 계약 테스트와 실제 브라우저의 계산된 크기 측정을 함께 사용한다.

**Tech Stack:** Vanilla JavaScript, HTML, CSS, Node.js built-in test runner

## Global Constraints

- 새 라이브러리를 추가하지 않는다.
- 기존 게임 상태, 이벤트, 다국어 처리와 데이터 흐름을 변경하지 않는다.
- 모바일 320~480px를 기본으로 하고 900px 이상 데스크톱 구성을 유지한다.
- 본문 14~16px, 보조 설명 최소 12px, 핵심 수치 18~26px, 터치 대상 최소 44px를 사용한다.

---

### Task 1: Readability Contract

**Files:**
- Modify: `tests/mobile-slg-ui.test.js`

**Interfaces:**
- Consumes: `mobile-first.css`, `ui-shell.js`
- Produces: 균형형 타이포그래피와 레이아웃을 고정하는 회귀 테스트

- [ ] **Step 1: Write the failing tests**

  상태바가 3열, 목표 카드가 전체 폭, 섹터 카드가 자동 높이, 주요 텍스트가 최소 크기, 고정 메뉴 터치 영역이 44px 이상인지 CSS 계약으로 검사한다.

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test tests/mobile-slg-ui.test.js`

  Expected: 새 가독성 계약 중 하나 이상이 FAIL한다.

- [ ] **Step 3: Commit the failing contract**

  Run: `git add tests/mobile-slg-ui.test.js && git commit -m "test: define balanced mobile readability contract"`

### Task 2: Balanced Mobile Layout

**Files:**
- Modify: `mobile-first.css`
- Modify only if grouping cannot be expressed safely in CSS: `ui-shell.js`

**Interfaces:**
- Consumes: Task 1 CSS 계약
- Produces: `Balanced readability system` CSS 계층

- [ ] **Step 1: Add shared density variables**

  `--ui-body`, `--ui-label`, `--ui-title`, `--ui-metric`, `--ui-gap` 변수를 추가한다.

- [ ] **Step 2: Fix start screen hierarchy**

  타이틀, 언어 선택, 소개 카드, 입력 폼, 게임 모드의 크기와 간격을 균형형 기준으로 재정의한다.

- [ ] **Step 3: Fix HUD and home cards**

  생존 상태를 3열 2행으로 고정하고, `my-goal-panel`을 전체 폭으로 배치하며 자산/보유 종목 카드의 헤더와 빈 상태 높이를 정리한다.

- [ ] **Step 4: Fix market and sector cards**

  섹터 카드 고정 높이를 제거하고 회사명, 수치, 등급, 보유정보에 최소 글자 크기와 안정적인 줄바꿈 규칙을 적용한다.

- [ ] **Step 5: Fix trade hierarchy**

  종목 헤더, 보유정보, 탭, 주문 입력과 버튼을 겹치지 않는 1열 흐름으로 정리한다.

- [ ] **Step 6: Fix fixed controls**

  턴 행동 바와 하단 메뉴의 높이, 패딩, 라벨 크기와 콘텐츠 하단 여백을 통일한다.

- [ ] **Step 7: Run focused tests**

  Run: `node --test tests/mobile-slg-ui.test.js`

  Expected: PASS

- [ ] **Step 8: Commit implementation**

  Run: `git add mobile-first.css ui-shell.js && git commit -m "fix: balance mobile game readability"`

### Task 3: Full Verification and Completion Report

**Files:**
- Create: `WORK_COMPLETION_REPORT_2026-07-11_26.md`

**Interfaces:**
- Consumes: 완성된 균형형 UI
- Produces: 테스트·빌드·브라우저 검증 근거와 사용자용 작업완료 보고서

- [ ] **Step 1: Run all tests**

  Run: `npm.cmd test`

  Expected: 0 failures

- [ ] **Step 2: Run production build**

  Run: `npm.cmd run build`

  Expected: exit code 0 and `dist` generated

- [ ] **Step 3: Verify responsive browser layouts**

  360x800, 390x844, 480x900에서 시작/홈/시장/거래 화면을 확인한다. 가로 오버플로, 내부 세로 오버플로, 100px 미만의 본문 텍스트 블록, 콘솔 오류가 없어야 한다.

- [ ] **Step 4: Write completion report**

  수정 파일, 주요 변경, 테스트 결과, 브라우저 측정값, 미반영 사항을 `WORK_COMPLETION_REPORT_2026-07-11_26.md`에 기록한다.

- [ ] **Step 5: Commit report**

  Run: `git add WORK_COMPLETION_REPORT_2026-07-11_26.md && git commit -m "docs: report balanced UI readability update"`
