// 전역 오류 처리 미들웨어. app.js 의 맨 마지막에 등록한다.
//
// Express 5 는 async 핸들러에서 던진 예외와 거부된 Promise 를 자동으로 여기로 보낸다.
// 그래서 컨트롤러마다 try/catch 나 asyncHandler 래퍼를 둘 필요가 없다.
import { ERROR_CODES, RETRY_AFTER_SECONDS } from '../constants/errorCodes.js';
import { AppError } from '../utils/appError.js';
import { isDbUnavailableError } from '../utils/dbErrors.js';
import { logger } from '../utils/logger.js';

/** 오류를 내부 코드로 바꾼다. 모르는 오류는 전부 500 */
export function resolveErrorCode(err) {
  if (err instanceof AppError) return err.code;
  if (isDbUnavailableError(err)) return 'DATABASE_UNAVAILABLE';
  return 'INTERNAL_SERVER_ERROR';
}

/** Express/body-parser 가 만든 4xx 오류인가 (예: 잘못된 JSON → 400, 본문 초과 → 413) */
function isFrameworkClientError(err) {
  if (err instanceof AppError) return false;
  const status = err?.status ?? err?.statusCode;
  return Number.isInteger(status) && status >= 400 && status < 500;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // 이미 응답을 보내기 시작했다면 새 응답을 쓸 수 없다.
  // 기록만 남기고 Express 기본 처리기에 넘기면 연결을 끊어 준다(중복 응답 방지).
  if (res.headersSent) {
    logger.error('http.error_after_headers_sent', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      err,
    });
    return next(err);
  }

  // 4xx 처리는 이번 범위가 아니므로 프레임워크 기본 동작을 바꾸지 않는다.
  if (isFrameworkClientError(err)) {
    return next(err);
  }

  const code = resolveErrorCode(err);
  const { status } = ERROR_CODES[code];
  // 4xx AppError 는 사용자용 구체 문장을 쓸 수 있고, 5xx 는 항상 고정 문장이다.
  const message = err instanceof AppError && status < 500 ? err.message : ERROR_CODES[code].message;

  if (status < 500) {
    // 요청 쪽 문제는 서버 오류 로그에 섞지 않는다. 추적용으로 한 줄만 남긴다.
    logger.info('http.client_error', { requestId: req.id, method: req.method, path: req.path, userId: req.user?.id, status, code });
    return res.status(status).json({ success: false, error: { code, message, requestId: req.id } });
  }

  logger.error('http.server_error', {
    requestId: req.id,
    method: req.method,
    path: req.path, // 쿼리 문자열은 개인 정보가 있을 수 있어 남기지 않는다
    userId: req.user?.id,
    status,
    code,
    err,
  });

  if (status === 503) {
    res.set('Retry-After', String(RETRY_AFTER_SECONDS));
  }

  // 클라이언트에는 고정된 메시지만 보낸다. err.message, 스택, SQL 은 운영·개발 모두 응답에 넣지 않는다.
  return res.status(status).json({
    success: false,
    error: { code, message, requestId: req.id },
  });
}
