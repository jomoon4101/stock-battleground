# 주식 서바이벌 Render API 오류 수정 완료 보고서

작성일: 2026-07-02

## 1. 수정 결과

Render에서 `/api/rooms/active`가 `active`를 방 코드로 오인하지 않도록 서버 라우팅 순서와 예약 경로 방어를 명시적으로 고정했습니다. 이 프로젝트는 Express가 아니라 Node.js HTTP 서버를 사용하므로, Express 라우트 선언 순서 대신 `handleApi()`의 조건 처리 순서를 수정했습니다.

## 2. 수정 파일

- `server.mjs`
- `app.js`
- `config.js`
- `scripts/build.mjs`
- `index.html`
- `README.md`
- `tests/multiplayer.test.js`
- `tests/deployment.test.js`
- `tests/ui-contract.test.js`

## 3. 서버 라우트 순서

`handleApi()`는 다음 순서로 처리됩니다.

1. `/api/health`
2. `/api/hall-of-fame`
3. `/api/rooms/active`
4. `/api/board`
5. `/api/matchmaking`
6. `/api/rooms`
7. `active`, `matchmaking`, `status` 예약 방 코드 차단
8. `/api/rooms/:roomCode/join`
9. `/api/rooms/:roomCode/state`, `events`, `start`, `leave`, `action`

끝에 `/`가 붙은 `/api/rooms/active/`도 동일한 고정 API로 처리합니다.

## 4. `/api/rooms/active` 응답

진행 중인 방이 없어도 항상 다음과 같이 `200 OK`를 반환합니다.

```json
{"rooms":[]}
```

`/api/rooms/status/state`처럼 예약어를 방 코드로 사용한 잘못된 주소는 방 조회로 넘기지 않고 다음과 같이 `404`를 반환합니다.

```json
{"error":"존재하지 않는 API 경로입니다."}
```

## 5. 프론트 방 목록 처리

- `{"rooms":[]}`와 `[]` 응답을 모두 처리합니다.
- 종료·삭제·정원 초과 방은 화면에서 한 번 더 제외합니다.
- 최신 요청만 화면을 갱신해 5초 자동 새로고침의 응답 순서 충돌을 막았습니다.
- 조회 중 안내를 먼저 표시해 회색 빈 영역이 남지 않습니다.
- 빈 목록 문구: `현재 참여 가능한 서바이벌이 없습니다.`
- 실패 문구: `방 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.`
- GET 요청에는 불필요한 `Content-Type: application/json`을 붙이지 않아 CORS 사전 요청을 줄였습니다.

## 6. `/api/matchmaking` 처리

- `GET /api/matchmaking`: 서버 준비 상태와 지원 모드를 `200 OK`로 반환합니다.
- 실제 방 생성은 게임 시작 버튼의 `POST /api/matchmaking`에서만 실행됩니다.
- 닉네임이 없는 POST는 방을 만들지 않고 `422`로 종료합니다.
- 프론트는 닉네임을 먼저 검사하고 중복 클릭으로 매칭 요청이 겹치지 않게 방지합니다.
- 불완전한 서버 응답도 검증해 잘못된 상태로 화면이 전환되지 않게 했습니다.

## 7. CORS

서버가 기본으로 허용하는 운영 주소:

- `https://stock-survival.vercel.app`
- `https://stock-battleground.vercel.app`

Vercel Preview 주소가 필요하면 Render 환경변수에 다음 규칙을 추가할 수 있습니다.

```text
ALLOWED_ORIGINS=https://*.vercel.app
```

여러 Origin은 쉼표로 구분하며 기존 개별 주소 설정도 계속 지원합니다.

## 8. API 주소와 환경변수

현재 운영 Vercel의 `config.js`를 직접 확인한 결과 이미 다음 주소를 사용하고 있습니다.

```js
export const API_BASE_URL = "https://stock-battleground-server.onrender.com";
```

이번 수정에서는 Vercel 환경변수가 누락돼도 `.vercel.app`에서 같은 Render 주소를 기본값으로 사용하도록 추가 방어를 넣었습니다. `VITE_API_BASE_URL`이 설정되어 있으면 환경변수 값이 항상 우선합니다.

새로운 필수 환경변수는 없습니다.

- Vercel 권장: `VITE_API_BASE_URL=https://stock-battleground-server.onrender.com`
- Render 선택: Preview 허용 시 `ALLOWED_ORIGINS=https://*.vercel.app`

## 9. 검증 결과

- JavaScript 구문 검사 성공
- 자동 테스트 38개 전체 통과
- `npm run build` 성공
- `git diff --check` 오류 없음
- 로컬 테스트 서버 `/api/rooms/active`: 200 및 `{"rooms":[]}` 확인
- 로컬 테스트 서버 `/api/rooms/active/`: 200 확인
- 로컬 CORS 운영 주소·Preview 와일드카드 확인
- 운영 Render `/api/health`: 200 및 운영 Vercel CORS 헤더 확인
- 운영 Vercel `config.js`: Render API 주소 확인

## 10. 아직 운영에 반영되지 않은 사항

현재 운영 Render의 `/api/rooms/active`는 재배포 전 구버전이므로 여전히 다음 응답을 반환합니다.

```text
HTTP 400
{"error":"방을 찾을 수 없습니다."}
```

코드 수정은 완료됐지만 이 대화에서는 GitHub push나 Render/Vercel 외부 배포를 수행하지 않았습니다. 운영 반영에는 다음 작업이 필요합니다.

1. 변경 파일을 GitHub 저장소에 commit·push
2. Render `stock-battleground-server`에서 최신 commit 재배포
3. Vercel 프론트도 최신 commit 재배포
4. `/api/rooms/active`가 200과 빈 배열을 반환하는지 재확인
