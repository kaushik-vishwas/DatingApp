import { Router } from 'express';
import {
  completeMobileSignup,
  forgotPassword,
  getMe,
  login,
  lookupPhone,
  register,
  resetPassword,
  sendOtp,
  sendOtpMobile,
  verifyOtp,
  verifyOtpMobile,
} from '../controllers/authController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/send-otp', sendOtp);
router.post('/lookup-phone', lookupPhone);
router.post('/send-otp-mobile', sendOtpMobile);
router.post('/verify-otp-mobile', verifyOtpMobile);
router.post('/complete-mobile-signup', completeMobileSignup);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-otp', verifyOtp);
router.get('/me', protect, getMe);

export default router;

