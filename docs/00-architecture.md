# 00. 백엔드 구조

> 상태: 기능 API 구현 완료 (MySQL + mysql2, 카카오 로그인 + jose JWT). 친구·프로필·이미지 첨부는 남은 작업.

## 1. 폴더 트리

```
(저장소 루트)
├─ frontend/                     ← 기존 프론트엔드 (손대지 않음)
└─ backend/                      ← 이 프로젝트. 독립 실행
   ├─ package.json               ES Modules("type": "module"), 스크립트
   ├─ package-lock.json
   ├─ .env.example               환경 변수 이름·형식 예시 (비밀 값 없음)
   ├─ .env.test.example          통합 테스트용 DB 주소 예시
   ├─ .gitignore
   ├─ README.md                  설치·실행·테스트 방법
   ├─ docs/
   │  ├─ 00-architecture.md      이 문서
   │  ├─ 01-feature-spec.md      UI 기반 기능 명세
   │  ├─ 02-database.md          ERD, 테이블, 트랜잭션
   │  └─ 03-api-spec.md          REST API 명세, 오류 정책
   ├─ migrations/
   │  └─ 001_init.sql            초기 스키마
   ├─ scripts/
   │  └─ migrate.js              마이그레이션 실행기
   ├─ src/
   │  ├─ server.js               실행 진입점: listen, 종료 신호, 프로세스 오류
   │  ├─ app.js                  Express 앱 조립 (listen 안 함 → 테스트에서 재사용)
   │  ├─ config/
   │  │  ├─ env.js               환경 변수 읽기·검증 (유일하게 process.env 를 읽는 곳)
   │  │  └─ db.js                mysql2 연결 풀, db.run(), withTransaction(), ping()
   │  ├─ clients/
   │  │  ├─ kakao.client.js      카카오 토큰·사용자 조회, 502/504 변환
   │  │  └─ mail.client.js       인증 메일 (nodemailer), 502/504 변환
   │  ├─ constants/
   │  │  └─ errorCodes.js        내부 오류 코드 ↔ HTTP 상태 ↔ 클라이언트 메시지
   │  ├─ middlewares/
   │  │  ├─ requestId.js         요청 추적 ID
   │  │  ├─ shutdownGuard.js     종료 중 새 요청 → 503
   │  │  ├─ cors.js              프론트 출처 허용
   │  │  ├─ auth.js              JWT 확인 → req.user / req.signup
   │  │  └─ errorHandler.js      전역 오류 처리 (5xx + 4xx 최소안)
   │  ├─ routes/              index · health · auth · users · letters · notifications
   │  ├─ controllers/         health · auth · users · letters · notifications
   │  ├─ services/            health · auth · users · letters · notifications
   │  ├─ repositories/        health · users · emailVerifications · letters · notifications
   │  └─ utils/
   │     ├─ appError.js          의도적으로 던지는 오류 클래스
   │     ├─ dbErrors.js          MySQL 오류 분류 (503 / 500), 중복 키 이름
   │     ├─ jwt.js               jose 로 JWT 발급·검증
   │     ├─ time.js              KST 날짜 계산
   │     ├─ validate.js          입력 확인 도우미 (400)
   │     └─ logger.js            JSON 한 줄 로거 (SQL 값 가림)
   └─ tests/
      ├─ helpers/env.js          테스트 환경 변수
      ├─ unit/                   DB 없이 실행 (app, dbErrors, errorHandler, kakao.client)
      └─ integration/            실제 MySQL 필요 (없으면 건너뜀) — db, api(전체 흐름)
   postman/jjam.postman_collection.json   Postman 요청 모음
```

### 기능 구현 단계에서 추가될 파일 (지금은 만들지 않음)

```
src/routes/        auth.routes.js, users.routes.js, letters.routes.js, notifications.routes.js
src/controllers/   auth.controller.js, users.controller.js, letters.controller.js, notifications.controller.js
src/services/      auth.service.js, users.service.js, letters.service.js, notifications.service.js
src/repositories/  users.repository.js, emailVerifications.repository.js, letters.repository.js, notifications.repository.js
src/middlewares/   auth.js (JWT 확인, req.user 설정), upload.js (이미지 업로드)
src/clients/       kakao.client.js, mail.client.js   ← 외부 서버 호출, 502/504 변환 담당
src/utils/         date.js (KST 날짜 계산)
migrations/        002_*.sql …
```

## 2. 요청서의 폴더 목록 검토 결과

| 요청서 항목 | 결정 | 이유 |
|---|---|---|
| routes, controllers, services, repositories | 만듦 | 도메인 4개(인증·사용자·편지·알림), API 19개 규모에 계층 분리가 적당함 |
| middlewares, config, utils, constants | 만듦 | |
| tests, migrations, docs | 만듦 | |
| **validators** | **만들지 않음** | 요청 검증은 4xx 응답을 만드는 일인데 4xx는 이번 범위 밖이고, 처리 방식(03-api-spec.md 5장)도 아직 결정 전이다. 결정되면 `src/validators/<도메인>.validator.js` 로 추가한다 |
| (추가) scripts | 만듦 | 마이그레이션 실행기. 서버 코드(src)와 분리 |
| (추가 예정) clients | 기능 구현 때 | 카카오·SMTP 호출을 서비스에서 분리해야 외부 오류를 502/504로 바꾸는 규칙을 한 곳에 둘 수 있다 |
| (런타임) uploads | 폴더로 커밋하지 않음 | 업로드 파일 저장 위치. `.gitignore` 에 포함, 경로는 환경 변수 |

