// 프론트엔드가 다른 출처(포트·도메인)에서 API를 호출할 수 있게 허용한다.
// 허용 목록(CORS_ORIGINS)에 있는 출처만 허용한다. 필요한 기능이 적어 라이브러리 대신 직접 작성했다.

const ALLOWED_METHODS = 'GET,POST,PATCH,DELETE';
const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Request-Id';
const EXPOSED_HEADERS = 'X-Request-Id, Retry-After';

export function cors(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return function corsMiddleware(req, res, next) {
    const origin = req.get('origin');
    if (!origin) return next();
    res.vary('Origin');
    if (!allowed.has(origin)) return next();

    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Expose-Headers', EXPOSED_HEADERS);

    if (req.method === 'OPTIONS' && req.get('access-control-request-method')) {
      res.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.set('Access-Control-Max-Age', '600');
      return res.sendStatus(204);
    }
    return next();
  };
}
