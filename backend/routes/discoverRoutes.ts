import { Router } from 'express';
import { listReceiversForCaller } from '../controllers/discoverController';
import { protect } from '../middleware/auth';

const router = Router();

router.get('/receivers', protect, listReceiversForCaller);

export default router;
