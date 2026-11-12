// Express 앱 조립. listen 은 하지 않는다(테스트가 앱만 가져다 쓸 수 있게).
import express from 'express';
import { env } from './config/env.js';
import { requestId } from './middlewares/requestId.js';
import { shutdownGuard } from './middlewares/shutdownGuard.js';
import { cors } from './middlewares/cors.js';
import { errorHandler } from './middlewares/errorHandler.js';
import apiRoutes from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.locals.isShuttingDown = false;

  app.use(requestId);
  app.use(shutdownGuard);
  app.use(cors(env.corsOrigins));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', apiRoutes);

  // 등록되지 않은 URL/메서드는 Express 기본 404 응답을 그대로 둔다(4xx 처리는 이번 범위 밖).

  app.use(errorHandler);
  return app;
}
