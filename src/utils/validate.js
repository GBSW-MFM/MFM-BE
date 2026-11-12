// 요청 값 확인 도우미. 규칙을 어기면 INVALID_REQUEST(400)를 사용자에게 도움이 되는 한 문장으로 던진다.
import { AppError } from './appError.js';

export const invalid = (message) => new AppError('INVALID_REQUEST', { message });

export function requireString(value, label, { min = 1, max, trim = true } = {}) {
  if (typeof value !== 'string') throw invalid(`${label}을(를) 입력해 주세요.`);
  const v = trim ? value.trim() : value;
  if ([...v].length < min || (max && [...v].length > max)) {
    throw invalid(max ? `${label}은(는) ${min}~${max}자로 입력해 주세요.` : `${label}을(를) 입력해 주세요.`);
  }
  return v;
}

export function requireEnum(value, label, allowed) {
  if (!allowed.includes(value)) throw invalid(`${label} 값이 올바르지 않아요.`);
  return value;
}

export function requireIntInRange(value, label, min, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label}은(는) ${min}~${max} 사이 숫자로 입력해 주세요.`);
  return n;
}

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export function normalizeHandle(value) {
  const v = typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : '';
  if (!HANDLE_RE.test(v)) throw invalid('아이디는 영문 소문자, 숫자, _ 로 3~20자예요.');
  return v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v.length > 254 || !EMAIL_RE.test(v)) throw invalid('이메일 형식을 확인해 주세요.');
  return v;
}

/** 경로의 :id 는 양의 정수 문자열만 받는다 (그 외는 존재하지 않는 것으로 취급) */
export function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) throw new AppError('NOT_FOUND');
  return value;
}

export function parsePaging(query) {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw invalid('limit 은 1~50 이에요.');
  if (!Number.isInteger(offset) || offset < 0) throw invalid('offset 은 0 이상이에요.');
  return { limit, offset };
}
