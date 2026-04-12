import { Router } from 'express';
import {
  forgotPassword,
  getMe,
  login,
  register,
  resetPassword,
  sendOtp,
  verifyOtp,
} from '../controllers/authController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/send-otp', sendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-otp', verifyOtp);
router.get('/me', protect, getMe);

export default router;

