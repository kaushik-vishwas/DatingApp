import { Router } from 'express';
import {
  getMessages,
  listConversations,
  blockChatPeer,
  unblockChatPeer,
  getChatBlockStatus,
  reportChatPeer,
  clearChatHistory,
  markConversationRead,
} from '../controllers/chatController';
import { protect } from '../middleware/auth';

const router = Router();

router.get('/messages', protect, getMessages);
router.get('/conversations', protect, listConversations);
router.get('/block-status', protect, getChatBlockStatus);
router.post('/block', protect, blockChatPeer);
router.post('/unblock', protect, unblockChatPeer);
router.post('/report', protect, reportChatPeer);
router.post('/clear', protect, clearChatHistory);
router.post('/mark-read', protect, markConversationRead);

export default router;
