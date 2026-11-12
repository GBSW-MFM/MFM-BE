# 미래의 나에게 짬처리 — 백엔드

Node.js 22 (JavaScript, ES Modules) · Express 5 · **MySQL 8 (mysql2)** · 카카오 로그인 REST API · JWT (jose)

## 요구 사항
- Node.js **22.9 이상** (`--env-file-if-exists` 사용)
- MySQL **8.0.16 이상** (CHECK 제약 사용, 8.0.46 에서 확인)

## 설치
```bash
cd backend
npm install
cp .env.example .env        # DATABASE_URL, JWT_SECRET, KAKAO_REST_API_KEY, KAKAO_REDIRECT_URIS 필수
```
설치되는 패키지: `express`, `mysql2`, `jose`, `nodemailer` (개발용 `supertest`)

## DB 준비
```sql
-- MySQL 에서 (비밀번호는 직접 정할 것)
CREATE DATABASE jjam CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'jjam_user'@'localhost' IDENTIFIED BY '비밀번호';
GRANT ALL ON jjam.* TO 'jjam_user'@'localhost';
```
```bash
npm run migrate             # migrations/*.sql 중 아직 안 된 것만 실행
```

## 카카오 로그인 설정
1. [Kakao Developers](https://developers.kakao.com) → 내 애플리케이션 → 앱 추가
2. **앱 키 > REST API 키** → `.env` 의 `KAKAO_REST_API_KEY`
3. **카카오 로그인 > 활성화 ON**, **Redirect URI** 등록 → `.env` 의 `KAKAO_REDIRECT_URIS` 와 똑같이
4. **동의항목**: 카카오계정(이메일)을 선택 동의로 켜면 가입 화면 이메일을 미리 채울 수 있음
5. (선택) **보안 > Client Secret** 사용 시 `KAKAO_CLIENT_SECRET`

흐름: 앱이 `https://kauth.kakao.com/oauth/authorize?client_id=…&redirect_uri=…&response_type=code` 로 이동 → 받은 `code` 를 `POST /api/auth/kakao` 로 전송 → 서버가 토큰 발급·사용자 조회 후 우리 JWT 발급.

## 실행
```bash
npm run dev                 # 변경 시 자동 재시작
npm start
curl http://localhost:4000/api/health
```
- SMTP 를 비워 두면 개발 환경에서는 인증 코드가 **서버 로그**(`mail.dev_outbox`)에 찍힌다.
- 카카오 키 없이 시험하려면 `.env` 에 `DEV_LOGIN_ENABLED=true` → `POST /api/auth/dev-login { "kakaoId": "1001" }` (운영에서는 켤 수 없음).
- DB 가 꺼져도 서버는 뜨고, DB 가 필요한 요청은 503. DB 가 돌아오면 재시작 없이 회복된다.

## 테스트
```bash
npm run test:unit                    # DB 없이 (35개)
cp .env.test.example .env.test       # 테스트 전용 DB 주소 (테이블을 지우고 다시 만듦!)
npm run test:integration             # 실제 MySQL (20개)
```
Postman: `postman/jjam.postman_collection.json` 가져오기 → 변수 `baseUrl` 확인 → 폴더 순서대로 실행 (토큰·편지 ID 자동 저장).

## 프론트엔드(React Native) 연결
- 기기에서 `localhost` 는 기기 자신이라 서버에 닿지 않는다. `baseUrl` 을 **PC 의 IP**(예: `http://192.168.0.10:4000/api`)로 쓰거나 터널을 사용한다.
- 토큰은 `expo-secure-store` 에 저장, 요청마다 `Authorization: Bearer <accessToken>`.
- 분기는 `error.code` 로. D-day·공개 여부는 서버 값(`dDay`, `status`)을 그대로 쓴다.
- 카카오 로그인은 `expo-auth-session`/`WebBrowser` 로 인가 코드를 받아 `/api/auth/kakao` 로 보낸다 (Redirect URI 를 카카오 콘솔과 `.env` 양쪽에 등록).

## 문서
| 문서 | 내용 |
|---|---|
| `docs/00-architecture.md` | 폴더 구조, 계층 연결, 확장 방법 |
| `docs/01-feature-spec.md` | 화면별 기능 명세, 가정 목록 |
| `docs/02-database.md` | MySQL ERD, 테이블, 시간대, 트랜잭션 |
| `docs/03-api-spec.md` | API 명세(구현 기준), 오류 코드 |
