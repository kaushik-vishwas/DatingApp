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
  computeWalletRechargeBreakdown,
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

function roundPayAmountInr(n: number): number {
  return Math.round(n * 100) / 100;
}

function payAmountToPaise(payAmount: number): number {
  return Math.round(roundPayAmountInr(payAmount) * 100);
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

type ResolvedOrderWalletMeta = {
  userId: string;
  payAmount: number;
  bonusPercent: number;
  walletAmount: number;
};

/** Parse Razorpay order notes into wallet recharge fields (shared by webhook + reconcile). */
async function resolveOrderWalletMeta(
  order: { amount?: number | string; notes?: Record<string, unknown> | null },
  orderId: string
): Promise<ResolvedOrderWalletMeta | { error: string }> {
  const notes = (order?.notes ?? {}) as Record<string, unknown>;
  const userId = String(notes.userId ?? '').trim();
  const notesBonusPercent = Number(notes.bonusPercent);
  const notesWalletAmount = Number(notes.walletAmount);

  if (!userId || !mongoose.isValidObjectId(userId)) {
    return { error: 'missing_user' };
  }

  const orderAmountPaise = Number(order.amount);
  if (!Number.isFinite(orderAmountPaise) || orderAmountPaise <= 0) {
    return { error: 'amount_mismatch' };
  }

  const effectivePayAmount = roundPayAmountInr(orderAmountPaise / 100);
  let bonusPercent = Number.isFinite(notesBonusPercent) ? Math.round(notesBonusPercent) : NaN;
  let walletAmount =
    Number.isFinite(notesWalletAmount) && notesWalletAmount > 0 ? Math.round(notesWalletAmount) : NaN;

  if (
    Number.isFinite(walletAmount) &&
    Number.isFinite(bonusPercent) &&
    payableMatchesWalletPack(walletAmount, effectivePayAmount)
  ) {
    return {
      userId,
      payAmount: effectivePayAmount,
      bonusPercent,
      walletAmount,
    };
  }

  // Older orders stored notes.payAmount as a rounded rupee (e.g. "65" vs charged ₹64.90).
  // Trust Razorpay order paise + pack notes when they are within ₹1.
  if (
    Number.isFinite(walletAmount) &&
    Number.isFinite(bonusPercent) &&
    payableMatchesWalletPack(walletAmount, effectivePayAmount, 1)
  ) {
    return {
      userId,
      payAmount: effectivePayAmount,
      bonusPercent,
      walletAmount,
    };
  }

  const inferredWithBonus = Number.isFinite(bonusPercent)
    ? await inferWalletAmountFromPay(effectivePayAmount, bonusPercent)
    : null;
  if (inferredWithBonus != null && Number.isFinite(bonusPercent)) {
    return {
      userId,
      payAmount: effectivePayAmount,
      bonusPercent,
      walletAmount: inferredWithBonus,
    };
  }

  const inferredAny = await inferWalletPackFromOrderAmount(
    effectivePayAmount,
    Number.isFinite(bonusPercent) ? bonusPercent : undefined
  );
  if (!inferredAny) {
    return { error: 'pack_mismatch' };
  }

  return {
    userId,
    payAmount: effectivePayAmount,
    bonusPercent: inferredAny.bonusPercent,
    walletAmount: inferredAny.walletAmount,
  };
}

type RazorpayPaymentRow = {
  id?: string;
  order_id?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
};

/** Razorpay SDK rejects with plain objects (`{ error: { description } }`), not Error instances. */
function razorpayErrorMessage(err: unknown, fallback = 'Server error'): string {
  if (err instanceof Error && err.message) return err.message;
  const rz = err as { error?: { description?: unknown; reason?: unknown }; message?: unknown } | null;
  const description = rz?.error?.description ?? rz?.message ?? rz?.error?.reason;
  if (typeof description === 'string' && description.trim()) return description.trim();
  return fallback;
}

/**
 * Authorized-but-uncaptured payments are auto-refunded by Razorpay after a few days, so we must
 * capture before crediting. Returns 'captured' only when the money is actually settled to us.
 */
async function ensurePaymentCaptured(
  rz: Razorpay,
  payment: RazorpayPaymentRow
): Promise<'captured' | 'not_captured'> {
  const status = String(payment.status ?? '').trim();
  if (status === 'captured') return 'captured';
  if (status !== 'authorized' || !payment.id) return 'not_captured';
  const paymentId = String(payment.id);
  try {
    await rz.payments.capture(paymentId, Number(payment.amount), String(payment.currency || 'INR'));
    return 'captured';
  } catch (err) {
    // Auto-capture may have raced us ("already captured") — trust Razorpay's current status.
    try {
      const fresh = await rz.payments.fetch(paymentId);
      if (String(fresh.status) === 'captured') return 'captured';
    } catch {
      // fall through
    }
    console.error('ensurePaymentCaptured failed:', paymentId, razorpayErrorMessage(err));
    return 'not_captured';
  }
}

/** Pick the latest captured/authorized payment for an order. */
function pickSuccessfulPayment(rows: RazorpayPaymentRow[]): RazorpayPaymentRow | null {
  const ok = rows.filter((p) => {
    const status = String(p.status ?? '').trim();
    return status === 'captured' || status === 'authorized';
  });
  return ok.length > 0 ? ok[ok.length - 1]! : null;
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

/** Match payable to any active offer when notes bonus/wallet are stale. */
async function inferWalletPackFromOrderAmount(
  payAmount: number,
  preferredBonusPercent?: number
): Promise<{ walletAmount: number; bonusPercent: number } | null> {
  const offers = await WalletOffer.find({}).select('amount bonusPercent').lean();
  const preferred = Number.isFinite(preferredBonusPercent)
    ? Math.round(preferredBonusPercent as number)
    : null;

  const matches: { walletAmount: number; bonusPercent: number }[] = [];
  for (const o of offers) {
    const amount = Number(o.amount);
    const bonus = Math.round(Number(o.bonusPercent) || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (!payableMatchesWalletPack(amount, payAmount)) continue;
    matches.push({ walletAmount: Math.round(amount), bonusPercent: bonus });
  }
  if (matches.length === 0) return null;
  if (preferred != null) {
    const hit = matches.find((m) => m.bonusPercent === preferred);
    if (hit) return hit;
  }
  return matches[0] ?? null;
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

  const existingOrder = await WalletTopup.findOne({ razorpayOrderId: orderId });
  if (existingOrder) {
    if (String(existingOrder.userId) !== String(userId)) {
      return { ok: false, reason: 'Payment does not belong to this account' };
    }
    if (existingOrder.razorpayPaymentId !== paymentId) {
      // Second captured payment on an already-credited order (late UPI success) — needs a refund.
      console.error('[wallet] duplicate payment on credited order — refund required', {
        orderId,
        creditedPaymentId: existingOrder.razorpayPaymentId,
        duplicatePaymentId: paymentId,
        userId,
      });
    }
    return {
      ok: true,
      creditAdded: existingOrder.creditAdded,
      alreadyCredited: true,
      userId: String(existingOrder.userId),
    };
  }

  const { validateOfferForCredit } = await import('./walletOffersController');
  const isValidOffer = await validateOfferForCredit(walletAmount, bonusPercent);
  const packMatchesCharge = payableMatchesWalletPack(walletAmount, payAmount, 1);
  if (!isValidOffer && !packMatchesCharge) {
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
      const dup =
        (await WalletTopup.findOne({ razorpayPaymentId: paymentId })) ||
        (await WalletTopup.findOne({ razorpayOrderId: orderId }));
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

/** Credit a captured Razorpay payment by id (idempotent). Used by backfill / support. */
export async function creditRazorpayCapturedPayment(paymentIdRaw: string): Promise<
  CreditCapturedResult & { paymentId: string; orderId?: string }
> {
  const paymentId = String(paymentIdRaw || '').trim();
  const rz = getRazorpay();
  if (!rz) {
    return { ok: false, reason: 'Wallet payments are not configured on the server', paymentId };
  }
  const fetched = await rz.payments.fetch(paymentId);
  const orderId = String(fetched.order_id ?? '').trim();
  const status = String(fetched.status ?? '').trim();
  if (!orderId) {
    return { ok: false, reason: 'Missing order id', paymentId };
  }
  if (status !== 'captured' && status !== 'authorized') {
    return { ok: false, reason: `Payment not complete (status: ${status || 'unknown'})`, paymentId, orderId };
  }
  const order = await rz.orders.fetch(orderId);
  const meta = await resolveOrderWalletMeta(order, orderId);
  if ('error' in meta) {
    return { ok: false, reason: meta.error, paymentId, orderId };
  }
  if ((await ensurePaymentCaptured(rz, fetched as RazorpayPaymentRow)) !== 'captured') {
    return { ok: false, reason: 'Payment authorized but capture failed', paymentId, orderId };
  }
  const credited = await creditCapturedWalletPayment({
    orderId,
    paymentId,
    userId: meta.userId,
    payAmount: meta.payAmount,
    bonusPercent: meta.bonusPercent,
    walletAmount: meta.walletAmount,
  });
  return { ...credited, paymentId, orderId };
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

    const bonusPercent = Number(req.body.bonusPercent);
    const walletAmountRaw = Number(req.body.walletAmount);
    if (!Number.isFinite(bonusPercent) || !Number.isFinite(walletAmountRaw) || walletAmountRaw <= 0) {
      res.status(400).json({ message: 'walletAmount and bonusPercent must be numbers' });
      return;
    }

    const walletAmount = Math.round(walletAmountRaw);
    const breakdown = computeWalletRechargeBreakdown(walletAmount);
    const chargedPayAmount = breakdown.totalPayable;
    const clientPayAmount = Number(req.body.payAmount);
    if (
      Number.isFinite(clientPayAmount) &&
      Math.abs(clientPayAmount - chargedPayAmount) > 1
    ) {
      res.status(400).json({ message: 'Invalid wallet recharge amount' });
      return;
    }

    const { validateOfferForOrder } = await import('./walletOffersController');
    const isValidOffer = await validateOfferForOrder(walletAmount, bonusPercent);
    if (!isValidOffer) {
      res.status(400).json({ message: 'Invalid wallet offer' });
      return;
    }

    const amountPaise = payAmountToPaise(chargedPayAmount);
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
        payAmount: (amountPaise / 100).toFixed(2),
        bonusPercent: String(Math.round(bonusPercent)),
        walletAmount: String(walletAmount),
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
    const msg = razorpayErrorMessage(err);
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

    if (!orderId || !paymentId || !signature) {
      res.status(400).json({ message: 'Missing Razorpay payment fields' });
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
    const meta = await resolveOrderWalletMeta(order, orderId);
    if ('error' in meta) {
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
    if ((await ensurePaymentCaptured(rz, payment as RazorpayPaymentRow)) !== 'captured') {
      // App falls back to reconcile; webhook / next reconcile credits once capture succeeds.
      res.status(502).json({ message: 'Payment received but not yet confirmed. Your wallet will update shortly.' });
      return;
    }

    const credited = await creditCapturedWalletPayment({
      orderId,
      paymentId,
      userId: String(authUser._id),
      payAmount: meta.payAmount,
      bonusPercent: meta.bonusPercent,
      walletAmount: meta.walletAmount,
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
    const msg = razorpayErrorMessage(err);
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
    const meta = await resolveOrderWalletMeta(order, orderId);
    if ('error' in meta) {
      console.error('razorpayWalletWebhook:', meta.error, orderId);
      res.status(200).json({ ok: false, reason: meta.error });
      return;
    }

    const capture = await ensurePaymentCaptured(rz, {
      id: paymentId,
      order_id: orderId,
      status,
      amount: paymentEntity.amount as number | string | undefined,
      currency: paymentEntity.currency as string | undefined,
    });
    if (capture !== 'captured') {
      // 500 → Razorpay retries the webhook; `payment.captured` also arrives if auto-capture wins.
      res.status(500).json({ ok: false, reason: 'capture_failed' });
      return;
    }

    const credited = await creditCapturedWalletPayment({
      orderId,
      paymentId,
      userId: meta.userId,
      payAmount: meta.payAmount,
      bonusPercent: meta.bonusPercent,
      walletAmount: meta.walletAmount,
    });

    if (!credited.ok) {
      console.error('razorpayWalletWebhook credit failed:', credited.reason, paymentId);
      const permanent =
        credited.reason === 'User not found' || credited.reason === 'Invalid wallet offer';
      res.status(permanent ? 200 : 500).json({ ok: false, reason: credited.reason });
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
    const msg = razorpayErrorMessage(err);
    console.error('razorpayWalletWebhook error:', msg);
    // Return 200 sparingly only for business skips; infrastructure errors should retry.
    res.status(500).json({ message: msg || 'Server error' });
  }
};

type ReconcileBody = {
  razorpay_order_id?: unknown;
  razorpay_payment_id?: unknown;
};

/**
 * POST /wallet/razorpay-reconcile — credit wallet from Razorpay order when app verify was missed (UPI Intent).
 * Server fetches order + payment from Razorpay API (no client signature). Idempotent by payment id.
 */
export const reconcileRazorpayWalletPayment = async (
  req: Request<{}, {}, ReconcileBody>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only app users can reconcile wallet payments' });
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

    const orderId =
      typeof req.body.razorpay_order_id === 'string' ? req.body.razorpay_order_id.trim() : '';
    const paymentIdHint =
      typeof req.body.razorpay_payment_id === 'string' ? req.body.razorpay_payment_id.trim() : '';
    if (!orderId) {
      res.status(400).json({ message: 'razorpay_order_id is required' });
      return;
    }

    const order = await rz.orders.fetch(orderId);
    const meta = await resolveOrderWalletMeta(order, orderId);
    if ('error' in meta) {
      res.status(400).json({ message: 'Invalid or incomplete Razorpay order for wallet recharge' });
      return;
    }
    if (String(meta.userId) !== String(authUser._id)) {
      res.status(403).json({ message: 'Order does not match your account' });
      return;
    }

    let payment: RazorpayPaymentRow | null = null;
    if (paymentIdHint) {
      const fetched = await rz.payments.fetch(paymentIdHint);
      if (String(fetched.order_id) !== orderId) {
        res.status(400).json({ message: 'Payment does not match order' });
        return;
      }
      payment = fetched as RazorpayPaymentRow;
    } else {
      const collection = await rz.orders.fetchPayments(orderId);
      const items = Array.isArray((collection as { items?: RazorpayPaymentRow[] }).items)
        ? (collection as { items: RazorpayPaymentRow[] }).items
        : [];
      payment = pickSuccessfulPayment(items);
    }

    if (!payment?.id) {
      res.status(200).json({
        message: 'Payment not completed yet on Razorpay',
        pending: true,
        credited: false,
      });
      return;
    }

    const status = String(payment.status ?? '').trim();
    if (status !== 'captured' && status !== 'authorized') {
      res.status(200).json({
        message: `Payment not complete (status: ${status || 'unknown'})`,
        pending: true,
        credited: false,
      });
      return;
    }
    if ((await ensurePaymentCaptured(rz, payment)) !== 'captured') {
      res.status(200).json({
        message: 'Payment received, waiting for confirmation from Razorpay',
        pending: true,
        credited: false,
      });
      return;
    }

    const credited = await creditCapturedWalletPayment({
      orderId,
      paymentId: String(payment.id),
      userId: meta.userId,
      payAmount: meta.payAmount,
      bonusPercent: meta.bonusPercent,
      walletAmount: meta.walletAmount,
    });
    if (!credited.ok) {
      const statusCode = credited.reason === 'User not found' ? 404 : 400;
      res.status(statusCode).json({ message: credited.reason });
      return;
    }

    const fresh = await User.findById(authUser._id);
    if (!fresh) {
      res.status(500).json({ message: 'User missing after credit' });
      return;
    }

    res.status(200).json({
      message: credited.alreadyCredited
        ? 'Wallet already credited for this payment'
        : 'Wallet credited from Razorpay',
      credited: true,
      pending: false,
      alreadyCredited: credited.alreadyCredited,
      creditAdded: credited.creditAdded,
      user: toApiUser(fresh),
    });
  } catch (err) {
    const msg = razorpayErrorMessage(err);
    console.error('reconcileRazorpayWalletPayment error:', msg);
    if ((err as { error?: { code?: string } })?.error?.code === 'BAD_REQUEST_ERROR') {
      res.status(400).json({ message: msg || 'Invalid Razorpay request' });
      return;
    }
    res.status(500).json({ message: msg || 'Server error' });
  }
};

type AdminReconcileBody = {
  razorpay_order_id?: unknown;
  razorpay_payment_id?: unknown;
};

/**
 * POST /admin/wallet/reconcile — support tool to credit a captured Razorpay payment (idempotent).
 */
export const adminReconcileRazorpayWalletPayment = async (
  req: Request<{}, {}, AdminReconcileBody>,
  res: Response
): Promise<void> => {
  try {
    const rz = getRazorpay();
    if (!rz) {
      res.status(503).json({ message: 'Wallet payments are not configured on the server' });
      return;
    }

    let orderId =
      typeof req.body.razorpay_order_id === 'string' ? req.body.razorpay_order_id.trim() : '';
    const paymentIdHint =
      typeof req.body.razorpay_payment_id === 'string' ? req.body.razorpay_payment_id.trim() : '';

    if (!orderId && paymentIdHint) {
      const fetched = await rz.payments.fetch(paymentIdHint);
      orderId = String(fetched.order_id ?? '').trim();
    }
    if (!orderId) {
      res.status(400).json({ message: 'razorpay_order_id or razorpay_payment_id is required' });
      return;
    }

    const order = await rz.orders.fetch(orderId);
    const meta = await resolveOrderWalletMeta(order, orderId);
    if ('error' in meta) {
      res.status(400).json({ message: `Cannot reconcile order (${meta.error})` });
      return;
    }

    let payment: RazorpayPaymentRow | null = null;
    if (paymentIdHint) {
      const fetched = await rz.payments.fetch(paymentIdHint);
      if (String(fetched.order_id) !== orderId) {
        res.status(400).json({ message: 'Payment does not match order' });
        return;
      }
      payment = fetched as RazorpayPaymentRow;
    } else {
      const collection = await rz.orders.fetchPayments(orderId);
      const items = Array.isArray((collection as { items?: RazorpayPaymentRow[] }).items)
        ? (collection as { items: RazorpayPaymentRow[] }).items
        : [];
      payment = pickSuccessfulPayment(items);
    }

    if (!payment?.id) {
      res.status(404).json({ message: 'No captured payment found for this order' });
      return;
    }

    const status = String(payment.status ?? '').trim();
    if (status !== 'captured' && status !== 'authorized') {
      res.status(400).json({ message: `Payment not complete (status: ${status || 'unknown'})` });
      return;
    }
    if ((await ensurePaymentCaptured(rz, payment)) !== 'captured') {
      res.status(400).json({ message: 'Payment is authorized but could not be captured' });
      return;
    }

    const credited = await creditCapturedWalletPayment({
      orderId,
      paymentId: String(payment.id),
      userId: meta.userId,
      payAmount: meta.payAmount,
      bonusPercent: meta.bonusPercent,
      walletAmount: meta.walletAmount,
    });
    if (!credited.ok) {
      res.status(400).json({ message: credited.reason });
      return;
    }

    const fresh = await User.findById(meta.userId);
    res.status(200).json({
      message: credited.alreadyCredited
        ? 'Wallet already credited for this payment'
        : 'Wallet credited from Razorpay',
      alreadyCredited: credited.alreadyCredited,
      creditAdded: credited.creditAdded,
      userId: meta.userId,
      razorpayOrderId: orderId,
      razorpayPaymentId: String(payment.id),
      walletBalance: fresh?.walletBalance ?? null,
    });
  } catch (err) {
    const msg = razorpayErrorMessage(err);
    console.error('adminReconcileRazorpayWalletPayment error:', msg);
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