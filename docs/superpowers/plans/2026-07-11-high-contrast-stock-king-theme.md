# High Contrast Stock King Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 기능을 유지하며 메인과 게임 전반에 읽기 쉬운 고대비 주식 게임 테마를 적용한다.

**Architecture:** 마지막에 로드되는 독립 CSS 테마가 기존 디자인 토큰과 컴포넌트 표면을 재정의한다. 빌드 및 오프라인 캐시에 테마 파일을 명시적으로 포함한다.

**Tech Stack:** HTML, CSS, Node.js 내장 테스트 러너, 기존 정적 빌드 스크립트

## Global Constraints

- 새 라이브러리를 추가하지 않는다.
- 현재 DOM, 상태명, 게임 로직을 변경하지 않는다.
- 모바일 우선 레이아웃과 기존 반응형 구조를 유지한다.

---

### Task 1: 테마 계약 테스트

**Files:**
- Create: `tests/high-contrast-theme.test.js`
- Modify: `index.html`, `scripts/build.mjs`, `service-worker.js`

- [ ] 로드 순서, 배포 산출물, 오프라인 캐시, 핵심 스타일 선택자를 검사하는 실패 테스트를 작성한다.
- [ ] `node --test tests/high-contrast-theme.test.js`를 실행해 테마 파일 부재로 실패하는지 확인한다.

### Task 2: 고대비 테마 구현

**Files:**
- Create: `high-contrast-theme.css`

- [ ] 메인 화면용 밝은 카드와 네이비 소개 영역 스타일을 작성한다.
- [ ] 게임 패널, HUD, 입력, 버튼, 모달, 바텀 내비게이션의 대비를 높인다.
- [ ] 모바일 및 데스크톱 반응형 보정을 추가한다.
- [ ] 계약 테스트를 다시 실행해 통과시킨다.

### Task 3: 회귀 검증과 보고서

**Files:**
- Create: `WORK_COMPLETION_REPORT_2026-07-11_32.md`

- [ ] `npm test`로 전체 기능 회귀를 확인한다.
- [ ] `npm run build`로 배포 산출물을 확인한다.
- [ ] 브라우저로 메인·게임 화면을 확인하고 결과를 보고서에 기록한다.
- [ ] `git diff --check`로 공백 오류를 점검한다.
