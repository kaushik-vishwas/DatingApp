import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  endVoiceSession,
  getRandomQueuedReceiver,
  getVoiceBootstrap,
  rateVoiceSession,
  reportVoiceSessionIssue,
  startVoiceSession,
  syncVoiceSession,
} from '../controllers/callController';

const router = Router();

router.get('/bootstrap', protect, getVoiceBootstrap);
router.get('/random-receiver', protect, getRandomQueuedReceiver);
router.post('/session/start', protect, startVoiceSession);
router.post('/session/sync', protect, syncVoiceSession);
router.post('/session/end', protect, endVoiceSession);
router.post('/session/rate', protect, rateVoiceSession);
router.post('/session/report', protect, reportVoiceSessionIssue);

export default router;
