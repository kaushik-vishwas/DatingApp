import crypto from 'crypto';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import User, { type UserDocument } from '../models/User';
import WalletTopup from '../models/WalletTopup';
import WalletCredit from '../models/WalletCredit';
import WalletOffer from '../models/WalletOffer';
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

type CreditCapturedResult =
  | { ok: true; creditAdded: number; alreadyCredited: boolean; userId: string }
  | { ok: false; reason: string };

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

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!signature || signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
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

/** When older orders lack notes.walletAmount, infer pack from offers + payable. */
async function inferWalletAmountFromPay(
  payAmount: number,
  bonusPercent: number
): Promise<number | null> {
  const bonus = Math.round(bonusPercent);
  const offers = await WalletOffer.find({ bonusPercent: bonus }).select('amount bonusPercent').lean();
  for (const o of offers) {
    const amount = Number(o.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (payableMatchesWalletPack(amount, payAmount)) return Math.round(amount);
  }
  return null;
}

/**
 * Idempotent wallet credit for a captured/authorized Razorpay payment.
 * Shared by app verify + webhook so UPI Intent misses still get credited.
 */
async function creditCapturedWalletPayment(input: {
  orderId: string;
  paymentId: string;
  userId: string;
  payAmount: number;
  bonusPercent: number;
  walletAmount: number;
}): Promise<CreditCapturedResult> {
  const { orderId, paymentId, userId, payAmount, bonusPercent, walletAmount } = input;

  const existing = await WalletTopup.findOne({ razorpayPaymentId: paymentId });
  if (existing) {
    if (String(existing.userId) !== String(userId)) {
      return { ok: false, reason: 'Payment does not belong to this account' };
    }
    return {
      ok: true,
      creditAdded: existing.creditAdded,
      alreadyCredited: true,
      userId: String(existing.userId),
    };
  }

  const { validateOfferForCredit } = await import('./walletOffersController');
  const isValidOffer = await validateOfferForCredit(walletAmount, bonusPercent);
  if (!isValidOffer) {
    return { ok: false, reason: 'Invalid wallet offer' };
  }

  const credit = walletCreditForRecharge(walletAmount, bonusPercent);
  const payRounded = Math.round(payAmount * 100) / 100;
  const bonusRounded = Math.round(bonusPercent * 100) / 100;

  const userRow = await User.findById(userId);
  if (!userRow) {
    return { ok: false, reason: 'User not found' };
  }

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
      await User.updateOne({ _id: userRow._id }, { $inc: { walletBalance: credit } }, { session });
    });
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code;
    if (code === 11000) {
      const dup = await WalletTopup.findOne({ razorpayPaymentId: paymentId });
      if (dup && String(dup.userId) === String(userId)) {
        return {
          ok: true,
          creditAdded: dup.creditAdded,
          alreadyCredited: true,
          userId: String(dup.userId),
        };
      }
    }
    throw e;
  } finally {
    await session.endSession();
  }

  return { ok: true, creditAdded: credit, alreadyCredited: false, userId: String(userRow._id) };
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
        walletAmount: String(resolved.walletAmount),
      },
    });

    const businessName = process.env.RAZORPAY_BUSINESS_NAME?.trim() || 'Nesthama';
    const keyId = process.env.RAZORPAY_KEY_ID!.trim();
    const currency = order.currency ?? 'INR';

    res.status(200).json({
      orderId: order.id,
      amount: amountPaise,
      currency,
      keyId,
      businessName,
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

    if (!verifyPaymentSignature(orderId, paymentId, signature, secret)) {
      res.status(400).json({ message: 'Invalid payment signature' });
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

    const credited = await creditCapturedWalletPayment({
      orderId,
      paymentId,
      userId: String(authUser._id),
      payAmount,
      bonusPercent,
      walletAmount: resolved.walletAmount,
    });
    if (!credited.ok) {
      const status = credited.reason === 'User not found' ? 404 : 400;
      res.status(status).json({ message: credited.reason });
      return;
    }

    const fresh = await User.findById(authUser._id);
    if (!fresh) {
      res.status(500).json({ message: 'User missing after credit' });
      return;
    }

    res.status(200).json({
      message: credited.alreadyCredited ? 'Wallet already credited for this payment' : 'Wallet credited',
      creditAdded: credited.creditAdded,
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

type RazorpayWebhookRequest = Request & { rawBody?: Buffer | string };

/**
 * POST /wallet/razorpay-webhook — Razorpay `payment.captured` safety net (no app auth).
 * Credits wallet when Checkout success never reaches the app (common with UPI Intent).
 * Configure in Razorpay Dashboard → Webhooks with RAZORPAY_WEBHOOK_SECRET.
 */
export const razorpayWalletWebhook = async (req: RazorpayWebhookRequest, res: Response): Promise<void> => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      console.error('razorpayWalletWebhook: RAZORPAY_WEBHOOK_SECRET is not set');
      res.status(503).json({ message: 'Webhook not configured' });
      return;
    }

    const signature = String(req.headers['x-razorpay-signature'] ?? '');
    const rawBody =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : '';
    if (!rawBody || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      res.status(400).json({ message: 'Invalid webhook signature' });
      return;
    }

    const event = String((req.body as { event?: unknown })?.event ?? '');
    if (event !== 'payment.captured' && event !== 'payment.authorized') {
      res.status(200).json({ ok: true, ignored: true, event });
      return;
    }

    const paymentEntity = (req.body as {
      payload?: { payment?: { entity?: Record<string, unknown> } };
    })?.payload?.payment?.entity;
    if (!paymentEntity) {
      res.status(400).json({ message: 'Missing payment entity' });
      return;
    }

    const paymentId = String(paymentEntity.id ?? '').trim();
    const orderId = String(paymentEntity.order_id ?? '').trim();
    const status = String(paymentEntity.status ?? '').trim();
    if (!paymentId || !orderId) {
      res.status(400).json({ message: 'Missing payment/order id' });
      return;
    }
    if (status !== 'captured' && status !== 'authorized') {
      res.status(200).json({ ok: true, ignored: true, status });
      return;
    }

    const rz = getRazorpay();
    if (!rz) {
      res.status(503).json({ message: 'Wallet payments are not configured on the server' });
      return;
    }

    const order = await rz.orders.fetch(orderId);
    const notes = (order?.notes ?? {}) as Record<string, unknown>;
    const userId = String(notes.userId ?? '').trim();
    const payAmount = Number(notes.payAmount);
    const bonusPercent = Number(notes.bonusPercent);
    let walletAmount = Number(notes.walletAmount);

    if (!userId || !mongoose.isValidObjectId(userId)) {
      console.error('razorpayWalletWebhook: missing/invalid userId on order', orderId);
      res.status(200).json({ ok: false, reason: 'missing_user' });
      return;
    }
    if (!Number.isFinite(payAmount) || !Number.isFinite(bonusPercent)) {
      console.error('razorpayWalletWebhook: missing payAmount/bonus on order', orderId);
      res.status(200).json({ ok: false, reason: 'missing_notes' });
      return;
    }

    if (!Number.isFinite(walletAmount) || walletAmount <= 0) {
      const inferred = await inferWalletAmountFromPay(payAmount, bonusPercent);
      if (!inferred) {
        console.error('razorpayWalletWebhook: cannot resolve walletAmount', orderId);
        res.status(200).json({ ok: false, reason: 'missing_wallet_amount' });
        return;
      }
      walletAmount = inferred;
    }

    const expectedPaise = Math.round(payAmount * 100);
    if (Number(order.amount) !== expectedPaise) {
      console.error('razorpayWalletWebhook: order amount mismatch', orderId);
      res.status(200).json({ ok: false, reason: 'amount_mismatch' });
      return;
    }

    if (!payableMatchesWalletPack(walletAmount, payAmount)) {
      console.error('razorpayWalletWebhook: pack mismatch', orderId);
      res.status(200).json({ ok: false, reason: 'pack_mismatch' });
      return;
    }

    const credited = await creditCapturedWalletPayment({
      orderId,
      paymentId,
      userId,
      payAmount,
      bonusPercent,
      walletAmount: Math.round(walletAmount),
    });

    if (!credited.ok) {
      console.error('razorpayWalletWebhook credit failed:', credited.reason, paymentId);
      res.status(200).json({ ok: false, reason: credited.reason });
      return;
    }

    console.log(
      `razorpayWalletWebhook: ${credited.alreadyCredited ? 'already credited' : 'credited'} ${credited.creditAdded} for ${paymentId}`
    );
    res.status(200).json({
      ok: true,
      alreadyCredited: credited.alreadyCredited,
      creditAdded: credited.creditAdded,
      paymentId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('razorpayWalletWebhook error:', msg);
    // Return 200 sparingly only for business skips; infrastructure errors should retry.
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