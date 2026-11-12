import { Router } from 'express';
import * as notifications from '../controllers/notifications.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
router.use(requireAuth());

router.get('/', notifications.list);
router.patch('/read-all', notifications.markAllRead); // /:id/read 보다 먼저
router.patch('/:id/read', notifications.markRead);

export default router;
