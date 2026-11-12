import { Router } from 'express';
import * as letters from '../controllers/letters.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
router.use(requireAuth());

router.post('/', letters.create);
router.get('/received', letters.listReceived); // /:id 보다 먼저 등록
router.get('/sent', letters.listSent);
router.get('/:id', letters.getOne);
router.patch('/:id', letters.update);
router.delete('/:id', letters.remove);
router.post('/:id/reply', letters.reply);
router.patch('/:id/archive', letters.archive);
router.delete('/:id/received', letters.removeReceived);

export default router;
