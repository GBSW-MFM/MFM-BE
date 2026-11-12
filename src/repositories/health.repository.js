// 데이터 접근 계층 예시. SQL 은 repositories 에만 둔다.
import { ping } from '../config/db.js';

export async function pingDatabase() {
  await ping();
}
