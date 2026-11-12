// MySQL 데이터 접근 계층 통합 테스트
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TEST_URL, skip, resetDatabase } from './helpers.js';

let db, migrate, resolveErrorCode, request, createApp;

before(async () => {
  if (skip) return;
  await resetDatabase();
  ({ migrate } = await import('../../scripts/migrate.js'));
  db = await import('../../src/config/db.js');
  ({ resolveErrorCode } = await import('../../src/middlewares/errorHandler.js'));
  request = (await import('supertest')).default;
  ({ createApp } = await import('../../src/app.js'));
});
after(async () => { if (db) await db.closePool(); });

test('마이그레이션: 처음엔 001_init 적용, 두 번째엔 아무것도 안 함', { skip }, async () => {
  assert.deepEqual(await migrate(TEST_URL, { log: () => {} }), ['001_init']);
  assert.deepEqual(await migrate(TEST_URL, { log: () => {} }), []);
});

test('DB 정상일 때 /api/health → 200', { skip }, async () => {
  const res = await request(createApp()).get('/api/health');
  assert.deepEqual(res.body, { success: true, data: { status: 'ok', db: 'up' } });
});

test('세션 시간대는 UTC (+00:00)', { skip }, async () => {
  const rows = await db.db.run('SELECT @@session.time_zone AS tz');
  assert.equal(rows[0].tz, '+00:00');
});

test('withTransaction: 중간 예외 → 앞의 INSERT 롤백', { skip }, async () => {
  await assert.rejects(db.withTransaction(async (tx) => {
    await tx.run(`INSERT INTO users (kakao_id, handle, name, age, gender, email, terms_agreed_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))`, [9001, 'rollback_me', '롤백', 20, 'female', 'rb@example.com']);
    throw new Error('의도한 실패');
  }), /의도한 실패/);
  const rows = await db.db.run('SELECT COUNT(*) AS n FROM users WHERE handle = ?', ['rollback_me']);
  assert.equal(Number(rows[0].n), 0);
});

test('withTransaction: 성공하면 커밋', { skip }, async () => {
  await db.withTransaction(async (tx) => {
    await tx.run(`INSERT INTO users (kakao_id, handle, name, age, gender, email, terms_agreed_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))`, [9002, 'commit_me', '커밋', 20, 'male', 'cm@example.com']);
  });
  const rows = await db.db.run('SELECT COUNT(*) AS n FROM users WHERE handle = ?', ['commit_me']);
  assert.equal(Number(rows[0].n), 1);
});

test('실제 쿼리 오류(없는 테이블, 문법 오류) → 500 으로 분류', { skip }, async () => {
  const e1 = await db.db.run('SELECT * FROM lettters').catch((e) => e);
  assert.equal(e1.code, 'ER_NO_SUCH_TABLE');
  assert.equal(resolveErrorCode(e1), 'INTERNAL_SERVER_ERROR');
  const e2 = await db.db.run('SELEC 1').catch((e) => e);
  assert.equal(e2.code, 'ER_PARSE_ERROR');
  assert.equal(resolveErrorCode(e2), 'INTERNAL_SERVER_ERROR');
});

test('파라미터 바인딩: 값에 SQL 이 들어 있어도 문자열로만 취급', { skip }, async () => {
  const rows = await db.db.run('SELECT COUNT(*) AS n FROM users WHERE handle = ?', ["x' OR '1'='1"]);
  assert.equal(Number(rows[0].n), 0);
});
