import { Router } from 'express';
import { env } from '../config/env.js';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.post('/kakao', auth.kakaoLogin);
router.get('/handle-availability', requireAuth('any'), auth.handleAvailability);
router.post('/signup', requireAuth('signup'), auth.signup);

// 개발 전용 로그인 (env.js 가 운영에서 켜지지 않게 막는다)
if (env.devLoginEnabled && !env.isProduction) router.post('/dev-login', auth.devLogin);

export default router;
