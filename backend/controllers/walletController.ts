import crypto from 'crypto';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import User, { type UserDocument } from '../models/User';
import WalletTopup from '../models/WalletTopup';
import WalletCredit from '../models/WalletCredit';
import { toApiUser } from './authController';
import { blockCallerUntilApproved } from '../utils/accountAccess';
import {
  payableMatchesWalletPack,
  walletCreditForRecharge,
} from '../constants/walletRechargeFees';

type LeanWalletTopup = {
  _id: mongoose.Types.ObjectId;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  payAmount: number;
  bonusPercent: number;
  creditAdded: number;
  createdAt: Date;
};

function getRazorpay(): Razorpay | null {
  const key_id = process.env.RAZORPAY_KEY_ID?.trim();
  const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!key_id || !key_secret) return null;
  return new Razorpay({ key_id, key_secret });
}

function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Validate recharge pack + payable total, then return wallet credit.
 */
function resolveWalletRecharge(
  payAmount: number,
  bonusPercent: number,
  walletAmountRaw: unknown
): { walletAmount: number; credit: number } | null {
  const walletAmount = Number(walletAmountRaw);
  if (!Number.isFinite(walletAmount) || walletAmount <= 0) return null;
  if (!payableMatchesWalletPack(walletAmount, payAmount)) return null;
  return {
    walletAmount: Math.round(walletAmount),
    credit: walletCreditForRecharge(walletAmount, bonusPercent),
  };
}

/**
 * GET /wallet/credits — non-Razorpay wallet credits (referral rewards, etc.) for callers.
 */
