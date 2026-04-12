import { Router } from 'express';
import {
  adminLogin,
  adminForgotPassword,
  adminResetPassword,
  adminRequestEmailChange,
  adminConfirmEmailChange,
  adminMe,
  listAllReceivers,
  getKycStats,
  listPendingReceivers,
  approveReceiver,
  rejectReceiver,
  listAppUsers,
  updateAppUser,
} from '../controllers/adminController';
import { adminProtect } from '../middleware/adminAuth';

const router = Router();

router.post('/auth/login', adminLogin);
router.post('/auth/forgot-password', adminForgotPassword);
router.post('/auth/reset-password', adminResetPassword);
router.get('/auth/me', adminProtect, adminMe);
router.post('/auth/request-email-change', adminProtect, adminRequestEmailChange);
router.post('/auth/confirm-email-change', adminProtect, adminConfirmEmailChange);

router.get('/users', adminProtect, listAppUsers);
router.patch('/users/:id', adminProtect, updateAppUser);

router.get('/receivers', adminProtect, listAllReceivers);
router.get('/receivers/pending', adminProtect, listPendingReceivers);
router.get('/kyc/stats', adminProtect, getKycStats);
router.patch('/receivers/:id/approve', adminProtect, approveReceiver);
router.patch('/receivers/:id/reject', adminProtect, rejectReceiver);

export default router;
