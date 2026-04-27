import { Router } from 'express';
import {
  getMessages,
  listConversations,
  blockChatPeer,
  reportChatPeer,
  clearChatHistory,
  markConversationRead,
} from '../controllers/chatController';
import { protect } from '../middleware/auth';

const router = Router();

router.get('/messages', protect, getMessages);
router.get('/conversations', protect, listConversations);
router.post('/block', protect, blockChatPeer);
router.post('/report', protect, reportChatPeer);
router.post('/clear', protect, clearChatHistory);
router.post('/mark-read', protect, markConversationRead);

export default router;
