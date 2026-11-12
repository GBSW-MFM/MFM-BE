import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * 의도적으로 던지는 오류. 상태 코드와 기본 메시지는 constants/errorCodes.js 에서 온다.
 * 4xx 는 사용자에게 도움이 되는 구체적인 문장(message)으로 바꿀 수 있다. 5xx 는 항상 고정 문장이다.
 * 원래 오류는 cause 에 담으면 로그에만 남는다.
 */
export class AppError extends Error {
  constructor(code, { cause, message } = {}) {
    const definition = ERROR_CODES[code];
    if (!definition) throw new TypeError(`등록되지 않은 오류 코드입니다: ${code}`);
    const useCustom = message && definition.status < 500;
    super(useCustom ? message : definition.message, { cause });
    this.name = 'AppError';
    this.code = code;
    this.status = definition.status;
  }
}
