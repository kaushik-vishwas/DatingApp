import { Router } from 'express';
import {
  createRazorpayWalletOrder,
  creditWallet,
  verifyRazorpayWalletPayment,
} from '../controllers/walletController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/razorpay-order', protect, createRazorpayWalletOrder);
router.post('/razorpay-verify', protect, verifyRazorpayWalletPayment);
router.post('/credit', protect, creditWallet);

export default router;
