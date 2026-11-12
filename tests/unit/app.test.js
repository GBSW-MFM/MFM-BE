// 앱 조립 테스트. 실제 mysql2 드라이버로 "아무도 듣지 않는 포트"에 연결을 시도해 DB 다운 상황을 만든다.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTestEnv } from '../helpers/env.js';

setTestEnv();
const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const { closePool } = await import('../../src/config/db.js');

after(async () => { await closePool(); });

test('DB 연결 불가 상태의 /api/health → 503 DATABASE_UNAVAILABLE', async () => {
  const res = await request(createApp()).get('/api/health');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
  assert.equal(res.headers['retry-after'], '5');
  assert.equal(res.text.includes('127.0.0.1'), false, '접속 주소 노출 금지');
  assert.equal(res.text.includes('nobody'), false, 'DB 계정 노출 금지');
});

test('토큰 없이 보호된 API → 401 UNAUTHORIZED (DB 조회 전에 막힘)', async () => {
  const res = await request(createApp()).get('/api/letters/received?box=sealed');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('위조된 토큰 → 401', async () => {
  const res = await request(createApp()).get('/api/users/me').set('Authorization', 'Bearer abc.def.ghi');
  assert.equal(res.status, 401);
});

test('가입 토큰으로 로그인 전용 API 호출 → 401 (토큰 종류 구분)', async () => {
  const { signSignupToken } = await import('../../src/utils/jwt.js');
  const token = await signSignupToken('12345');
  const res = await request(createApp()).get('/api/users/me').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
});

test('종료 중 들어온 요청 → 503 SERVICE_SHUTTING_DOWN', async () => {
  const app = createApp();
  app.locals.isShuttingDown = true;
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'SERVICE_SHUTTING_DOWN');
});

test('[프레임워크 기본 동작] 없는 URL → Express 기본 404 (HTML)', async () => {
  const res = await request(createApp()).get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.match(res.text, /Cannot GET \/api\/does-not-exist/);
});

test('[프레임워크 기본 동작] 지원하지 않는 메서드 → Express 기본 404 (405 아님)', async () => {
  const res = await request(createApp()).put('/api/health');
  assert.equal(res.status, 404);
});

test('dev-login 은 DEV_LOGIN_ENABLED 가 꺼져 있으면 라우트 자체가 없다', async () => {
  const res = await request(createApp()).post('/api/auth/dev-login').send({ kakaoId: '1' });
  assert.equal(res.status, 404);
});

test('CORS: 허용 출처 사전 요청 204, 다른 출처는 허용 헤더 없음', async () => {
  const app = createApp();
  const ok = await request(app).options('/api/health').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
  assert.equal(ok.status, 204);
  const blocked = await request(app).get('/api/nope').set('Origin', 'https://evil.example');
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});
