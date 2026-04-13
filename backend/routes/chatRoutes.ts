import { Router } from 'express';
import { getMessages, listConversations } from '../controllers/chatController';
import { protect } from '../middleware/auth';

const router = Router();

router.get('/messages', protect, getMessages);
router.get('/conversations', protect, listConversations);

export default router;
