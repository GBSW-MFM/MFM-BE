// 환경 변수를 한 곳에서 읽고 검증한다. 다른 파일은 process.env 대신 env 객체만 쓴다.

const VALID_NODE_ENVS = ['development', 'test', 'production'];
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'];

function readInt(name, fallback, { min = 0 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`환경 변수 ${name} 은(는) ${min} 이상의 정수여야 합니다.`);
  }
  return value;
}

function readEnum(name, allowed, fallback) {
  const value = process.env[name] || fallback;
  if (!allowed.includes(value)) throw new Error(`환경 변수 ${name} 은(는) ${allowed.join(', ')} 중 하나여야 합니다.`);
  return value;
}

function readRequired(name) {
  const value = process.env[name];
  if (!value) throw new Error(`필수 환경 변수 ${name} 이(가) 설정되지 않았습니다. .env.example 을 참고하세요.`);
  return value;
}

const readList = (name) => (process.env[name] || '').split(',').map((v) => v.trim()).filter(Boolean);

export function loadEnv() {
  const nodeEnv = readEnum('NODE_ENV', VALID_NODE_ENVS, 'development');
  const isProduction = nodeEnv === 'production';

  const jwtSecret = readRequired('JWT_SECRET');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET 은 32자 이상이어야 합니다.');

  const devLoginEnabled = process.env.DEV_LOGIN_ENABLED === 'true';
  if (isProduction && devLoginEnabled) throw new Error('DEV_LOGIN_ENABLED 는 운영 환경에서 켤 수 없습니다.');

  return Object.freeze({
    nodeEnv,
    isProduction,
    port: readInt('PORT', 4000, { min: 1 }),

    databaseUrl: readRequired('DATABASE_URL'),
    dbPoolMax: readInt('DB_POOL_MAX', 10, { min: 1 }),
    dbConnectTimeoutMs: readInt('DB_CONNECT_TIMEOUT_MS', 3000, { min: 1 }),
    dbStatementTimeoutMs: readInt('DB_STATEMENT_TIMEOUT_MS', 10000, { min: 1 }),

    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

    kakaoRestApiKey: readRequired('KAKAO_REST_API_KEY'),
    kakaoClientSecret: process.env.KAKAO_CLIENT_SECRET || '',
    kakaoRedirectUris: readList('KAKAO_REDIRECT_URIS'),
    kakaoTimeoutMs: readInt('KAKAO_TIMEOUT_MS', 5000, { min: 1 }),

    devLoginEnabled,
    corsOrigins: readList('CORS_ORIGINS'),
    shutdownTimeoutMs: readInt('SHUTDOWN_TIMEOUT_MS', 10000, { min: 1 }),
    logLevel: readEnum('LOG_LEVEL', VALID_LOG_LEVELS, nodeEnv === 'test' ? 'silent' : 'info'),
  });
}

export const env = loadEnv();
