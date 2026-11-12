// DB 오류 분류: "연결 자체가 안 되는가(503)" 와 "그 외(500)".
// 쿼리 문법 오류, 없는 테이블, 잘못된 계정·DB 이름(설정 오류), 쿼리 시간 초과는
// 기다려도 해결되지 않으므로 503이 아니라 500이다.

const UNAVAILABLE_CODES = new Set([
  // Node 네트워크 오류 (DB 서버에 TCP 연결 실패)
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
  // mysql2 연결 끊김
  'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_SEQUENCE_TIMEOUT',
  // MySQL 서버가 지금 연결을 받을 수 없음
  'ER_CON_COUNT_ERROR', // 1040 연결 수 초과
  'ER_SERVER_SHUTDOWN', // 1053 서버 종료 중
  'ER_SERVER_OFFLINE_MODE',
]);

// MySQL 클라이언트 오류 번호: 서버 연결 불가 / 서버 사라짐 / 연결 끊김
const UNAVAILABLE_ERRNOS = new Set([1040, 1053, 2002, 2003, 2006, 2013]);

function matchesSingle(err) {
  if (!err || typeof err !== 'object') return false;
  if (typeof err.code === 'string' && UNAVAILABLE_CODES.has(err.code)) return true;
  if (typeof err.errno === 'number' && UNAVAILABLE_ERRNOS.has(err.errno)) return true;
  return false;
}

/** DB 연결 불가 오류인가. localhost 처럼 IPv4/IPv6 를 모두 시도하면 AggregateError 로 오므로 안쪽까지 본다. */
export function isDbUnavailableError(err, depth = 0) {
  if (!err || depth > 3) return false;
  if (matchesSingle(err)) return true;
  if (Array.isArray(err.errors) && err.errors.some((inner) => isDbUnavailableError(inner, depth + 1))) return true;
  return isDbUnavailableError(err.cause, depth + 1);
}

/** 중복 키 오류(1062)인가. 어느 UNIQUE 키인지도 돌려준다. */
export function duplicateKeyName(err) {
  if (err?.code !== 'ER_DUP_ENTRY') return null;
  const match = /for key '([^']+)'/.exec(err.sqlMessage || err.message || '');
  return match ? match[1].split('.').pop() : 'unknown';
}