export const listWalletCredits = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only app users can view wallet credits' });
      return;
    }
    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (blockCallerUntilApproved(req, res)) return;

    const rows = await WalletCredit.find({ userId: authUser._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('source amountInr description referralId createdAt')
      .lean<
        {
          _id: mongoose.Types.ObjectId;
          source: string;
          amountInr: number;
          description: string;
          referralId: mongoose.Types.ObjectId | null;
          createdAt: Date;
        }[]
      >();

    res.status(200).json({
      credits: rows.map((r) => ({
        id: String(r._id),
        source: r.source,
        amountInr: r.amountInr,
        description: r.description,
        referralId: r.referralId ? String(r.referralId) : null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listWalletCredits error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /wallet/topups — list successful wallet recharges for the signed-in caller.
 */
export const listWalletTopups = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only app users can view wallet transactions' });
      return;
    }
    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (blockCallerUntilApproved(req, res)) return;

    const rows = await WalletTopup.find({ userId: authUser._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('razorpayOrderId razorpayPaymentId payAmount bonusPercent creditAdded createdAt')
      .lean<LeanWalletTopup[]>();

    res.status(200).json({
      topups: rows.map((r) => ({
        id: String(r._id),
        razorpayOrderId: r.razorpayOrderId,
        razorpayPaymentId: r.razorpayPaymentId,
        payAmount: r.payAmount,
        bonusPercent: r.bonusPercent,
        creditAdded: r.creditAdded,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listWalletTopups error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /wallet/razorpay-order — create Razorpay order (amount = payAmount in paise).
 */
export const createRazorpayWalletOrder = async (
  req: Request<{}, {}, { payAmount?: unknown; bonusPercent?: unknown; walletAmount?: unknown }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only app users can recharge wallet' });
      return;
    }
    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (blockCallerUntilApproved(req, res)) return;

    const rz = getRazorpay();
    if (!rz) {
      res.status(503).json({ message: 'Wallet payments are not configured on the server' });
      return;
    }

    const payAmount = Number(req.body.payAmount);
    const bonusPercent = Number(req.body.bonusPercent);
    if (!Number.isFinite(payAmount) || !Number.isFinite(bonusPercent)) {
      res.status(400).json({ message: 'payAmount and bonusPercent must be numbers' });
      return;
    }

    const resolved = resolveWalletRecharge(payAmount, bonusPercent, req.body.walletAmount);
    if (!resolved) {
      res.status(400).json({ message: 'Invalid wallet recharge amount' });
      return;
    }

    const { validateOfferForOrder } = await import('./walletOffersController');
    const isValidOffer = await validateOfferForOrder(resolved.walletAmount, bonusPercent);
    if (!isValidOffer) {
      res.status(400).json({ message: 'Invalid wallet offer' });
      return;
    }

    const amountPaise = Math.round(payAmount * 100);
    if (amountPaise < 100) {
      res.status(400).json({ message: 'Amount too small' });
      return;
    }

    const uid = String(authUser._id);
    const receipt = `w${uid.slice(-10)}${Date.now()}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);

    const order = await rz.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        userId: uid,
        payAmount: String(Math.round(payAmount)),
        bonusPercent: String(Math.round(bonusPercent)),
      },
    });

    res.status(200).json({
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency ?? 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      businessName: process.env.RAZORPAY_BUSINESS_NAME?.trim() || 'Nesthama',
      prefillContact: authUser.phone ?? '',
      prefillName: authUser.name ?? 'User',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('createRazorpayWalletOrder error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

type VerifyBody = {
  razorpay_order_id?: unknown;
  razorpay_payment_id?: unknown;
  razorpay_signature?: unknown;
  payAmount?: unknown;
  bonusPercent?: unknown;
  walletAmount?: unknown;
};

/**
 * POST /wallet/razorpay-verify — verify signature, then credit wallet (idempotent by payment id).
 */
export const verifyRazorpayWalletPayment = async (req: Request<{}, {}, VerifyBody>, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only app users can recharge wallet' });
      return;
    }
    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (blockCallerUntilApproved(req, res)) return;

    const rz = getRazorpay();
    const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!rz || !secret) {
      res.status(503).json({ message: 'Wallet payments are not configured on the server' });
      return;
    }

    const orderId = typeof req.body.razorpay_order_id === 'string' ? req.body.razorpay_order_id.trim() : '';
    const paymentId = typeof req.body.razorpay_payment_id === 'string' ? req.body.razorpay_payment_id.trim() : '';
    const signature = typeof req.body.razorpay_signature === 'string' ? req.body.razorpay_signature.trim() : '';
    const payAmount = Number(req.body.payAmount);
    const bonusPercent = Number(req.body.bonusPercent);

    if (!orderId || !paymentId || !signature) {
      res.status(400).json({ message: 'Missing Razorpay payment fields' });
      return;
    }
    if (!Number.isFinite(payAmount) || !Number.isFinite(bonusPercent)) {
      res.status(400).json({ message: 'payAmount and bonusPercent must be numbers' });
      return;
    }

    const resolved = resolveWalletRecharge(payAmount, bonusPercent, req.body.walletAmount);
    if (!resolved) {
      res.status(400).json({ message: 'Invalid wallet recharge amount' });
      return;
    }

    const { validateOfferForCredit } = await import('./walletOffersController');
    const isValidOffer = await validateOfferForCredit(resolved.walletAmount, bonusPercent);
    if (!isValidOffer) {
      res.status(400).json({ message: 'Invalid wallet offer' });
      return;
    }

    if (!verifyPaymentSignature(orderId, paymentId, signature, secret)) {
      res.status(400).json({ message: 'Invalid payment signature' });
      return;
    }

    const existing = await WalletTopup.findOne({ razorpayPaymentId: paymentId });
    if (existing) {
      if (String(existing.userId) !== String(authUser._id)) {
        res.status(403).json({ message: 'Payment does not belong to this account' });
        return;
      }
      const user = await User.findById(authUser._id);
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
      res.status(200).json({
        message: 'Wallet already credited for this payment',
        creditAdded: existing.creditAdded,
        user: toApiUser(user),
      });
      return;
    }

    const order = await rz.orders.fetch(orderId);
    if (!order || String(order.notes?.userId ?? '') !== String(authUser._id)) {
      res.status(400).json({ message: 'Order does not match your account' });
      return;
    }
    const expectedPaise = Math.round(payAmount * 100);
    if (Number(order.amount) !== expectedPaise) {
      res.status(400).json({ message: 'Order amount mismatch' });
      return;
    }

    const payment = await rz.payments.fetch(paymentId);
    if (String(payment.order_id) !== orderId) {
      res.status(400).json({ message: 'Payment does not match order' });
      return;
    }
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      res.status(400).json({ message: `Payment not complete (status: ${payment.status})` });
      return;
    }

    // Calculate credit using the helper function
    const credit = resolved.credit;

    const userRow = await User.findById(authUser._id);
    if (!userRow) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const payRounded = Math.round(payAmount * 100) / 100;
    const bonusRounded = Math.round(bonusPercent * 100) / 100;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await WalletTopup.create(
          [
            {
              userId: userRow._id,
              razorpayOrderId: orderId,
              razorpayPaymentId: paymentId,
              payAmount: payRounded,
              bonusPercent: bonusRounded,
              creditAdded: credit,
            },
          ],
          { session }
        );
        await User.updateOne({ _id: authUser._id }, { $inc: { walletBalance: credit } }, { session });
      });
    } catch (e: unknown) {
      const code = (e as { code?: number })?.code;
      if (code === 11000) {
        const dup = await WalletTopup.findOne({ razorpayPaymentId: paymentId });
        const u2 = await User.findById(authUser._id);
        if (dup && u2 && String(dup.userId) === String(authUser._id)) {
          res.status(200).json({
            message: 'Wallet already credited for this payment',
            creditAdded: dup.creditAdded,
            user: toApiUser(u2),
          });
          return;
        }
      }
      throw e;
    } finally {
      await session.endSession();
    }

    const fresh = await User.findById(authUser._id);
    if (!fresh) {
      res.status(500).json({ message: 'User missing after credit' });
      return;
    }

    res.status(200).json({
      message: 'Wallet credited',
      creditAdded: credit,
      user: toApiUser(fresh),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('verifyRazorpayWalletPayment error:', msg);
    if ((err as { error?: { code?: string } })?.error?.code === 'BAD_REQUEST_ERROR') {
      res.status(400).json({ message: msg || 'Invalid Razorpay request' });
      return;
    }
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * POST /wallet/credit — dev / emergency only when Razorpay keys are not set (do not use in production).
 */
export const creditWallet = async (
  req: Request<{}, {}, { payAmount?: unknown; bonusPercent?: unknown; walletAmount?: unknown }>,
  res: Response
): Promise<void> => {
  try {
    if (getRazorpay()) {
      res.status(403).json({ message: 'Use Razorpay checkout to add wallet balance' });
      return;
    }
    if (process.env.WALLET_ALLOW_MOCK_CREDIT?.toLowerCase() !== 'true') {
      res.status(403).json({ message: 'Mock wallet credit is disabled' });
      return;
    }

    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only app users can add wallet credit' });
      return;
    }

    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (blockCallerUntilApproved(req, res)) return;

    const payAmount = Number(req.body.payAmount);
    const bonusPercent = Number(req.body.bonusPercent);
    if (!Number.isFinite(payAmount) || !Number.isFinite(bonusPercent)) {
      res.status(400).json({ message: 'payAmount and bonusPercent must be numbers' });
      return;
    }

    const resolved = resolveWalletRecharge(payAmount, bonusPercent, req.body.walletAmount);
    if (!resolved) {
      res.status(400).json({ message: 'Invalid wallet recharge amount' });
      return;
    }

    const { validateOfferForCredit } = await import('./walletOffersController');
    const isValidOffer = await validateOfferForCredit(resolved.walletAmount, bonusPercent);
    if (!isValidOffer) {
      res.status(400).json({ message: 'Invalid wallet offer' });
      return;
    }

    const credit = resolved.credit;

    const user = await User.findById(authUser._id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const prev = typeof user.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;
    user.walletBalance = Math.round((prev + credit) * 100) / 100;
    await user.save();

    res.status(200).json({
      message: 'Wallet credited (mock)',
      creditAdded: credit,
      user: toApiUser(user),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('creditWallet error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};