// 전체 API 흐름 통합 테스트 (실제 MySQL + 가짜 카카오 응답)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TEST_URL, skip, resetDatabase, stubKakao, REDIRECT } from './helpers.js';

let app, request, db, devOutbox, restoreFetch;
const users = {};

before(async () => {
  if (skip) return;
  await resetDatabase();
  const { migrate } = await import('../../scripts/migrate.js');
  await migrate(TEST_URL, { log: () => {} });
  request = (await import('supertest')).default;
  app = (await import('../../src/app.js')).createApp();
  db = await import('../../src/config/db.js');
  ({ devOutbox } = await import('../../src/clients/mail.client.js'));
  restoreFetch = stubKakao();
});
after(async () => {
  if (restoreFetch) restoreFetch();
  if (db) await db.closePool();
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const tomorrowPlus = (days) => new Date(Date.now() + 9 * 3600e3 + (days + 1) * 86400e3).toISOString().slice(0, 10);

/** 카카오 로그인 → 이메일 인증 → 가입 */
async function signupUser(kakaoId, handle, name) {
  const login = await request(app).post('/api/auth/kakao').send({ code: `code-${kakaoId}`, redirectUri: REDIRECT });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.status, 'SIGNUP_REQUIRED');
  const st = login.body.data.signupToken;
  const email = `${handle}@example.com`;
  const sent = await request(app).post('/api/auth/email-verifications').set(auth(st)).send({ email });
  assert.equal(sent.status, 200);
  const code = devOutbox.filter((m) => m.to === email).at(-1).code;
  const ok = await request(app).post('/api/auth/email-verifications/confirm').set(auth(st)).send({ email, code });
  assert.equal(ok.body.data.verified, true);
  const res = await request(app).post('/api/auth/signup').set(auth(st)).send({
    handle, name, age: 25, gender: 'female', email, agreements: { terms: true, privacy: true, notification: true },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.data.accessToken, id: res.body.data.user.id, handle };
}

/** 시간 이동: 편지를 hoursAgo 시간 전에 공개된 것으로 만든다 (CHECK 제약을 지키려고 created_at 도 함께 당김) */
async function openLetter(letterId, hoursAgo = 1) {
  await db.db.run(
    `UPDATE letters SET created_at = UTC_TIMESTAMP(3) - INTERVAL ? HOUR, open_at = UTC_TIMESTAMP(3) - INTERVAL ? HOUR WHERE id = ?`,
    [hoursAgo + 48, hoursAgo, letterId],
  );
}

test('가입: 카카오 → 이메일 인증 → 가입, 다시 로그인하면 LOGGED_IN', { skip }, async () => {
  users.a = await signupUser(1001, 'jiwoo', '지우');
  users.b = await signupUser(1002, 'harin', '하린');
  users.c = await signupUser(1003, 'stranger_c', '씨');
  const again = await request(app).post('/api/auth/kakao').send({ code: 'code-1001', redirectUri: REDIRECT });
  assert.equal(again.body.data.status, 'LOGGED_IN');
  assert.equal(again.body.data.user.handle, 'jiwoo');
});

test('가입 규칙: 인증 없이 가입 409, 아이디 중복 409, 잘못된 코드는 시도 횟수 차감', { skip }, async () => {
  const login = await request(app).post('/api/auth/kakao').send({ code: 'code-1004', redirectUri: REDIRECT });
  const st = login.body.data.signupToken;
  const body = { handle: 'newbie', name: '새내기', age: 20, gender: 'male', email: 'newbie@example.com', agreements: { terms: true, privacy: true } };
  const noVerify = await request(app).post('/api/auth/signup').set(auth(st)).send(body);
  assert.equal(noVerify.status, 409);
  assert.equal(noVerify.body.error.code, 'FORBIDDEN_ACTION');

  await request(app).post('/api/auth/email-verifications').set(auth(st)).send({ email: 'newbie@example.com' });
  const wrong = await request(app).post('/api/auth/email-verifications/confirm').set(auth(st)).send({ email: 'newbie@example.com', code: '000000' === devOutbox.at(-1).code ? '111111' : '000000' });
  assert.equal(wrong.body.data.verified, false);
  assert.equal(wrong.body.data.remainingAttempts, 4);

  const code = devOutbox.at(-1).code;
  await request(app).post('/api/auth/email-verifications/confirm').set(auth(st)).send({ email: 'newbie@example.com', code });
  const dup = await request(app).post('/api/auth/signup').set(auth(st)).send({ ...body, handle: 'jiwoo' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'DUPLICATE');
  assert.equal(dup.body.error.message, '이미 사용 중인 아이디예요.');
});

test('잘못된 redirectUri → 400, 잘못된 인가 코드 → 401 KAKAO_AUTH_FAILED', { skip }, async () => {
  const badUri = await request(app).post('/api/auth/kakao').send({ code: 'code-1', redirectUri: 'https://evil.example/cb' });
  assert.equal(badUri.status, 400);
  const badCode = await request(app).post('/api/auth/kakao').send({ code: 'nope', redirectUri: REDIRECT });
  assert.equal(badCode.status, 401);
  assert.equal(badCode.body.error.code, 'KAKAO_AUTH_FAILED');
});

test('아이디 중복확인 · 내 정보 · 받는 사람 조회 (본인은 없음 처리)', { skip }, async () => {
  const taken = await request(app).get('/api/auth/handle-availability?handle=harin').set(auth(users.a.token));
  assert.equal(taken.body.data.available, false);
  const free = await request(app).get('/api/auth/handle-availability?handle=brand_new').set(auth(users.a.token));
  assert.equal(free.body.data.available, true);
  const me = await request(app).get('/api/users/me').set(auth(users.a.token));
  assert.equal(me.body.data.handle, 'jiwoo');
  const look = await request(app).get('/api/users/lookup?handle=@HARIN').set(auth(users.a.token));
  assert.deepEqual(look.body.data, { exists: true, user: { handle: 'harin', name: '하린' } });
  const self = await request(app).get('/api/users/lookup?handle=jiwoo').set(auth(users.a.token));
  assert.equal(self.body.data.exists, false);
});

test('편지 작성 검증: 오늘 이전 공개일·긴 제목·없는 아이디 → 400', { skip }, async () => {
  const base = { recipientType: 'friend', recipientHandle: 'harin', title: '제목', content: '내용', openDate: tomorrowPlus(0) };
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  for (const bad of [{ openDate: today }, { openDate: '2026-02-30' }, { title: 'ㄱ'.repeat(51) }, { recipientHandle: 'nobody_here' }, { recipientType: 'friend', recipientHandle: 'jiwoo' }]) {
    const res = await request(app).post('/api/letters').set(auth(users.a.token)).send({ ...base, ...bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(res.body.error.code, 'INVALID_REQUEST');
  }
});

test('공개 전: 받는 사람·보낸 사람 모두 제목과 내용을 볼 수 없다, 제3자는 404', { skip }, async () => {
  const created = await request(app).post('/api/letters').set(auth(users.a.token)).send({
    recipientType: 'friend', recipientHandle: 'harin', title: '비밀 제목', content: '비밀 내용', openDate: tomorrowPlus(30),
  });
  assert.equal(created.status, 201);
  users.letter1 = created.body.data.letter.id;
  assert.equal(created.body.data.letter.title, null);
  assert.equal(created.body.data.letter.dDay, 31);

  const list = await request(app).get('/api/letters/received?box=sealed').set(auth(users.b.token));
  assert.equal(list.body.data.counts.sealed, 1);
  const item = list.body.data.items[0];
  assert.equal(item.title, null);
  assert.equal(item.preview, null);
  assert.equal(JSON.stringify(list.body).includes('비밀'), false, '응답 어디에도 내용이 없어야 함');

  for (const who of [users.a, users.b]) {
    const detail = await request(app).get(`/api/letters/${users.letter1}`).set(auth(who.token));
    assert.equal(detail.body.data.letter.status, 'sealed');
    assert.equal(detail.body.data.letter.content, null);
  }
  const stranger = await request(app).get(`/api/letters/${users.letter1}`).set(auth(users.c.token));
  assert.equal(stranger.status, 404);
  const weirdId = await request(app).get('/api/letters/abc').set(auth(users.a.token));
  assert.equal(weirdId.status, 404);
});

test('공개 전 수정·삭제는 보낸 사람만, 받는 사람이 시도하면 404', { skip }, async () => {
  const byB = await request(app).patch(`/api/letters/${users.letter1}`).set(auth(users.b.token)).send({ title: '해킹' });
  assert.equal(byB.status, 404);
  const byA = await request(app).patch(`/api/letters/${users.letter1}`).set(auth(users.a.token)).send({ title: '새 제목', openDate: tomorrowPlus(0) });
  assert.equal(byA.status, 200);
  assert.equal(byA.body.data.letter.dDay, 1);
  const tmp = await request(app).post('/api/letters').set(auth(users.a.token)).send({ recipientType: 'self', title: '지울 편지', content: 'x', openDate: tomorrowPlus(5) });
  const del = await request(app).delete(`/api/letters/${tmp.body.data.letter.id}`).set(auth(users.a.token));
  assert.deepEqual(del.body.data, { deleted: true });
});

test('공개 후: 받는 사람은 내용 열람(첫 열람 기록), 보낸 사람은 수정·삭제 불가', { skip }, async () => {
  await openLetter(users.letter1, 1);
  const detail = await request(app).get(`/api/letters/${users.letter1}`).set(auth(users.b.token));
  const l = detail.body.data.letter;
  assert.equal(l.status, 'opened');
  assert.equal(l.title, '새 제목');
  assert.equal(l.content, '비밀 내용');
  assert.ok(l.firstReadAt);
  assert.equal(l.reply.available, true);
  const patch = await request(app).patch(`/api/letters/${users.letter1}`).set(auth(users.a.token)).send({ title: 'x' });
  assert.equal(patch.status, 409);
  const del = await request(app).delete(`/api/letters/${users.letter1}`).set(auth(users.a.token));
  assert.equal(del.status, 409);
});

test('답장: 공개 당일 1번만, 원래 보낸 사람에게 도착 + 알림', { skip }, async () => {
  const reply = { title: '답장이야', content: '고마워', openDate: tomorrowPlus(2) };
  const first = await request(app).post(`/api/letters/${users.letter1}/reply`).set(auth(users.b.token)).send(reply);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.letter.isReply, true);
  const second = await request(app).post(`/api/letters/${users.letter1}/reply`).set(auth(users.b.token)).send(reply);
  assert.equal(second.status, 409);
  const byA = await request(app).post(`/api/letters/${users.letter1}/reply`).set(auth(users.a.token)).send(reply);
  assert.equal(byA.status, 404, '보낸 사람은 자기 편지에 답장할 수 없음');

  const aInbox = await request(app).get('/api/letters/received?box=sealed&from=reply').set(auth(users.a.token));
  assert.equal(aInbox.body.data.items.length, 1);
  const aNotis = await request(app).get('/api/notifications').set(auth(users.a.token));
  assert.ok(aNotis.body.data.items.some((n) => n.type === 'reply_received'));
});

test('공개 다음 날 이후에는 답장 불가 → 409', { skip }, async () => {
  const old = await request(app).post('/api/letters').set(auth(users.a.token)).send({ recipientType: 'friend', recipientHandle: 'harin', title: '지난 편지', content: '...', openDate: tomorrowPlus(1) });
  await openLetter(old.body.data.letter.id, 30);
  users.letterOld = old.body.data.letter.id;
  const res = await request(app).post(`/api/letters/${users.letterOld}/reply`).set(auth(users.b.token)).send({ title: 't', content: 'c', openDate: tomorrowPlus(1) });
  assert.equal(res.status, 409);
});

test('알림: 도착 + (조회 때 생성되는) 봉인 해제·답장 마감, 읽음 · 모두 읽음, 남의 알림은 404', { skip }, async () => {
  const list = await request(app).get('/api/notifications').set(auth(users.b.token));
  const types = list.body.data.items.map((n) => n.type);
  assert.ok(types.includes('letter_arrived'));
  assert.ok(types.includes('letter_opened'));
  assert.ok(types.includes('reply_deadline'));
  const again = await request(app).get('/api/notifications').set(auth(users.b.token));
  assert.equal(again.body.data.items.length, list.body.data.items.length, '다시 조회해도 중복 생성 안 됨');

  const target = list.body.data.items[0].id;
  const byC = await request(app).patch(`/api/notifications/${target}/read`).set(auth(users.c.token));
  assert.equal(byC.status, 404);
  const one = await request(app).patch(`/api/notifications/${target}/read`).set(auth(users.b.token));
  assert.equal(one.body.data.read, true);
  const all = await request(app).patch('/api/notifications/read-all').set(auth(users.b.token));
  assert.equal(all.body.data.updatedCount, list.body.data.unreadCount - 1);
  const after2 = await request(app).get('/api/notifications').set(auth(users.b.token));
  assert.equal(after2.body.data.unreadCount, 0);
});

test('보관함: 보관·검색·정렬, 받은 편지 삭제 후 받는 사람은 404 · 보낸 사람은 계속 조회', { skip }, async () => {
  for (const id of [users.letter1, users.letterOld]) {
    const r = await request(app).patch(`/api/letters/${id}/archive`).set(auth(users.b.token)).send({ archived: true });
    assert.equal(r.status, 200);
  }
  const saved = await request(app).get('/api/letters/received?box=archived&sort=saved').set(auth(users.b.token));
  assert.equal(saved.body.data.items[0].id, users.letterOld, '최근 보관한 것이 위');
  const oldest = await request(app).get('/api/letters/received?box=archived&sort=oldest').set(auth(users.b.token));
  assert.equal(oldest.body.data.items[0].id, users.letterOld, '공개일이 오래된 것이 위');
  const search = await request(app).get(`/api/letters/received?box=archived&q=${encodeURIComponent('새 제목')}`).set(auth(users.b.token));
  assert.equal(search.body.data.items.length, 1);
  const sealedArchive = await request(app).get('/api/letters/received?box=sealed&sort=saved').set(auth(users.b.token));
  assert.equal(sealedArchive.status, 400, '정렬은 보관함에서만');

  const del = await request(app).delete(`/api/letters/${users.letter1}/received`).set(auth(users.b.token));
  assert.deepEqual(del.body.data, { deleted: true });
  const gone = await request(app).get(`/api/letters/${users.letter1}`).set(auth(users.b.token));
  assert.equal(gone.status, 404);
  const senderView = await request(app).get(`/api/letters/${users.letter1}`).set(auth(users.a.token));
  assert.equal(senderView.status, 200);
});

test('보낸 편지 목록: 내가 보낸 것만, 공개 전 내용은 숨김', { skip }, async () => {
  const sent = await request(app).get('/api/letters/sent').set(auth(users.a.token));
  assert.ok(sent.body.data.items.length >= 2);
  assert.ok(sent.body.data.items.every((l) => l.sender.handle === 'jiwoo'));
  const sealed = sent.body.data.items.filter((l) => l.status === 'sealed');
  assert.ok(sealed.every((l) => l.title === null));
});
