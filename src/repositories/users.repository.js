import { db } from '../config/db.js';

const COLUMNS = 'id, kakao_id, handle, name, age, gender, email, notification_agreed, created_at';

export async function findById(id, ex = db) {
  const rows = await ex.run(`SELECT ${COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] || null;
}

export async function findByKakaoId(kakaoId, ex = db) {
  const rows = await ex.run(`SELECT ${COLUMNS} FROM users WHERE kakao_id = ?`, [kakaoId]);
  return rows[0] || null;
}

export async function findByHandle(handle, ex = db) {
  const rows = await ex.run(`SELECT ${COLUMNS} FROM users WHERE handle = ?`, [handle]);
  return rows[0] || null;
}

export async function insert(user, ex = db) {
  const result = await ex.run(
    `INSERT INTO users (kakao_id, handle, name, age, gender, email, notification_agreed, terms_agreed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [user.kakaoId, user.handle, user.name, user.age, user.gender, user.email ?? null, user.notificationAgreed ? 1 : 0],
  );
  return String(result.insertId);
}
