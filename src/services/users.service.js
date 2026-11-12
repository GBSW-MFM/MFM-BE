import * as usersRepository from '../repositories/users.repository.js';
import { AppError } from '../utils/appError.js';
import { normalizeHandle } from '../utils/validate.js';

export async function getMe(userId) {
  const u = await usersRepository.findById(userId);
  if (!u) throw new AppError('UNAUTHORIZED');
  return {
    id: String(u.id),
    handle: u.handle,
    name: u.name,
    age: Number(u.age),
    gender: u.gender,
    email: u.email,
    notificationAgreed: Boolean(u.notification_agreed),
    createdAt: u.created_at.toISOString(),
  };
}

/** 받는 사람 아이디 확인. 이메일·나이 등은 내려주지 않는다. 본인은 "없음"으로(나에게 보내기는 유형 '나'로). */
export async function lookupByHandle(me, rawHandle) {
  const handle = normalizeHandle(rawHandle);
  const u = await usersRepository.findByHandle(handle);
  if (!u || String(u.id) === String(me.id)) return { exists: false, user: null };
  return { exists: true, user: { handle: u.handle, name: u.name } };
}
