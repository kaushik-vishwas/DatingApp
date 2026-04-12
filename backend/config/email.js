/**
 * Nodemailer transporter using Gmail SMTP.
 * Requires EMAIL_USER and EMAIL_PASS (Gmail App Password) in .env.
 */
const nodemailer = require('nodemailer');

const createTransporter = () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.warn(
      'EMAIL_USER or EMAIL_PASS missing — OTP emails will fail until configured.'
    );
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  });
};

/**
 * Send OTP email to the user.
 * @param {string} to - Recipient email
 * @param {string} otp - 6-digit code
 */
const sendOtpEmail = async (to, otp) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_USER;

  await transporter.sendMail({
    from,
    to,
    subject: 'Your login code',
    text: `Your verification code is: ${otp}. It expires in 5 minutes.`,
    html: `<p>Your verification code is: <strong>${otp}</strong></p><p>It expires in 5 minutes.</p>`,
  });
};

module.exports = { createTransporter, sendOtpEmail };
