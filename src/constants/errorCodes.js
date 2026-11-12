// 내부 오류 코드 ↔ HTTP 상태 ↔ 클라이언트 메시지.
// message 는 그대로 응답에 나가므로 내부 정보를 넣지 않는다.

export const ERROR_CODES = Object.freeze({
  // ── 5xx: 이번 구현 범위 ──
  INTERNAL_SERVER_ERROR: { status: 500, message: '서버 내부 오류가 발생했습니다.' },
  DATABASE_UNAVAILABLE: { status: 503, message: '서비스를 일시적으로 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
  SERVICE_SHUTTING_DOWN: { status: 503, message: '서비스를 일시적으로 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
  // 502/504 는 이 서버가 외부 서버(카카오)에 요청을 대신 보내는 구간에서만 쓴다.
  KAKAO_BAD_GATEWAY: { status: 502, message: '카카오 로그인 서버와 통신 중 문제가 발생했습니다.' },
  KAKAO_TIMEOUT: { status: 504, message: '카카오 로그인 서버 응답이 지연되고 있습니다.' },

  // ── 4xx 최소안 (docs/03-api-spec.md 5장): 권한·규칙 위반을 막기 위해 필요한 것만 ──
  INVALID_REQUEST: { status: 400, message: '요청 값을 확인해 주세요.' },
  UNAUTHORIZED: { status: 401, message: '로그인이 필요합니다.' },
  KAKAO_AUTH_FAILED: { status: 401, message: '카카오 로그인에 실패했습니다. 다시 시도해 주세요.' },
  NOT_FOUND: { status: 404, message: '요청한 정보를 찾을 수 없습니다.' },
  FORBIDDEN_ACTION: { status: 409, message: '지금은 할 수 없는 요청입니다.' },
  DUPLICATE: { status: 409, message: '이미 사용 중인 값입니다.' },
});

// 501 은 쓰지 않는다: 라우터에 올려두고 구현하지 않은 기능을 두지 않는다.

export const RETRY_AFTER_SECONDS = 5;
