import { Router } from 'express';
import {
  completeCallerProfile,
  completeProfile,
  deleteReceiverAccount,
  getCallerCallHistory,
  getCallerNotifications,
  getReceiverWithdrawalOverview,
  getReceiverEarningsBreakdown,
  updateReceiverProfile,
  sendReceiverBankUpdateOtp,
  verifyReceiverBankUpdateOtp,
  saveCallerUserAudio,
  sendReceiverWithdrawalOtp,
  getReceiverCallInsights,
  updateCallerProfile,
  verifyReceiverWithdrawalOtpAndCreate,
  getReceiverWalletSummary,
  getReceiverNotifyCandidates,
  notifyReceiverRecentUser,
  reopenRejectedReceiverKyc,
  saveReceiverKycBankFinalize,
  saveReceiverKycDocuments,
  saveReceiverKycProfileInfo,
} from '../controllers/profileController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/complete', protect, completeProfile);
router.patch('/caller-audio', protect, saveCallerUserAudio);
router.post('/complete-caller', protect, completeCallerProfile);
router.patch('/caller', protect, updateCallerProfile);
router.get('/receiver-wallet-summary', protect, getReceiverWalletSummary);
router.get('/withdrawals/overview', protect, getReceiverWithdrawalOverview);
router.post('/withdrawals/send-otp', protect, sendReceiverWithdrawalOtp);
router.post('/withdrawals/verify', protect, verifyReceiverWithdrawalOtpAndCreate);
router.get('/receiver-call-insights', protect, getReceiverCallInsights);
router.get('/receiver-notify-candidates', protect, getReceiverNotifyCandidates);
router.post('/receiver-notify-user', protect, notifyReceiverRecentUser);
router.patch('/receiver/kyc/profile-info', protect, saveReceiverKycProfileInfo);
router.patch('/receiver/kyc/documents', protect, saveReceiverKycDocuments);
router.patch('/receiver/kyc/bank', protect, saveReceiverKycBankFinalize);
router.patch('/receiver', protect, updateReceiverProfile);
router.post('/receiver/reopen-kyc', protect, reopenRejectedReceiverKyc);
router.delete('/receiver', protect, deleteReceiverAccount);
router.get('/caller-call-history', protect, getCallerCallHistory);
router.get('/caller-notifications', protect, getCallerNotifications);
router.post('/receiver/bank/send-otp', protect, sendReceiverBankUpdateOtp);
router.post('/receiver/bank/verify', protect, verifyReceiverBankUpdateOtp);
router.get('/receiver-earnings-breakdown', protect, getReceiverEarningsBreakdown);

export default router;
