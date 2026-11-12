// JOSE(jose 라이브러리)로 JWT 를 발급·검증한다. HS256, 발급자/대상 고정.
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { env } from '../config/env.js';
import { AppError } from './appError.js';

const secret = new TextEncoder().encode(env.jwtSecret);
const ISSUER = 'jjam-backend';
const AUDIENCE = 'jjam-app';

/** typ: 'access'(로그인) | 'signup'(카카오 인증 후 가입 전, 30분) */
export async function signToken(typ, subject, expiresIn, extraClaims = {}) {
  return new SignJWT({ ...extraClaims, typ })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(subject))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export const signAccessToken = (userId) => signToken('access', userId, env.jwtExpiresIn);
/** 가입 토큰: 카카오 회원번호 + 카카오가 준 이메일(없으면 null). 서버가 서명하므로 프론트가 바꿀 수 없다 */
export const signSignupToken = (kakaoId, email = null) => signToken('signup', kakaoId, '30m', { email });

/** 검증 실패(만료, 위조, 형식 오류)는 401 로, 그 외 예상 못 한 오류는 그대로 던진다(500). */
export async function verifyToken(token, allowedTypes) {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    if (!allowedTypes.includes(payload.typ) || typeof payload.sub !== 'string') throw new AppError('UNAUTHORIZED');
    return { typ: payload.typ, sub: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof joseErrors.JOSEError) throw new AppError('UNAUTHORIZED', { cause: err });
    throw err;
  }
}
