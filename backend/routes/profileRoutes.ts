import { Router } from 'express';
import {
  completeCallerProfile,
  completeProfile,
  saveCallerUserAudio,
  updateCallerProfile,
  getReceiverWalletSummary,
} from '../controllers/profileController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/complete', protect, completeProfile);
router.patch('/caller-audio', protect, saveCallerUserAudio);
router.post('/complete-caller', protect, completeCallerProfile);
router.patch('/caller', protect, updateCallerProfile);
router.get('/receiver-wallet-summary', protect, getReceiverWalletSummary);

export default router;
