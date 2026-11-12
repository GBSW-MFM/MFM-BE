// 한국 시간(KST, UTC+9, 서머타임 없음) 날짜 계산.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 지금 한국 날짜 'YYYY-MM-DD' */
export function todayKst(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD'(KST) 가 실제로 있는 날짜면 그날 00:00 KST 의 UTC Date, 아니면 null */
export function kstMidnightUtc(dateStr) {
  const m = DATE_RE.exec(String(dateStr || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(y, mo - 1, d) - KST_OFFSET_MS);
  const check = new Date(utc.getTime() + KST_OFFSET_MS);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return utc;
}

/** 'YYYY-MM-DD' 에 years 년 더하기 */
export function addYears(dateStr, years) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y + years, mo - 1, d));
  return date.toISOString().slice(0, 10);
}
