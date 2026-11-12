import { randomUUID } from 'node:crypto';

// 프록시나 프론트가 보낸 X-Request-Id 는 형식이 안전할 때만 이어받는다(로그 주입 방지).
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** 요청마다 추적용 ID를 붙인다. 오류 응답의 error.requestId 와 서버 로그가 이 값으로 이어진다. */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}
