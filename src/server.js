// 서버 실행 진입점. 포트를 열고, 종료 신호와 프로세스 수준 오류를 처리한다.
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool, ping } from './config/db.js';
import { logger } from './utils/logger.js';

const app = createApp();
let shuttingDown = false;

const server = app.listen(env.port, () => {
  logger.info('server.started', { port: env.port, nodeEnv: env.nodeEnv });
  // DB가 꺼져 있어도 서버는 뜬다. 그동안 DB가 필요한 요청은 503, /api/health 도 503 으로 알린다.
  ping()
    .then(() => logger.info('db.connected'))
    .catch((err) => logger.warn('db.unavailable_at_startup', { err }));
});

server.on('error', (err) => {
  // 포트 사용 중(EADDRINUSE) 등 서버를 열 수 없으면 계속 실행할 의미가 없다.
  logger.fatal('server.listen_failed', { err });
  process.exit(1);
});

/**
 * 정상 종료와 복구 불가 오류 모두 같은 절차를 밟는다.
 * 새 요청 503 → 진행 중 요청 마무리 → DB 풀 종료 → 종료.
 * exitCode 1 은 프로세스 관리자(pm2, Docker 재시작 정책 등)가 다시 띄우라는 신호다.
 */
function shutdown(reason, exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.locals.isShuttingDown = true;
  logger.info('server.shutting_down', { reason, exitCode });

  const forceTimer = setTimeout(() => {
    logger.error('server.shutdown_timeout', { timeoutMs: env.shutdownTimeoutMs });
    process.exit(exitCode || 1);
  }, env.shutdownTimeoutMs);
  forceTimer.unref();

  server.close(async () => {
    try {
      await closePool();
    } catch (err) {
      logger.error('db.pool_close_failed', { err });
    }
    logger.info('server.stopped', { reason });
    process.exit(exitCode);
  });
  // keep-alive 로 놀고 있는 연결은 바로 닫는다.
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

// 어디서도 처리하지 않은 오류는 서버 상태를 믿을 수 없다는 뜻이다.
// 조용히 계속 돌지 않고, 기록 후 진행 중 요청을 마무리하고 재시작되도록 종료한다.
process.on('unhandledRejection', (reason) => {
  logger.fatal('process.unhandled_rejection', { err: reason instanceof Error ? reason : new Error(String(reason)) });
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal('process.uncaught_exception', { err });
  shutdown('uncaughtException', 1);
});
