import { Router } from 'express';
import { protect } from '../middleware/auth';
import { getVoiceBootstrap } from '../controllers/callController';

const router = Router();

router.get('/bootstrap', protect, getVoiceBootstrap);

export default router;
