import * as notificationsRepository from '../repositories/notifications.repository.js';
import { AppError } from '../utils/appError.js';
import { parseId, parsePaging } from '../utils/validate.js';

export async function list(me, query) {
  const { limit, offset } = parsePaging(query);
  await notificationsRepository.ensureOpenNotifications(me.id);
  const rows = await notificationsRepository.list(me.id, { limit, offset });
  const unreadCount = await notificationsRepository.countUnread(me.id);
  return {
    items: rows.slice(0, limit).map((n) => ({
      id: String(n.id),
      type: n.type,
      letterId: String(n.letter_id),
      sender: { handle: n.sender_handle, name: n.sender_name },
      read: Boolean(n.read_at),
      createdAt: n.created_at.toISOString(),
    })),
    unreadCount,
    hasMore: rows.length > limit,
  };
}

export async function markRead(me, rawId) {
  const id = parseId(rawId);
  const found = await notificationsRepository.markRead(id, me.id);
  if (!found) throw new AppError('NOT_FOUND', { message: '알림을 찾을 수 없어요.' });
  return { id, read: true };
}

export async function markAllRead(me) {
  return { updatedCount: await notificationsRepository.markAllRead(me.id) };
}
