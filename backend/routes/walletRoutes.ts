import { Router } from 'express';
import {
  createRazorpayWalletOrder,
  creditWallet,
  listWalletCredits,
  listWalletTopups,
  razorpayWalletWebhook,
  reconcileRazorpayWalletPayment,
  verifyRazorpayWalletPayment,
} from '../controllers/walletController';
import { listWalletOffers } from '../controllers/walletOffersController';
import { protect } from '../middleware/auth';

const router = Router();

router.get('/topups', protect, listWalletTopups);
router.get('/credits', protect, listWalletCredits);

// Active wallet offers (recharge packs) for caller app.
router.get('/offers', protect, listWalletOffers);

router.post('/razorpay-order', protect, createRazorpayWalletOrder);
router.post('/razorpay-verify', protect, verifyRazorpayWalletPayment);
router.post('/razorpay-reconcile', protect, reconcileRazorpayWalletPayment);
/** Public Razorpay webhook — do not put behind `protect`. */
router.post('/razorpay-webhook', razorpayWalletWebhook);
router.post('/credit', protect, creditWallet);

export default router;
