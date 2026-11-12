// 카카오 로그인 설정 점검 (앱 없이). 비밀 값은 출력하지 않는다.
//   npm run check:kakao
// 가짜 인가 코드로 토큰 발급을 요청해서, 카카오가 돌려주는 오류 종류로 설정 문제를 가른다.
//   KOE320 invalid_grant  → 키·시크릿·Redirect URI 는 통과 (가짜 코드라 실패하는 게 정상)
//   KOE010 invalid_client → Client Secret 이 틀렸거나, 켜져 있는데 안 보냄
//   KOE101 등 invalid_client → REST API 키가 틀림 (JavaScript 키·Admin 키 아님?)
//   KOE006                 → Redirect URI 가 콘솔에 등록된 값과 다름

const key = process.env.KAKAO_REST_API_KEY || '';
const secret = process.env.KAKAO_CLIENT_SECRET || '';
const redirectUri = (process.env.KAKAO_REDIRECT_URIS || '').split(',')[0]?.trim() || '';

function describe(name, value) {
  const problems = [];
  if (!value) problems.push('비어 있음');
  if (value !== value.trim()) problems.push('앞뒤에 공백이 있음');
  if (/^["'].*["']$/.test(value.trim())) problems.push('따옴표가 값에 포함됨');
  console.log(`  ${name}: ${value ? `${value.length}자` : '-'}${problems.length ? `  ⚠ ${problems.join(', ')}` : '  ✓'}`);
}

console.log('1) .env 에서 읽은 값 (값 자체는 출력하지 않음)');
describe('KAKAO_REST_API_KEY', key);
console.log(`  KAKAO_CLIENT_SECRET: ${secret ? `${secret.length}자 (요청에 함께 보냄)` : '비어 있음 (요청에 안 보냄)'}${secret && secret !== secret.trim() ? '  ⚠ 앞뒤 공백' : ''}`);
console.log(`  Redirect URI: ${redirectUri || '⚠ KAKAO_REDIRECT_URIS 비어 있음'}`);
if (key && key.length !== 32) console.log('  ⚠ REST API 키는 보통 32자예요. JavaScript 키나 Admin 키를 넣지 않았는지 확인하세요.');

console.log('\n2) 카카오에 가짜 인가 코드로 토큰 요청');
const params = new URLSearchParams({ grant_type: 'authorization_code', client_id: key.trim(), redirect_uri: redirectUri, code: 'diagnostic-dummy-code' });
if (secret) params.set('client_secret', secret.trim());
const started = Date.now();
try {
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: params,
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`  HTTP ${res.status} · ${Date.now() - started}ms · ${body.error || ''} ${body.error_code || ''} - ${body.error_description || ''}`);
  console.log('\n3) 판정');
  const code = body.error_code || '';
  if (code === 'KOE320' || body.error === 'invalid_grant') {
    console.log('  ✓ 키·시크릿·Redirect URI 는 통과했어요 (가짜 코드라 실패한 것).');
    console.log('    서버에서 여전히 KOE010 이면: 서버 재시작 안 함 / 서버가 다른 .env 를 읽음 / 앱의 redirect URI 가 다름을 확인하세요.');
  } else if (code === 'KOE010') {
    console.log(secret
      ? '  ✗ Client Secret 값이 콘솔과 달라요. 콘솔에서 다시 복사하거나, 재발급했다면 새 값으로 바꾸세요.'
      : '  ✗ 콘솔에서 Client Secret 이 "사용함"인데 .env 에 값이 없어요. 값을 넣거나 콘솔에서 "사용 안 함"으로 바꾸세요.');
  } else if (code === 'KOE006') {
    console.log('  ✗ Redirect URI 가 카카오 콘솔에 등록된 값과 달라요 (http/https, 포트, 끝의 / 까지 똑같아야 함).');
  } else if (body.error === 'invalid_client') {
    console.log('  ✗ REST API 키가 틀렸어요. 콘솔의 [앱 키 > REST API 키] 를 다시 복사하세요.');
  } else {
    console.log('  ? 예상하지 못한 응답이에요. 위 HTTP 줄을 그대로 공유해 주세요.');
  }
} catch (err) {
  console.log(`  ✗ 카카오에 닿지 않음: ${err.name} ${err.cause?.code || err.message} (${Date.now() - started}ms)`);
}
