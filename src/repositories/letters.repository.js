// 편지 데이터 접근. 공개 전 제목·본문은 SELECT 단계에서 NULL 로 만든다(서비스 코드 실수로 새어 나가지 않게).
import { db } from '../config/db.js';

const NOW = 'UTC_TIMESTAMP(3)';
const SELECT_LETTER = `
  SELECT l.id, l.sender_id, l.recipient_id, l.recipient_type, l.reply_to_letter_id,
         CASE WHEN l.open_at <= ${NOW} THEN l.title END AS title,
         CASE WHEN l.open_at <= ${NOW} THEN l.content END AS content,
         CASE WHEN l.open_at <= ${NOW} THEN LEFT(l.content, 60) END AS preview,
         l.open_at, l.created_at, l.first_read_at, l.archived_at, l.recipient_deleted_at,
         (l.open_at <= ${NOW}) AS is_open,
         DATEDIFF(DATE(l.open_at + INTERVAL 9 HOUR), DATE(${NOW} + INTERVAL 9 HOUR)) AS d_day,
         DATE_FORMAT(l.open_at + INTERVAL 9 HOUR, '%Y-%m-%d') AS open_date,
         (${NOW} >= l.open_at AND ${NOW} < l.open_at + INTERVAL 1 DAY) AS in_reply_window,
         (SELECT r.id FROM letters r WHERE r.reply_to_letter_id = l.id LIMIT 1) AS reply_id,
         s.handle AS sender_handle, s.name AS sender_name,
         rc.handle AS recipient_handle, rc.name AS recipient_name
    FROM letters l
    JOIN users s  ON s.id = l.sender_id
    JOIN users rc ON rc.id = l.recipient_id`;

export async function insert(letter, ex = db) {
  const result = await ex.run(
    `INSERT INTO letters (sender_id, recipient_id, recipient_type, title, content, open_at, reply_to_letter_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [letter.senderId, letter.recipientId, letter.recipientType, letter.title, letter.content, letter.openAt, letter.replyToLetterId ?? null],
  );
  return String(result.insertId);
}

export async function findById(id, ex = db) {
  const rows = await ex.run(`${SELECT_LETTER} WHERE l.id = ?`, [id]);
  return rows[0] || null;
}

/** 수정·삭제·답장 전에 행을 잠그고 현재 상태를 DB 시각 기준으로 확인한다 */
export async function lockForUpdate(id, ex) {
  const rows = await ex.run(
    `SELECT id, sender_id, recipient_id, recipient_type, recipient_deleted_at,
            (open_at > ${NOW}) AS is_sealed,
            (${NOW} >= open_at AND ${NOW} < open_at + INTERVAL 1 DAY) AS in_reply_window
       FROM letters WHERE id = ? FOR UPDATE`,
    [id],
  );
  return rows[0] || null;
}

export async function markFirstRead(id, ex = db) {
  await ex.run(`UPDATE letters SET first_read_at = ${NOW} WHERE id = ? AND first_read_at IS NULL AND open_at <= ${NOW}`, [id]);
}

export async function updateSealed(id, fields, ex) {
  const sets = [];
  const params = [];
  if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
  if (fields.content !== undefined) { sets.push('content = ?'); params.push(fields.content); }
  if (fields.openAt !== undefined) { sets.push('open_at = ?'); params.push(fields.openAt); }
  sets.push(`updated_at = ${NOW}`);
  await ex.run(`UPDATE letters SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

export async function remove(id, ex) {
  await ex.run('DELETE FROM letters WHERE id = ?', [id]);
}

export async function setArchived(id, archived, ex = db) {
  await ex.run(`UPDATE letters SET archived_at = ${archived ? NOW : 'NULL'} WHERE id = ?`, [id]);
}

export async function softDeleteForRecipient(id, ex = db) {
  await ex.run(`UPDATE letters SET recipient_deleted_at = ${NOW}, archived_at = NULL WHERE id = ?`, [id]);
}

const BOX_WHERE = {
  sealed: `l.open_at > ${NOW}`,
  opened: `l.open_at <= ${NOW} AND l.archived_at IS NULL`,
  archived: 'l.archived_at IS NOT NULL',
};
const FROM_WHERE = {
  self: "l.recipient_type = 'self'",
  friend: "l.recipient_type = 'friend' AND l.reply_to_letter_id IS NULL",
  anyone: "l.recipient_type = 'anyone' AND l.reply_to_letter_id IS NULL",
  reply: 'l.reply_to_letter_id IS NOT NULL',
};
const ORDER_BY = {
  sealed: 'l.open_at ASC, l.id ASC',
  opened: 'l.open_at DESC, l.id DESC',
  saved: 'l.archived_at DESC, l.id DESC',
  newest: 'l.open_at DESC, l.id DESC',
  oldest: 'l.open_at ASC, l.id ASC',
  sender: 's.name ASC, l.open_at DESC, l.id DESC',
};

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** 받은 편지 목록 (홈·수신함·보관함) */
export async function listReceived(userId, { box, from, q, sort, limit, offset }, ex = db) {
  const where = ['l.recipient_id = ?', 'l.recipient_deleted_at IS NULL', BOX_WHERE[box]];
  const params = [userId];
  if (from) where.push(FROM_WHERE[from]);
  if (q) {
    where.push('(l.title LIKE ? OR l.content LIKE ? OR s.name LIKE ?)');
    const like = `%${escapeLike(q)}%`;
    params.push(like, like, like);
  }
  const order = box === 'archived' ? ORDER_BY[sort || 'saved'] : ORDER_BY[box];
  // LIMIT/OFFSET 은 검증된 정수라 그대로 넣는다 (MySQL prepared statement 의 LIMIT ? 호환 문제 회피)
  return ex.run(`${SELECT_LETTER} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${Number(limit) + 1} OFFSET ${Number(offset)}`, params);
}

export async function countReceived(userId, from, ex = db) {
  const rows = await ex.run(
    `SELECT CAST(COALESCE(SUM(${BOX_WHERE.sealed}), 0) AS UNSIGNED) AS sealed,
            CAST(COALESCE(SUM(${BOX_WHERE.opened}), 0) AS UNSIGNED) AS opened,
            CAST(COALESCE(SUM(${BOX_WHERE.archived}), 0) AS UNSIGNED) AS archived
       FROM letters l WHERE l.recipient_id = ? AND l.recipient_deleted_at IS NULL${from ? ` AND ${FROM_WHERE[from]}` : ''}`,
    [userId],
  );
  const r = rows[0];
  return { sealed: Number(r.sealed), opened: Number(r.opened), archived: Number(r.archived) };
}

/** 보낸 편지 목록 (공개 전 수정·삭제할 편지를 고르는 용도) */
export async function listSent(userId, { limit, offset }, ex = db) {
  return ex.run(`${SELECT_LETTER} WHERE l.sender_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT ${Number(limit) + 1} OFFSET ${Number(offset)}`, [userId]);
}
