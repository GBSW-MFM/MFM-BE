// 전역 오류 처리 미들웨어 단위 테스트. DB 없이 실행된다.
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

process.env.NODE_ENV = 'test';
const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { requestId } = await import('../../src/middlewares/requestId.js');
const { errorHandler } = await import('../../src/middlewares/errorHandler.js');
const { AppError } = await import('../../src/utils/appError.js');
const { logger } = await import('../../src/utils/logger.js');

const SECRET_SQL = 'SELECT password_hash FROM users WHERE token = $1';
const SECRET_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.secret-token';

function buildApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.get('/sync-throw', () => {
    throw new Error(`${SECRET_SQL} failed for ${SECRET_TOKEN}`);
  });
  app.get('/async-reject', async () => {
    await Promise.reject(new Error('비동기 거부'));
  });
  app.get('/async-later', async () => {
    await sleep(10);
    throw new Error('지연 후 예외');
  });
  app.get('/query-error', async () => {
    throw Object.assign(new Error("Table 'jjam.lettters' doesn't exist"), { code: 'ER_NO_SUCH_TABLE', errno: 1146, sqlState: '42S02', sqlMessage: "Table 'jjam.lettters' doesn't exist", sql: "SELECT * FROM lettters WHERE email = 'a@b.com'" });
  });
  app.get('/statement-timeout', async () => {
    throw Object.assign(new Error('Query execution was interrupted, maximum statement execution time exceeded'), { code: 'ER_QUERY_TIMEOUT', errno: 3024, sqlState: 'HY000' });
  });
  app.get('/db-down', async () => {
    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
  });
  app.get('/kakao-timeout', async () => {
    throw new AppError('KAKAO_TIMEOUT', { cause: new Error('upstream raw body: access_token=abc') });
  });
  app.get('/headers-sent', async (req, res) => {
    res.status(200).write('partial');
    throw new Error('응답 도중 오류');
  });
  app.post('/json', (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

let logCalls;
beforeEach(() => {
  logCalls = [];
  mock.restoreAll();
  mock.method(logger, 'error', (event, fields) => logCalls.push({ event, fields }));
});

function assertErrorShape(res, status, code) {
  assert.equal(res.status, status);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.deepEqual(Object.keys(res.body).sort(), ['error', 'success']);
  assert.equal(res.body.success, false);
  assert.deepEqual(Object.keys(res.body.error).sort(), ['code', 'message', 'requestId']);
  assert.equal(res.body.error.code, code);
  assert.equal(res.body.error.requestId, res.headers['x-request-id']);
}

test('동기 예외 → 500, 응답에 SQL·토큰·스택 없음', async () => {
  const res = await request(buildApp()).get('/sync-throw');
  assertErrorShape(res, 500, 'INTERNAL_SERVER_ERROR');
  assert.equal(res.body.error.message, '서버 내부 오류가 발생했습니다.');
  const raw = res.text;
  for (const secret of ['password_hash', 'SELECT', SECRET_TOKEN, 'at ', 'stack', '.js:']) {
    assert.equal(raw.includes(secret), false, `응답에 "${secret}" 가 들어 있음`);
  }
});

test('상세 원인은 서버 로그에만 남는다 (요청 ID로 연결)', async () => {
  const res = await request(buildApp()).get('/sync-throw');
  assert.equal(logCalls.length, 1);
  const { event, fields } = logCalls[0];
  assert.equal(event, 'http.server_error');
  assert.equal(fields.requestId, res.body.error.requestId);
  assert.equal(fields.status, 500);
  assert.match(fields.err.message, /password_hash/);
  assert.ok(fields.err.stack);
});

test('async 핸들러의 거부된 Promise → 500 (Express 5 자동 전달)', async () => {
  const res = await request(buildApp()).get('/async-reject');
  assertErrorShape(res, 500, 'INTERNAL_SERVER_ERROR');
});

test('await 이후 던진 예외도 누락되지 않음 → 500', async () => {
  const res = await request(buildApp()).get('/async-later');
  assertErrorShape(res, 500, 'INTERNAL_SERVER_ERROR');
});

test('쿼리 오류(없는 테이블) → 503이 아니라 500', async () => {
  const res = await request(buildApp()).get('/query-error');
  assertErrorShape(res, 500, 'INTERNAL_SERVER_ERROR');
  assert.equal(res.text.includes('lettters'), false);
  assert.equal(res.headers['retry-after'], undefined);
});

test('쿼리 시간 초과(ER_QUERY_TIMEOUT) → 500', async () => {
  const res = await request(buildApp()).get('/statement-timeout');
  assertErrorShape(res, 500, 'INTERNAL_SERVER_ERROR');
});

test('DB 연결 거부 → 503 DATABASE_UNAVAILABLE + Retry-After', async () => {
  const res = await request(buildApp()).get('/db-down');
  assertErrorShape(res, 503, 'DATABASE_UNAVAILABLE');
  assert.equal(res.headers['retry-after'], '5');
  assert.equal(res.text.includes('5432'), false);
});

test('AppError 는 등록된 상태·메시지를 쓰고, cause 는 응답에 나가지 않음', async () => {
  const res = await request(buildApp()).get('/kakao-timeout');
  assertErrorShape(res, 504, 'KAKAO_TIMEOUT');
  assert.equal(res.text.includes('access_token'), false);
});

test('실제로 기록되는 로그 줄: SQL 오류의 따옴표 안 값은 가리고, 추적 필드는 남긴다', async () => {
  mock.restoreAll();
  const lines = [];
  mock.method(process.stderr, 'write', (chunk) => { lines.push(String(chunk)); return true; });
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'error';
  try {
    await request(buildApp()).get('/query-error');
  } finally {
    process.env.LOG_LEVEL = previous;
    mock.restoreAll();
  }
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.event, 'http.server_error');
  assert.equal(entry.err.code, 'ER_NO_SUCH_TABLE');
  assert.equal(entry.err.errno, 1146);
  assert.match(entry.err.sql, /FROM lettters/);
  assert.equal(lines[0].includes('a@b.com'), false, 'SQL 안의 값이 로그에 남으면 안 됨');
});

test('serializeError: 중복 키 오류의 값은 가리고 키 이름은 남긴다', async () => {
  const { serializeError } = await import('../../src/utils/logger.js');
  const out = serializeError(Object.assign(new Error("Duplicate entry 'a@b.com' for key 'users.users_email_uq'"), { code: 'ER_DUP_ENTRY', errno: 1062, sqlState: '23000' }));
  assert.equal(out.message.includes('a@b.com'), false);
  assert.match(out.message, /users_email_uq|'\?'/);
});

test('4xx AppError 는 지정한 문장으로 응답하고, 서버 오류 로그에는 남기지 않는다', async () => {
  const app = express();
  app.use(requestId);
  app.get('/bad', () => { throw new AppError('INVALID_REQUEST', { message: '제목은 1~50자로 입력해 주세요.' }); });
  app.use(errorHandler);
  const res = await request(app).get('/bad');
  assertErrorShape(res, 400, 'INVALID_REQUEST');
  assert.equal(res.body.error.message, '제목은 1~50자로 입력해 주세요.');
  assert.equal(logCalls.length, 0);
});

test('5xx AppError 는 지정 문장을 줘도 고정 문장으로만 응답한다', () => {
  const e = new AppError('INTERNAL_SERVER_ERROR', { message: 'SELECT secret' });
  assert.equal(e.message, '서버 내부 오류가 발생했습니다.');
});

test('응답 헤더를 보낸 뒤 오류 → 두 번째 응답을 쓰지 않고 로그만 남김', async () => {
  let outcome;
  try {
    const res = await request(buildApp()).get('/headers-sent');
    outcome = { status: res.status, text: res.text };
  } catch (err) {
    outcome = { error: err.code || err.message };
  }
  // Express 기본 처리기가 연결을 끊으므로 클라이언트는 부분 응답 또는 연결 종료를 받는다.
  if (outcome.text !== undefined) assert.equal(outcome.text.includes('success'), false);
  const events = logCalls.map((call) => call.event);
  assert.deepEqual(events, ['http.error_after_headers_sent']);
});

test('[프레임워크 기본 동작] 잘못된 JSON 본문 → Express 기본 400 (이번 범위에서 바꾸지 않음)', async () => {
  const res = await request(buildApp()).post('/json').set('Content-Type', 'application/json').send('{"broken":');
  assert.equal(res.status, 400);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.equal(logCalls.length, 0, '4xx 는 서버 오류 로그에 남기지 않음');
});

test('등록되지 않은 오류 코드로 AppError 생성 → 즉시 TypeError (개발 실수 방지)', () => {
  assert.throws(() => new AppError('NOT_A_CODE'), TypeError);
});
