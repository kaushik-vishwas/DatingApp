import { Router } from 'express';
import { completeCallerProfile, completeProfile, updateCallerProfile } from '../controllers/profileController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/complete', protect, completeProfile);
router.post('/complete-caller', protect, completeCallerProfile);
router.patch('/caller', protect, updateCallerProfile);

export default router;
