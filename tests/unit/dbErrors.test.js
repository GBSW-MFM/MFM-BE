import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { isDbUnavailableError, duplicateKeyName } = await import('../../src/utils/dbErrors.js');

const err = (fields) => Object.assign(new Error(fields.message || 'x'), fields);

test('연결 불가 → true (503 대상)', () => {
  assert.equal(isDbUnavailableError(err({ code: 'ECONNREFUSED' })), true);
  assert.equal(isDbUnavailableError(err({ code: 'PROTOCOL_CONNECTION_LOST' })), true, '연결 끊김');
  assert.equal(isDbUnavailableError(err({ code: 'ER_CON_COUNT_ERROR', errno: 1040 })), true, '연결 수 초과');
  assert.equal(isDbUnavailableError(err({ code: 'ER_SERVER_SHUTDOWN', errno: 1053 })), true, '서버 종료 중');
  assert.equal(isDbUnavailableError(err({ errno: 2006 })), true, 'server has gone away');
  assert.equal(isDbUnavailableError(new AggregateError([err({ code: 'ECONNREFUSED' })])), true);
  assert.equal(isDbUnavailableError(new Error('wrap', { cause: err({ code: 'ETIMEDOUT' }) })), true);
});

test('쿼리·설정 오류 → false (500 대상)', () => {
  assert.equal(isDbUnavailableError(err({ code: 'ER_NO_SUCH_TABLE', errno: 1146 })), false, '없는 테이블');
  assert.equal(isDbUnavailableError(err({ code: 'ER_PARSE_ERROR', errno: 1064 })), false, '문법 오류');
  assert.equal(isDbUnavailableError(err({ code: 'ER_ACCESS_DENIED_ERROR', errno: 1045 })), false, '계정 설정 오류');
  assert.equal(isDbUnavailableError(err({ code: 'ER_QUERY_TIMEOUT', errno: 3024 })), false, '쿼리 시간 초과');
  assert.equal(isDbUnavailableError(err({ code: 'ER_DUP_ENTRY', errno: 1062 })), false);
  assert.equal(isDbUnavailableError(new TypeError('x')), false);
  assert.equal(isDbUnavailableError(null), false);
});

test('duplicateKeyName: 어떤 UNIQUE 키가 겹쳤는지 알려준다', () => {
  assert.equal(duplicateKeyName(err({ code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry 'me' for key 'users.users_handle_uq'" })), 'users_handle_uq');
  assert.equal(duplicateKeyName(err({ code: 'ER_PARSE_ERROR' })), null);
});
