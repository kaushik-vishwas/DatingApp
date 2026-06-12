import { Router } from 'express';
import {
  adminLogin,
  adminForgotPassword,
  adminResetPassword,
  adminRequestEmailChange,
  adminConfirmEmailChange,
  adminMe,
  listAllReceivers,
  getAdminSettings,
  getKycStats,
  listPendingReceivers,
  approveReceiver,
  rejectReceiver,
  listAppUsers,
  listPendingAppUsers,
  updateAppUser,
  updateReceiver,
  approveAppUser,
  rejectAppUser,
  listModerationReports,
  getOverviewDashboard,
  getRevenueDashboard,
  updateAdminNotificationControls,
  updateAdminReceiverEarningModel,
  updateAdminReceiverWelcome,
  updateAdminCallerNotification,
  updateAdminRole,
  listWithdrawals,
  resolveModerationReport,
  resolveWithdrawal,
} from '../controllers/adminController';
import { adminProtect } from '../middleware/adminAuth';
import {
  createAdminWalletOffer,
  deleteAdminWalletOffer,
  listAdminWalletOffers,
  updateAdminWalletOffer,
} from '../controllers/walletOffersController';
import { listCallerAppStoreReviews } from '../controllers/adminCallerAppReviewController';
import adminEarningsRoutes from './adminEarningsRoutes';

const router = Router();

router.post('/auth/login', adminLogin);
router.post('/auth/forgot-password', adminForgotPassword);
router.post('/auth/reset-password', adminResetPassword);
router.get('/auth/me', adminProtect, adminMe);
router.post('/auth/request-email-change', adminProtect, adminRequestEmailChange);
router.post('/auth/confirm-email-change', adminProtect, adminConfirmEmailChange);
router.get('/settings', adminProtect, getAdminSettings);
router.patch('/settings/notifications', adminProtect, updateAdminNotificationControls);
router.patch('/settings/earning-model', adminProtect, updateAdminReceiverEarningModel);
router.patch('/settings/receiver-welcome', adminProtect, updateAdminReceiverWelcome);
router.patch('/settings/caller-notification', adminProtect, updateAdminCallerNotification);
router.patch('/settings/admins/:id/role', adminProtect, updateAdminRole);

router.get('/users', adminProtect, listAppUsers);
router.get('/users/pending', adminProtect, listPendingAppUsers);
router.patch('/users/:id/approve', adminProtect, approveAppUser);
router.patch('/users/:id/reject', adminProtect, rejectAppUser);
router.patch('/users/:id', adminProtect, updateAppUser);

router.get('/receivers', adminProtect, listAllReceivers);
router.get('/receivers/pending', adminProtect, listPendingReceivers);
router.get('/kyc/stats', adminProtect, getKycStats);
router.patch('/receivers/:id/approve', adminProtect, approveReceiver);
router.patch('/receivers/:id/reject', adminProtect, rejectReceiver);
router.patch('/receivers/:id', adminProtect, updateReceiver);

router.get('/reports', adminProtect, listModerationReports);
router.patch('/reports/:id', adminProtect, resolveModerationReport);
router.get('/caller-app-reviews', adminProtect, listCallerAppStoreReviews);
router.get('/overview', adminProtect, getOverviewDashboard);
router.get('/revenue', adminProtect, getRevenueDashboard);
router.use('/earnings', adminEarningsRoutes);
router.get('/withdrawals', adminProtect, listWithdrawals);
router.patch('/withdrawals/:id', adminProtect, resolveWithdrawal);

// Wallet offers (recharge packs)
router.get('/wallet/offers', adminProtect, listAdminWalletOffers);
router.post('/wallet/offers', adminProtect, createAdminWalletOffer);
router.patch('/wallet/offers/:id', adminProtect, updateAdminWalletOffer);
router.delete('/wallet/offers/:id', adminProtect, deleteAdminWalletOffer);

export default router;
