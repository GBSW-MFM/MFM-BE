// 편지 규칙: 공개일(KST 0시), 공개 전 내용 비공개, 받는 사람·보낸 사람 권한, 공개 당일만 1번 답장.
import { withTransaction } from '../config/db.js';
import * as lettersRepository from '../repositories/letters.repository.js';
import * as notificationsRepository from '../repositories/notifications.repository.js';
import * as usersRepository from '../repositories/users.repository.js';
import { AppError } from '../utils/appError.js';
import { duplicateKeyName } from '../utils/dbErrors.js';
import { addYears, kstMidnightUtc, todayKst } from '../utils/time.js';
import { invalid, normalizeHandle, parseId, parsePaging, requireEnum, requireString } from '../utils/validate.js';

const notFound = () => new AppError('NOT_FOUND', { message: '편지를 찾을 수 없어요.' });
const forbidden = (message) => new AppError('FORBIDDEN_ACTION', { message });

function parseOpenDate(value) {
  const openAt = kstMidnightUtc(value);
  if (!openAt) throw invalid('공개일은 YYYY-MM-DD 형식이에요.');
  const today = todayKst();
  if (value <= today) throw invalid('공개일은 내일부터 고를 수 있어요.');
  if (value > addYears(today, 10)) throw invalid('공개일은 10년 안으로 골라 주세요.');
  return openAt;
}

const parseTitle = (v) => requireString(v, '제목', { max: 50 });
const parseContent = (v) => requireString(v, '편지 내용', { max: 1000, trim: false });

