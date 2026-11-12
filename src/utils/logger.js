// JSON 한 줄 로거. stdout/stderr 에 쓴다.
// 절대 남기지 않는 것: 요청 본문, Authorization 헤더, 토큰, 인증 코드, 비밀번호.
// MySQL 오류 메시지의 따옴표 안 값(예: Duplicate entry 'a@b.com')은 가려서 남긴다.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50, silent: Infinity };

function currentThreshold() {
  const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info');
  return LEVELS[level] ?? LEVELS.info;
}

const maskQuoted = (text) => (typeof text === 'string' ? text.replace(/'[^']*'/g, "'?'") : text);

export function serializeError(err, depth = 0) {
  if (!err || typeof err !== 'object' || depth > 3) return err;
  const isSqlError = typeof err.sqlState === 'string';
  const out = {
    name: err.name,
    message: isSqlError ? maskQuoted(err.message) : err.message,
    code: err.code,
    stack: isSqlError ? maskQuoted(err.stack) : err.stack,
  };
  if (isSqlError) {
    out.errno = err.errno;
    out.sqlState = err.sqlState;
    // err.sql 은 실행한 SQL 문(값은 ? 자리표시자)이라 추적에 남기되, 혹시 모를 값은 가린다.
    if (err.sql) out.sql = maskQuoted(err.sql).slice(0, 500);
  }
  if (err.cause) out.cause = serializeError(err.cause, depth + 1);
  if (Array.isArray(err.errors)) out.errors = err.errors.map((inner) => serializeError(inner, depth + 1));
  return out;
}

function write(level, event, fields = {}) {
  if (LEVELS[level] < currentThreshold()) return;
  const { err, ...rest } = fields;
  const line = { time: new Date().toISOString(), level, event, ...rest, ...(err ? { err: serializeError(err) } : {}) };
  const stream = LEVELS[level] >= LEVELS.error ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(line)}\n`);
}

export const logger = {
  debug: (event, fields) => write('debug', event, fields),
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
  fatal: (event, fields) => write('fatal', event, fields),
};
