import { AppError } from '../utils/appError.js';

/**
 * 서버가 종료 절차에 들어가면(server.js 가 app.locals.isShuttingDown = true) 새 요청을 503으로 돌려보낸다.
 * 진행 중이던 요청은 그대로 끝까지 처리된다.
 */
export function shutdownGuard(req, res, next) {
  if (req.app.locals.isShuttingDown) {
    res.set('Connection', 'close');
    return next(new AppError('SERVICE_SHUTTING_DOWN'));
  }
  return next();
}
