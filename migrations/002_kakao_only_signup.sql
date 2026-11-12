-- 002_kakao_only_signup.sql
-- 회원가입에서 이메일 인증을 없앤다. 본인 확인은 카카오 로그인으로 충분하다고 팀이 결정.
--   * users.email: 카카오 동의항목(이메일)으로 받은 경우에만 저장, 없으면 NULL
--     (MySQL UNIQUE 는 NULL 을 여러 개 허용하므로 users_email_uq 는 그대로 둔다)
--   * email_verifications: 더 이상 쓰지 않아 삭제
ALTER TABLE users MODIFY email VARCHAR(254) NULL;
DROP TABLE IF EXISTS email_verifications;
