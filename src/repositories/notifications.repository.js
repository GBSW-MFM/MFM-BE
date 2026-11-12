import { db } from '../config/db.js';

export async function insert(userId, type, letterId, ex = db) {
  await ex.run(
    'INSERT INTO notifications (user_id, type, letter_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
    [userId, type, letterId],
  );
}

/**
 * 공개 시각이 지난 편지의 "봉인 해제", "답장 마감" 알림을 만든다 (별도 스케줄러 없이 조회 때 생성).
 * UNIQUE(user_id, type, letter_id) 덕분에 여러 번 불려도 1번만 생긴다. 알림 시각은 공개 시각으로 둔다.
 */
export async function ensureOpenNotifications(userId, ex = db) {
  for (const type of ['letter_opened', 'reply_deadline']) {
    await ex.run(
      `INSERT INTO notifications (user_id, type, letter_id, created_at)
       SELECT l.recipient_id, ?, l.id, l.open_at FROM letters l
        WHERE l.recipient_id = ? AND l.recipient_deleted_at IS NULL AND l.open_at <= UTC_TIMESTAMP(3)
       ON DUPLICATE KEY UPDATE notifications.id = notifications.id`,
      [type, userId],
    );
  }
}

export async function list(userId, { limit, offset }, ex = db) {
  return ex.run(
    `SELECT n.id, n.type, n.letter_id, n.read_at, n.created_at, s.handle AS sender_handle, s.name AS sender_name
       FROM notifications n
       JOIN letters l ON l.id = n.letter_id
       JOIN users s ON s.id = l.sender_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${Number(limit) + 1} OFFSET ${Number(offset)}`,
    [userId],
  );
}

export async function countUnread(userId, ex = db) {
  const rows = await ex.run('SELECT CAST(COUNT(*) AS UNSIGNED) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]);
  return Number(rows[0].n);
}

/** 본인 알림만 읽음 처리. 남의 알림이면 0행 → 서비스가 404 로 응답 */
export async function markRead(id, userId, ex = db) {
  const rows = await ex.run('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);
  if (rows.length === 0) return false;
  await ex.run('UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE id = ? AND read_at IS NULL', [id]);
  return true;
}

export async function markAllRead(userId, ex = db) {
  const result = await ex.run('UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND read_at IS NULL', [userId]);
  return result.affectedRows;
}
