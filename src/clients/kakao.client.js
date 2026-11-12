// 카카오 로그인 REST API 호출. https://developers.kakao.com/docs/ko/kakaologin/rest-api
// 이 서버가 카카오에 요청을 대신 보내는 구간이라, 카카오 쪽 문제는 502/504 로 바꾼다.
//   카카오 5xx·해석 불가 응답·연결 실패 → 502 KAKAO_BAD_GATEWAY
//   시간 초과                              → 504 KAKAO_TIMEOUT
//   잘못되거나 만료된 인가 코드(4xx)        → 401 KAKAO_AUTH_FAILED (요청 문제)
//   우리 앱 키 설정 오류(invalid_client)    → 500 (서버 설정 문제)
import { env } from '../config/env.js';
import { AppError } from '../utils/appError.js';

const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const USER_URL = 'https://kapi.kakao.com/v2/user/me';

async function callKakao(url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(env.kakaoTimeoutMs) });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new AppError('KAKAO_TIMEOUT', { cause: err });
    throw new AppError('KAKAO_BAD_GATEWAY', { cause: err });
  }
  let body;
  try {
    body = await res.json();
  } catch (err) {
    throw new AppError('KAKAO_BAD_GATEWAY', { cause: new Error(`카카오 응답을 해석할 수 없음 (HTTP ${res.status})`, { cause: err }) });
  }
  return { status: res.status, body };
}

/** 인가 코드 → 카카오 액세스 토큰 */
export async function exchangeCode(code, redirectUri) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.kakaoRestApiKey,
    redirect_uri: redirectUri,
    code,
  });
  if (env.kakaoClientSecret) params.set('client_secret', env.kakaoClientSecret);

  const { status, body } = await callKakao(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: params,
  });
  if (status >= 500) throw new AppError('KAKAO_BAD_GATEWAY', { cause: new Error(`카카오 토큰 발급 HTTP ${status}`) });
  if (status >= 400) {
    // 카카오의 오류 설명까지 로그에 남긴다 (응답에는 나가지 않음). 예: invalid_client KOE010 - Bad client credentials
    const reason = new Error(`카카오 토큰 발급 실패: ${body?.error} ${body?.error_code || ''} - ${body?.error_description || '설명 없음'}`);
    if (body?.error === 'invalid_client') throw new AppError('INTERNAL_SERVER_ERROR', { cause: reason });
    throw new AppError('KAKAO_AUTH_FAILED', { cause: reason });
  }
  if (typeof body?.access_token !== 'string') {
    throw new AppError('KAKAO_BAD_GATEWAY', { cause: new Error('카카오 토큰 응답에 access_token 없음') });
  }
  return body.access_token;
}

/** 카카오 액세스 토큰 → 회원번호, 이메일(동의한 경우) */
export async function getUser(accessToken) {
  const { status, body } = await callKakao(USER_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
  });
  if (status >= 400) throw new AppError('KAKAO_BAD_GATEWAY', { cause: new Error(`카카오 사용자 조회 HTTP ${status}`) });
  if (body?.id === undefined || body?.id === null) {
    throw new AppError('KAKAO_BAD_GATEWAY', { cause: new Error('카카오 사용자 응답에 id 없음') });
  }
  const account = body.kakao_account || {};
  const email = account.email && account.is_email_valid !== false && account.is_email_verified !== false ? account.email : null;
  return { kakaoId: String(body.id), email };
}