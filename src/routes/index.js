// /api 아래 모든 라우터. 기능을 추가하면 여기에 한 줄씩 붙인다.
import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import lettersRoutes from './letters.routes.js';
import notificationsRoutes from './notifications.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/letters', lettersRoutes);
router.use('/notifications', notificationsRoutes);

export default router;
