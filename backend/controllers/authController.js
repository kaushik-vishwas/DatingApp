/**
 * Auth controllers: register, send OTP, verify OTP, me.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendOtpEmail } = require('../config/email');

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Build JWT for a user id */
const signToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

/**
 * POST /auth/register
 * Create a new user (name, email, phone). Default role: both.
 */
const register = async (req, res) => {
  try {
    const { name, email, phone, role } = req.body;

    if (!name || !email || !phone) {
      return res
        .status(400)
        .json({ message: 'name, email, and phone are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const allowedRoles = ['caller', 'receiver', 'both'];
    const userRole = allowedRoles.includes(role) ? role : 'both';

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: String(phone).trim(),
      role: userRole,
      isVerified: false,
    });

    const safe = user.toObject();
    delete safe.otp;
    delete safe.otpExpiry;

    return res.status(201).json({
      message: 'User registered successfully',
      user: safe,
    });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/**
 * POST /auth/send-otp
 * Generate 6-digit OTP, save with expiry, email via Nodemailer.
 * User must exist (register first).
 */
const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'email is required' });
    }

    const user = await User.findOne({
      email: String(email).toLowerCase().trim(),
    });
    if (!user) {
      return res
        .status(404)
        .json({ message: 'No account for this email. Please register first.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Console log for local/testing without email
    console.log(`[OTP TEST] ${user.email} → OTP: ${otp} (expires ${otpExpiry.toISOString()})`);

    let emailSent = true;
    try {
      await sendOtpEmail(user.email, otp);
    } catch (mailErr) {
      emailSent = false;
      console.error('sendOtp email error:', mailErr.message);
    }

    // OTP is always stored; console shows it for testing even if email fails.
    if (!emailSent) {
      return res.status(200).json({
        message:
          'OTP saved. Email delivery failed — use the code printed in the server console or fix EMAIL_USER / EMAIL_PASS.',
        emailSent: false,
      });
    }

    return res.json({ message: 'OTP sent to your email', emailSent: true });
  } catch (err) {
    console.error('sendOtp error:', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/**
 * POST /auth/verify-otp
 * Verify OTP, mark verified, return JWT.
 */
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'email and otp are required' });
    }

    const user = await User.findOne({
      email: String(email).toLowerCase().trim(),
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ message: 'No OTP pending. Request a new code.' });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP expired. Request a new code.' });
    }

    if (String(otp).trim() !== user.otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = signToken(user._id);
    const safe = user.toObject();
    delete safe.otp;
    delete safe.otpExpiry;

    return res.json({
      message: 'Login successful',
      token,
      user: safe,
    });
  } catch (err) {
    console.error('verifyOtp error:', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/**
 * GET /auth/me
 * Return current user (protected).
 */
const getMe = async (req, res) => {
  try {
    const user = req.user.toObject ? req.user.toObject() : { ...req.user };
    delete user.otp;
    delete user.otpExpiry;
    return res.json({ user });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

module.exports = {
  register,
  sendOtp,
  verifyOtp,
  getMe,
};