도메인별 폴더(`src/letters/` 안에 routes·service·repository를 모으는 방식)도 검토했지만, 도메인이 4개뿐이라 계층별 폴더가 파일을 찾기 더 쉽다. 도메인이 8개를 넘으면 그때 바꾸는 것을 권한다.

### 이름 규칙

- 도메인 계층 파일: `<도메인>.<계층>.js` (예: `letters.service.js`)
- 그 외 파일: camelCase (예: `errorHandler.js`, `appError.js`)
- 폴더: 소문자 복수형
- import 시 확장자 `.js` 를 항상 쓴다 (ES Modules 규칙)

## 3. 계층 연결 방식

```
요청
 → app.js: requestId → shutdownGuard → cors → express.json
 → routes/index.js → routes/<도메인>.routes.js      URL·메서드 → 컨트롤러 함수 연결
 → controllers/<도메인>.controller.js               req 읽기, 서비스 호출, { success, data } 로 응답
 → services/<도메인>.service.js                     규칙(공개일, 권한), 트랜잭션 범위 결정
 → repositories/<도메인>.repository.js              SQL (파라미터 바인딩)
 → config/db.js                                     pg 풀
오류가 나면 어느 계층에서든
 → middlewares/errorHandler.js                      내부 코드 결정 → 로그 → { success:false, error }
```

계층 규칙

- 컨트롤러는 SQL을 모른다. 리포지토리는 req/res 를 모른다.
- 트랜잭션이 필요하면 서비스가 `withTransaction(client => …)` 을 열고, 리포지토리 함수에 `client` 를 넘긴다. 리포지토리 함수는 `(client = { query }, …)` 처럼 client 를 선택 인자로 받아 트랜잭션 안팎에서 모두 쓰이게 한다.
- 오류는 잡지 않고 던진다. 잡아야 하는 경우는 "다른 의미의 오류로 바꿀 때"(예: 카카오 시간 초과 → `AppError('KAKAO_TIMEOUT', { cause })`)뿐이다.

## 4. 500번대 오류 처리 구조

| 역할 | 파일 |
|---|---|
| 내부 코드·상태·메시지 정의 | `constants/errorCodes.js` |
| 의도한 오류 던지기 | `utils/appError.js` |
| DB 연결 불가 판별 | `utils/dbErrors.js` |
| 전역 처리, 응답 형식, 중복 응답 방지 | `middlewares/errorHandler.js` |
| 로그 (민감 정보 제외) | `utils/logger.js` |
| 비동기 예외 | Express 5 가 자동 전달 (래퍼 불필요) |
| 풀 유휴 연결 오류, 처리 안 된 예외, 종료 신호 | `config/db.js`, `server.js` |

상태 코드별 사용 여부와 이유는 `03-api-spec.md` 4장에 있다. 요약하면 500(기본), 503(DB 연결 불가·종료 중), 502·504(카카오·SMTP 구간만, 구현 단계에서 사용), 501은 사용하지 않는다.

## 5. 이 구조가 맞는 이유

- **규모에 맞음**: 폴더는 많아 보이지만 각 폴더에 도메인당 파일 1개씩이다. 지금 파일 수는 소스 15개.
- **테스트하기 쉬움**: `app.js` 가 listen 하지 않아 supertest 로 바로 요청을 보낼 수 있고, 서비스는 HTTP를 몰라서 단독 테스트가 가능하다.
- **오류 처리 한 곳**: 상태 코드 결정이 errorHandler 한 곳에 있어서 "DB 오류를 무조건 503으로" 같은 실수가 각 컨트롤러에 퍼지지 않는다.
- **의존성 최소**: 런타임 패키지는 `express`, `pg` 두 개. 환경 변수는 Node 22 내장 `--env-file-if-exists`, 로그는 직접 작성, CORS는 30줄 미들웨어.

## 6. 확장 방법

**새 기능 API 추가** (예: 편지)
1. 필요하면 `migrations/00N_<설명>.sql` 추가 → `npm run migrate`
2. `repositories/letters.repository.js` 에 SQL 함수
3. `services/letters.service.js` 에 규칙·트랜잭션
4. `controllers/letters.controller.js` 에 요청·응답
5. `routes/letters.routes.js` 작성 후 `routes/index.js` 에 `router.use('/letters', lettersRoutes)` 한 줄
6. `tests/` 에 테스트

**새 서버 오류 코드 추가**: `constants/errorCodes.js` 에 항목 하나 → 던지는 곳에서 `new AppError('<코드>')`. errorHandler는 수정하지 않는다.

**외부 서비스 연동 추가**: `src/clients/<이름>.client.js` 에 호출과 타임아웃, 오류 변환(5xx·잘못된 응답 → 502 코드, 시간 초과 → 504 코드)을 두고 서비스는 클라이언트만 부른다.

**4xx 처리가 결정되면**: `errorCodes.js` 에 4xx 코드 추가, 필요 시 `src/validators/` 추가. errorHandler 는 AppError 를 이미 처리하므로 구조 변경 없음.

**규모가 커지면**: 도메인별 폴더로 재배치, 알림 생성을 큐(별도 워커)로 분리, 이미지를 외부 저장소로 이동 — 각각 해당 계층 파일만 바뀐다.
