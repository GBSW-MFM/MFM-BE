import { Router } from 'express';
import * as users from '../controllers/users.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
router.use(requireAuth());

router.get('/me', users.getMe);
router.get('/lookup', users.lookup);

export default router;
