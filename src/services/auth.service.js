// 카카오 로그인 → (기존 회원) 액세스 토큰 / (신규) 가입 토큰 → 회원가입
// 본인 확인은 카카오 로그인으로 끝낸다 (이메일 인증 없음, 002 마이그레이션 참고).
// 이메일은 카카오가 준 값만 쓴다: 서버가 서명한 가입 토큰 안에 넣어 두고 가입 때 꺼낸다 (프론트가 보낸 이메일은 쓰지 않음).
import { env } from '../config/env.js';
import * as kakao from '../clients/kakao.client.js';
import * as usersRepository from '../repositories/users.repository.js';
import { AppError } from '../utils/appError.js';
import { duplicateKeyName } from '../utils/dbErrors.js';
import { signAccessToken, signSignupToken } from '../utils/jwt.js';
import { invalid, normalizeHandle, requireEnum, requireIntInRange, requireString } from '../utils/validate.js';

export const publicUser = (u) => ({ id: String(u.id), handle: u.handle, name: u.name });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 카카오 이메일 정리: 형식이 이상하면 저장하지 않는다 */
function cleanEmail(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return v && v.length <= 254 && EMAIL_RE.test(v) ? v : null;
}

async function loginOrSignupToken(kakaoId, kakaoEmail) {
  const user = await usersRepository.findByKakaoId(kakaoId);
  if (user) return { status: 'LOGGED_IN', accessToken: await signAccessToken(user.id), user: publicUser(user) };
  const email = cleanEmail(kakaoEmail);
  return { status: 'SIGNUP_REQUIRED', signupToken: await signSignupToken(kakaoId, email), kakaoEmail: email };
}

export async function loginWithKakao(body) {
  const code = requireString(body?.code, '인가 코드', { max: 2000 });
  const redirectUri = requireString(body?.redirectUri, 'redirectUri', { max: 500 });
  if (!env.kakaoRedirectUris.includes(redirectUri)) throw invalid('허용되지 않은 redirectUri 예요.');

  const kakaoAccessToken = await kakao.exchangeCode(code, redirectUri);
  const { kakaoId, email } = await kakao.getUser(kakaoAccessToken);
  return loginOrSignupToken(kakaoId, email);
}

/** 개발 전용: 카카오 키 없이 흐름을 시험한다. DEV_LOGIN_ENABLED=true 이고 운영이 아닐 때만 라우터에 붙는다. */
export async function devLogin(body) {
  const kakaoId = requireString(String(body?.kakaoId ?? ''), 'kakaoId', { max: 20 });
  if (!/^\d+$/.test(kakaoId)) throw invalid('kakaoId 는 숫자예요.');
  return loginOrSignupToken(kakaoId, body?.email ?? null);
}

export async function checkHandle(rawHandle) {
  const handle = normalizeHandle(rawHandle);
  const taken = await usersRepository.findByHandle(handle);
  return { handle, available: !taken };
}

/** signup: 가입 토큰에서 꺼낸 { kakaoId, email } */
export async function signup(signup, body) {
  if (body?.agreements?.terms !== true || body?.agreements?.privacy !== true) {
    throw invalid('필수 약관에 모두 동의해 주세요.');
  }
  const input = {
    kakaoId: signup.kakaoId,
    handle: normalizeHandle(body?.handle),
    name: requireString(body?.name, '이름', { max: 30 }),
    age: requireIntInRange(body?.age, '나이', 1, 120),
    gender: requireEnum(body?.gender, '성별', ['female', 'male', 'undisclosed']),
    email: cleanEmail(signup.email),
    notificationAgreed: body?.agreements?.notification === true,
  };

  try {
    const userId = await usersRepository.insert(input);
    const user = await usersRepository.findById(userId);
    return { accessToken: await signAccessToken(userId), user: publicUser(user) };
  } catch (err) {
    const key = duplicateKeyName(err);
    if (key === 'users_handle_uq') throw new AppError('DUPLICATE', { message: '이미 사용 중인 아이디예요.', cause: err });
    if (key === 'users_kakao_id_uq') throw new AppError('DUPLICATE', { message: '이미 가입된 카카오 계정이에요.', cause: err });
    if (key === 'users_email_uq') throw new AppError('DUPLICATE', { message: '이 카카오 이메일로 이미 가입된 계정이 있어요.', cause: err });
    throw err;
  }
}
