// 통합 테스트 공통 준비: 테스트 DB 초기화 + 마이그레이션, 카카오 가짜 응답, 가입 도우미.
import mysql from 'mysql2/promise';
import { setTestEnv } from '../helpers/env.js';

export const TEST_URL = process.env.TEST_DATABASE_URL;
export const skip = TEST_URL ? false : 'TEST_DATABASE_URL 이 없어 건너뜀 (.env.test.example 참고)';
if (TEST_URL) setTestEnv({ DATABASE_URL: TEST_URL });

export async function resetDatabase() {
  const conn = await mysql.createConnection({ uri: TEST_URL, multipleStatements: true });
  const [tables] = await conn.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { t } of tables) await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
}

/** 카카오 서버 대신: 인가 코드 'code-<회원번호>' 를 받으면 그 회원번호로 응답 */
export function stubKakao() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://kauth.kakao.com/oauth/token')) {
      const code = new URLSearchParams(String(init.body)).get('code');
      if (!code?.startsWith('code-')) return Response.json({ error: 'invalid_grant', error_code: 'KOE320' }, { status: 400 });
      return Response.json({ access_token: `at-${code.slice(5)}` });
    }
    if (u.startsWith('https://kapi.kakao.com/v2/user/me')) {
      const id = String(init.headers.Authorization).replace('Bearer at-', '');
      return Response.json({ id: Number(id), kakao_account: { email: `k${id}@kakao.com`, is_email_valid: true, is_email_verified: true } });
    }
    return real(url, init);
  };
  return () => { globalThis.fetch = real; };
}

export const REDIRECT = 'http://localhost:5173/oauth/kakao';
