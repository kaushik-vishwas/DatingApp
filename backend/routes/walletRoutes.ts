import { Router } from 'express';
import {
  createRazorpayWalletOrder,
  creditWallet,
  listWalletTopups,
  verifyRazorpayWalletPayment,
} from '../controllers/walletController';
import { listWalletOffers } from '../controllers/walletOffersController';
import { protect } from '../middleware/auth';

const router = Router();

router.get('/topups', protect, listWalletTopups);

// Active wallet offers (recharge packs) for caller app.
router.get('/offers', protect, listWalletOffers);

router.post('/razorpay-order', protect, createRazorpayWalletOrder);
router.post('/razorpay-verify', protect, verifyRazorpayWalletPayment);
router.post('/credit', protect, creditWallet);

export default router;