/** DB 행 → API 응답. 공개 전이면 title/content/preview 는 SQL 에서 이미 NULL 이다. */
function toLetter(row, viewerId) {
  const isOpen = Boolean(Number(row.is_open));
  const role = String(row.recipient_id) === String(viewerId) ? 'recipient' : 'sender';
  const replyAvailable = role === 'recipient' && isOpen && Boolean(Number(row.in_reply_window)) && !row.reply_id && !row.recipient_deleted_at;
  return {
    id: String(row.id),
    role,
    status: isOpen ? 'opened' : 'sealed',
    recipientType: row.recipient_type,
    isReply: Boolean(row.reply_to_letter_id),
    replyToLetterId: row.reply_to_letter_id ? String(row.reply_to_letter_id) : null,
    sender: { handle: row.sender_handle, name: row.sender_name },
    recipient: { handle: row.recipient_handle, name: row.recipient_name },
    title: row.title ?? null,
    content: row.content ?? null,
    preview: row.preview ?? null,
    openDate: row.open_date,
    openAt: row.open_at.toISOString(),
    dDay: Number(row.d_day),
    createdAt: row.created_at.toISOString(),
    firstReadAt: row.first_read_at ? row.first_read_at.toISOString() : null,
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    reply: {
      available: replyAvailable,
      until: replyAvailable ? new Date(row.open_at.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString() : null,
      repliedLetterId: row.reply_id ? String(row.reply_id) : null,
    },
  };
}

/** 목록용 (본문 전체는 빼고 미리보기만) */
function toListItem(row, viewerId) {
  const { content, ...rest } = toLetter(row, viewerId);
  return rest;
}

export async function createLetter(me, body) {
  const recipientType = requireEnum(body?.recipientType, '받는 사람 유형', ['self', 'friend', 'anyone']);
  const title = parseTitle(body?.title);
  const content = parseContent(body?.content);
  const openAt = parseOpenDate(body?.openDate);

  let recipientId = me.id;
  if (recipientType !== 'self') {
    const handle = normalizeHandle(body?.recipientHandle);
    const recipient = await usersRepository.findByHandle(handle);
    if (!recipient) throw invalid('받는 사람 아이디를 찾을 수 없어요.');
    if (String(recipient.id) === String(me.id)) throw invalid('나에게 보낼 때는 받는 사람을 "나"로 골라 주세요.');
    recipientId = String(recipient.id);
  }

  const letterId = await withTransaction(async (tx) => {
    const id = await lettersRepository.insert({ senderId: me.id, recipientId, recipientType, title, content, openAt }, tx);
    if (String(recipientId) !== String(me.id)) await notificationsRepository.insert(recipientId, 'letter_arrived', id, tx);
    return id;
  });
  return toLetter(await lettersRepository.findById(letterId), me.id);
}

const BOXES = ['sealed', 'opened', 'archived'];
const FROMS = ['self', 'friend', 'anyone', 'reply'];
const SORTS = ['saved', 'newest', 'oldest', 'sender'];

export async function listReceived(me, query) {
  const box = requireEnum(query.box, 'box', BOXES);
  const from = query.from ? requireEnum(query.from, 'from', FROMS) : undefined;
  const sort = query.sort ? requireEnum(query.sort, 'sort', SORTS) : undefined;
  const q = query.q ? requireString(query.q, '검색어', { max: 50 }) : undefined;
  if ((q || sort) && box !== 'archived') throw invalid('검색과 정렬은 보관함(box=archived)에서만 쓸 수 있어요.');
  const { limit, offset } = parsePaging(query);

  await notificationsRepository.ensureOpenNotifications(me.id);
  const rows = await lettersRepository.listReceived(me.id, { box, from, q, sort, limit, offset });
  const counts = await lettersRepository.countReceived(me.id, from);
  return { items: rows.slice(0, limit).map((r) => toListItem(r, me.id)), counts, hasMore: rows.length > limit };
}

export async function listSent(me, query) {
  const { limit, offset } = parsePaging(query);
  const rows = await lettersRepository.listSent(me.id, { limit, offset });
  return { items: rows.slice(0, limit).map((r) => toListItem(r, me.id)), hasMore: rows.length > limit };
}

/** 받는 사람(받은 편지를 지우지 않음) 또는 보낸 사람만. 그 외에는 존재 여부도 알리지 않는다(404). */
async function findVisible(me, rawId) {
  const id = parseId(rawId);
  const row = await lettersRepository.findById(id);
  if (!row) throw notFound();
  const isRecipient = String(row.recipient_id) === String(me.id) && !row.recipient_deleted_at;
  const isSender = String(row.sender_id) === String(me.id);
  if (!isRecipient && !isSender) throw notFound();
  return { id, row, isRecipient };
}

export async function getLetter(me, rawId) {
  const { id, row, isRecipient } = await findVisible(me, rawId);
  if (isRecipient && Number(row.is_open) && !row.first_read_at) {
    await lettersRepository.markFirstRead(id);
    return toLetter(await lettersRepository.findById(id), me.id);
  }
  return toLetter(row, me.id);
}

export async function updateLetter(me, rawId, body) {
  const id = parseId(rawId);
  const fields = {};
  if (body?.title !== undefined) fields.title = parseTitle(body.title);
  if (body?.content !== undefined) fields.content = parseContent(body.content);
  if (body?.openDate !== undefined) fields.openAt = parseOpenDate(body.openDate);
  if (Object.keys(fields).length === 0) throw invalid('바꿀 항목(title, content, openDate)을 보내 주세요.');

  await withTransaction(async (tx) => {
    const locked = await lettersRepository.lockForUpdate(id, tx);
    if (!locked || String(locked.sender_id) !== String(me.id)) throw notFound();
    if (!Number(locked.is_sealed)) throw forbidden('이미 공개된 편지는 수정할 수 없어요.');
    await lettersRepository.updateSealed(id, fields, tx);
  });
  return toLetter(await lettersRepository.findById(id), me.id);
}

export async function deleteLetter(me, rawId) {
  const id = parseId(rawId);
  await withTransaction(async (tx) => {
    const locked = await lettersRepository.lockForUpdate(id, tx);
    if (!locked || String(locked.sender_id) !== String(me.id)) throw notFound();
    if (!Number(locked.is_sealed)) throw forbidden('이미 공개된 편지는 삭제할 수 없어요.');
    await lettersRepository.remove(id, tx);
  });
  return { deleted: true };
}

export async function replyToLetter(me, rawId, body) {
  const id = parseId(rawId);
  const title = parseTitle(body?.title);
  const content = parseContent(body?.content);
  const openAt = parseOpenDate(body?.openDate);

  try {
    const replyId = await withTransaction(async (tx) => {
      const original = await lettersRepository.lockForUpdate(id, tx);
      const isRecipient = original && String(original.recipient_id) === String(me.id) && !original.recipient_deleted_at;
      if (!isRecipient) throw notFound();
      if (!Number(original.in_reply_window)) throw forbidden('답장은 편지가 공개된 날에만 보낼 수 있어요.');
      const recipientId = String(original.sender_id);
      const recipientType = recipientId === String(me.id) ? 'self' : original.recipient_type === 'self' ? 'friend' : original.recipient_type;
      const newId = await lettersRepository.insert({ senderId: me.id, recipientId, recipientType, title, content, openAt, replyToLetterId: id }, tx);
      if (recipientId !== String(me.id)) await notificationsRepository.insert(recipientId, 'reply_received', newId, tx);
      return newId;
    });
    return toLetter(await lettersRepository.findById(replyId), me.id);
  } catch (err) {
    if (duplicateKeyName(err) === 'letters_one_reply_uq') throw forbidden('이 편지에는 이미 답장했어요.');
    throw err;
  }
}

async function findOpenedForRecipient(me, rawId) {
  const { id, row, isRecipient } = await findVisible(me, rawId);
  if (!isRecipient) throw notFound();
  if (!Number(row.is_open)) throw forbidden('공개된 편지만 보관하거나 지울 수 있어요.');
  return id;
}

export async function setArchived(me, rawId, body) {
  if (typeof body?.archived !== 'boolean') throw invalid('archived 는 true 또는 false 예요.');
  const id = await findOpenedForRecipient(me, rawId);
  await lettersRepository.setArchived(id, body.archived);
  const row = await lettersRepository.findById(id);
  return { id, archivedAt: row.archived_at ? row.archived_at.toISOString() : null };
}

export async function deleteReceived(me, rawId) {
  const id = await findOpenedForRecipient(me, rawId);
  await lettersRepository.softDeleteForRecipient(id);
  return { deleted: true };
}
