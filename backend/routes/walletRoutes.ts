import { Router } from 'express';
import { creditWallet } from '../controllers/walletController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/credit', protect, creditWallet);

export default router;
