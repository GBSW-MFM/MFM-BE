// 카카오 클라이언트: 실제 카카오 대신 fetch 를 가로채서 각 응답 상황을 만든다.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setTestEnv } from '../helpers/env.js';

setTestEnv();
const kakao = await import('../../src/clients/kakao.client.js');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const expectCode = async (promise, code) => {
  await assert.rejects(promise, (err) => { assert.equal(err.code, code); return true; });
};

test('정상: 인가 코드 → 토큰 → 사용자 정보', async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/oauth/token')) {
      assert.equal(init.method, 'POST');
      assert.match(String(init.body), /grant_type=authorization_code/);
      assert.match(String(init.body), /client_id=test-kakao-key/);
      return json(200, { access_token: 'kakao-at', token_type: 'bearer' });
    }
    assert.equal(init.headers.Authorization, 'Bearer kakao-at');
    return json(200, { id: 4242, kakao_account: { email: 'me@kakao.com', is_email_valid: true, is_email_verified: true } });
  };
  const token = await kakao.exchangeCode('code', 'http://localhost:5173/oauth/kakao');
  const user = await kakao.getUser(token);
  assert.deepEqual(user, { kakaoId: '4242', email: 'me@kakao.com' });
});

test('카카오 5xx → 502 KAKAO_BAD_GATEWAY', async () => {
  globalThis.fetch = async () => json(503, { msg: 'down' });
  await expectCode(kakao.exchangeCode('c', 'u'), 'KAKAO_BAD_GATEWAY');
});

test('카카오가 JSON 이 아닌 응답 → 502', async () => {
  globalThis.fetch = async () => new Response('<html>error</html>', { status: 200 });
  await expectCode(kakao.exchangeCode('c', 'u'), 'KAKAO_BAD_GATEWAY');
});

test('네트워크 연결 실패 → 502', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await expectCode(kakao.exchangeCode('c', 'u'), 'KAKAO_BAD_GATEWAY');
});

test('시간 초과 → 504 KAKAO_TIMEOUT', async () => {
  // AbortSignal.timeout 의 타이머는 프로세스를 붙잡지 않아서, 서버가 없는 테스트에서는 이벤트 루프를 따로 살려 둔다.
  const keepAlive = setTimeout(() => {}, 5000);
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  try {
    await expectCode(kakao.exchangeCode('c', 'u'), 'KAKAO_TIMEOUT');
  } finally {
    clearTimeout(keepAlive);
  }
});

test('잘못되거나 만료된 인가 코드(invalid_grant) → 401 KAKAO_AUTH_FAILED', async () => {
  globalThis.fetch = async () => json(400, { error: 'invalid_grant', error_code: 'KOE320' });
  await expectCode(kakao.exchangeCode('c', 'u'), 'KAKAO_AUTH_FAILED');
});

test('우리 앱 키 설정 오류(invalid_client) → 500 (요청 문제가 아니라 서버 설정 문제)', async () => {
  globalThis.fetch = async () => json(401, { error: 'invalid_client', error_code: 'KOE010' });
  await expectCode(kakao.exchangeCode('c', 'u'), 'INTERNAL_SERVER_ERROR');
});

test('사용자 응답에 id 없음 → 502', async () => {
  globalThis.fetch = async () => json(200, { kakao_account: {} });
  await expectCode(kakao.getUser('t'), 'KAKAO_BAD_GATEWAY');
});
