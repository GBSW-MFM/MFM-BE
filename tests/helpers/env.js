// 테스트 공통 환경 변수. 앱 모듈을 import 하기 전에 불러야 한다 (각 테스트는 dynamic import 사용).
export function setTestEnv(overrides = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'mysql://nobody:nothing@127.0.0.1:1/none',
    DB_CONNECT_TIMEOUT_MS: '1000',
    JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
    KAKAO_REST_API_KEY: 'test-kakao-key',
    KAKAO_REDIRECT_URIS: 'http://localhost:5173/oauth/kakao',
    KAKAO_TIMEOUT_MS: '300',
    CORS_ORIGINS: 'http://localhost:5173',
    SMTP_HOST: '',
    DEV_LOGIN_ENABLED: 'false',
    ...overrides,
  });
}
