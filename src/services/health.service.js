// 비즈니스 로직 계층 예시. HTTP(req/res)를 모르고, 결과 데이터만 돌려준다.
import * as healthRepository from '../repositories/health.repository.js';

export async function getHealth() {
  // DB 연결이 안 되면 여기서 던진 오류가 errorHandler 에서 503 DATABASE_UNAVAILABLE 이 된다.
  await healthRepository.pingDatabase();
  return { status: 'ok', db: 'up' };
}
