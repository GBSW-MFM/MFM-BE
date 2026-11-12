# 03. API 명세서 (구현 기준)

> Base URL `/api` · JSON · 이 문서는 현재 코드와 일치한다. Postman: `postman/jjam.postman_collection.json`

## 공통

성공 `{ "success": true, "data": { … } }`
실패 `{ "success": false, "error": { "code": "…", "message": "…", "requestId": "…" } }`

- 프론트는 `error.code` 로 분기한다. `requestId` 는 서버 로그 추적용(응답 헤더 `X-Request-Id` 와 같음).
- ID 는 문자열, 시각은 ISO 8601(UTC), 날짜는 `YYYY-MM-DD`(KST).
- 인증: `Authorization: Bearer <토큰>`. 액세스 토큰(로그인, 기본 7일) / 가입 토큰(카카오 인증 후 가입 전, 30분). 종류가 다르면 401.
- 목록: `?limit=20&offset=0` (limit 1~50), 응답에 `hasMore`.

## 엔드포인트

| 메서드 | URL | 인증 | 기능 |
|---|---|---|---|
| GET | `/health` | - | 서버·DB 상태 (DB 연결 불가면 503) |
| POST | `/auth/kakao` | - | 카카오 인가 코드 로그인 → `LOGGED_IN`(accessToken) 또는 `SIGNUP_REQUIRED`(signupToken, kakaoEmail) |
| POST | `/auth/dev-login` | - | **개발 전용** (`DEV_LOGIN_ENABLED=true`, 운영 불가). body `{ kakaoId }` |
| GET | `/auth/handle-availability?handle=` | 가입·액세스 | 아이디 중복확인 → `{ handle, available }` |
| POST | `/auth/email-verifications` | 가입 | 인증 코드 발송 `{ email }` → `{ expiresInSeconds, resent }` (60초 내 재요청은 새 코드 안 만듦) |
| POST | `/auth/email-verifications/confirm` | 가입 | `{ email, code }` → `{ verified, remainingAttempts? }` |
| POST | `/auth/signup` | 가입 | `{ handle, name, age, gender, email, agreements:{terms, privacy, notification} }` → 201 `{ accessToken, user }` |
| GET | `/users/me` | 액세스 | 내 정보 |
| GET | `/users/lookup?handle=` | 액세스 | 받는 사람 확인 → `{ exists, user:{handle,name} }` (본인은 exists:false) |
| POST | `/letters` | 액세스 | 편지 쓰기 `{ recipientType, recipientHandle?, title, content, openDate }` → 201 |
| GET | `/letters/received` | 액세스 | 받은 편지. `box=sealed|opened|archived`(필수), `from=self|friend|anyone|reply`, 보관함만 `q`, `sort=saved|newest|oldest|sender` → `{ items, counts, hasMore }` |
| GET | `/letters/sent` | 액세스 | 보낸 편지 (공개 전 수정·삭제할 편지 고르기) |
| GET | `/letters/:id` | 액세스 | 상세 (받는 사람·보낸 사람만, 그 외 404). 받는 사람이 공개 후 처음 보면 firstReadAt 기록 |
| PATCH | `/letters/:id` | 액세스 | 공개 전 수정 (보낸 사람) `{ title?, content?, openDate? }` |
| DELETE | `/letters/:id` | 액세스 | 공개 전 삭제 (보낸 사람) |
| POST | `/letters/:id/reply` | 액세스 | 답장 (받는 사람, 공개 당일 KST, 1번) `{ title, content, openDate }` → 201 |
| PATCH | `/letters/:id/archive` | 액세스 | 보관/해제 `{ archived: boolean }` (받는 사람, 공개 후) |
| DELETE | `/letters/:id/received` | 액세스 | 받은 편지 삭제 (받는 사람 쪽에서만 사라짐) |
| GET | `/notifications` | 액세스 | 알림 목록 → `{ items, unreadCount, hasMore }`. 공개 시각이 지난 편지의 "봉인 해제·답장 마감" 알림을 이때 생성 |
| PATCH | `/notifications/:id/read` | 액세스 | 읽음 (본인 것만, 아니면 404) |
| PATCH | `/notifications/read-all` | 액세스 | 모두 읽음 → `{ updatedCount }` |

### 편지 객체 (상세·작성 응답의 `letter`, 목록은 content 제외)

```json
{
  "id": "12", "role": "recipient", "status": "opened",
  "recipientType": "friend", "isReply": false, "replyToLetterId": null,
  "sender": { "handle": "jiwoo", "name": "지우" }, "recipient": { "handle": "harin", "name": "하린" },
  "title": "하린에게", "content": "생일 축하해!", "preview": "생일 축하해!",
  "openDate": "2026-11-18", "openAt": "2026-11-17T15:00:00.000Z", "dDay": 0,
  "createdAt": "…", "firstReadAt": "…", "archivedAt": null,
  "reply": { "available": true, "until": "2026-11-18T14:59:59.999Z", "repliedLetterId": null }
}
```
공개 전(`status: "sealed"`)이면 받는 사람·보낸 사람 모두 `title`, `content`, `preview` 가 `null` 이다.

### 입력 규칙
- `openDate`: 내일(KST)부터 10년 안, 실제 있는 날짜 · `title` 1~50자(앞뒤 공백 제거) · `content` 1~1000자
- `recipientType`: `self`면 recipientHandle 불필요, 그 외는 필수(본인 아이디 불가)
- 아이디: 영문 소문자·숫자·_ 3~20자 (앞의 @, 대문자는 정규화)

## 오류 코드

| HTTP | code | 언제 |
|---|---|---|
| 400 | INVALID_REQUEST | 입력 규칙 위반 (메시지에 고칠 점 한 문장) |
| 401 | UNAUTHORIZED | 토큰 없음·만료·위조·종류 불일치 |
| 401 | KAKAO_AUTH_FAILED | 잘못되거나 만료된 카카오 인가 코드 |
| 404 | NOT_FOUND | 없는 데이터, **남의 편지·알림** (존재 여부를 숨김) |
| 409 | FORBIDDEN_ACTION | 공개 후 수정·삭제, 답장 기간 지남·이미 답장, 공개 전 보관, 인증 없이 가입, 시도 초과 |
| 409 | DUPLICATE | 아이디·이메일·카카오 계정 중복 |
| 500 | INTERNAL_SERVER_ERROR | 예상 못 한 오류, SQL 오류, 쿼리 시간 초과, 서버 설정 오류(카카오 키·SMTP 계정·DB 계정) |
| 502 | KAKAO_BAD_GATEWAY / EMAIL_BAD_GATEWAY | 카카오·SMTP 가 5xx·해석 불가 응답·연결 실패 |
| 503 | DATABASE_UNAVAILABLE | DB 연결 불가 (연결 거부, 연결 끊김, 연결 수 초과, 서버 종료 중) + `Retry-After: 5` |
| 503 | SERVICE_SHUTTING_DOWN | 서버 종료 절차 중 들어온 요청 |
| 504 | KAKAO_TIMEOUT / EMAIL_TIMEOUT | 카카오·SMTP 응답 시간 초과 |

- 5xx 응답 메시지는 항상 고정 문장이다. SQL·스택·토큰은 응답에 나가지 않고, 로그에서는 SQL 오류의 따옴표 안 값을 가린다.
- 501 은 쓰지 않는다 (등록만 하고 구현하지 않은 기능이 없음).
- 4xx 는 "최소안"으로 위 6개만 둔다. 없는 URL·지원하지 않는 메서드는 Express 기본 404(HTML)를 그대로 둔다.
