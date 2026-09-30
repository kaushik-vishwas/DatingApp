import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  endVoiceSession,
  acknowledgeIncomingCallRinging,
  declineIncomingCall,
  getIncomingPending,
  getVoiceBootstrap,
  markIncomingCallSeen,
  rateVoiceSession,
  reportVoiceSessionIssue,
  startVoiceSession,
  syncVoiceSession,
} from '../controllers/callController';

const router = Router();

router.get('/bootstrap', protect, getVoiceBootstrap);
router.get('/incoming-pending', protect, getIncomingPending);
router.post('/session/start', protect, startVoiceSession);
router.post('/session/sync', protect, syncVoiceSession);
router.post('/session/end', protect, endVoiceSession);
router.post('/session/rate', protect, rateVoiceSession);
router.post('/session/report', protect, reportVoiceSessionIssue);
// Native Android (no JS): decline from the notification / confirm the notification rang.
router.post('/:callId/decline', protect, declineIncomingCall);
router.post('/:callId/ringing', protect, acknowledgeIncomingCallRinging);
router.post('/:callId/seen', protect, markIncomingCallSeen);

export default router;
