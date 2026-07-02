# 주식 서바이벌 Render Docker 수정 완료 보고서

작성일: 2026-07-02

## 1. 장애 원인

기존 Dockerfile은 앱 파일을 하나씩 직접 지정해 복사했습니다.

```dockerfile
COPY index.html styles.css app.js engine.js i18n.js config.js server.mjs ./
```

이 목록에 `ai-chat.js`와 `mobile-first.css`가 없었기 때문에 Render 이미지의 `/app`에서 `server.mjs`가 `ai-chat.js`를 찾지 못하고 종료됐습니다.

## 2. Dockerfile 수정

Dockerfile을 다음 구조로 단순화했습니다.

```dockerfile
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=4173

EXPOSE 4173

CMD ["node", "server.mjs"]
```

새 파일이 추가될 때마다 Dockerfile 복사 목록을 별도로 수정할 필요가 없어 같은 누락이 재발하지 않습니다.

## 3. npm 설치 방식

`package-lock.json`은 lockfile v3이며 현재 `package.json`과 일치합니다. 실제로 다음 명령을 실행해 성공을 확인했습니다.

```text
npm ci --omit=dev
up to date, audited 1 package
found 0 vulnerabilities
```

따라서 재현 가능한 설치 방식인 `npm ci --omit=dev`를 유지했습니다. `npm install --omit=dev`로 낮출 필요가 없습니다.

## 4. .dockerignore 수정

Docker 실행에 필요한 파일은 제외하지 않습니다. 다음 항목만 이미지에서 제외합니다.

- `.git`
- 로컬 `node_modules`
- 빌드 산출물 `dist`
- 테스트·커버리지
- 로컬 `.env` 파일
- README와 작업완료 보고서
- npm 디버그 로그

`.env.example`은 예외 규칙으로 복사할 수 있게 유지했습니다.

## 5. `/app` 포함 보장 파일

`COPY . .`와 자동 계약 테스트를 통해 다음 파일·폴더의 존재를 확인합니다.

- `server.mjs`
- `ai-chat.js`
- `app.js`
- `engine.js`
- `config.js`
- `i18n.js`
- `index.html`
- `styles.css`
- `mobile-first.css`
- `assets/`
- `data/`

`tests/deployment.test.js`에 위 파일 존재, Dockerfile 전체 복사, `.dockerignore` 비제외 조건을 검증하는 테스트를 추가했습니다.

## 6. 실행 검증

검증 환경:

- Node.js `v24.14.1`
- npm `11.11.0`

Render와 동일한 `node server.mjs` 시작 흐름을 별도 포트에서 실행한 결과:

- 서버 기동 성공
- `GET /api/health`: 200
- `GET /api/rooms/active`: 200, `{"rooms":[]}`
- `GET /ai-chat.js`: 200, 7,104바이트 제공
- 자동 테스트: 39개 전체 통과
- `git diff --check`: 오류 없음

현재 작업 환경에는 Docker CLI가 설치되어 있지 않아 로컬 `docker build` 자체는 실행하지 못했습니다. Dockerfile 계약, npm 설치, Node 24 서버 기동과 필수 모듈 제공까지는 검증했습니다. 최종 이미지 빌드는 Render 재배포 로그에서 확인해야 합니다.

## 7. 수정 파일

- `Dockerfile`
- `.dockerignore`
- `tests/deployment.test.js`

## 8. Render 재배포 절차

1. 이번 변경에 `Dockerfile`, `.dockerignore`, `ai-chat.js`가 모두 포함됐는지 확인합니다.
2. 변경사항을 GitHub에 commit하고 push합니다.
3. Render Dashboard에서 `stock-battleground-server`를 선택합니다.
4. `Manual Deploy` → `Deploy latest commit`을 실행합니다.
5. 빌드 로그에서 다음 단계가 성공하는지 확인합니다.

```text
RUN npm ci --omit=dev
COPY . .
CMD ["node", "server.mjs"]
```

6. 시작 로그에 다음 문구가 표시되는지 확인합니다.

```text
주식 서바이벌 온라인 서버: http://127.0.0.1:4173
```

7. 배포 완료 후 다음 주소를 확인합니다.

```text
https://stock-battleground-server.onrender.com/api/health
https://stock-battleground-server.onrender.com/api/rooms/active
https://stock-battleground-server.onrender.com/ai-chat.js
```

정상 결과는 health 200, active rooms 200과 빈 배열, ai-chat.js 200입니다.
