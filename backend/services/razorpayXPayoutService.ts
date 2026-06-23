import mongoose from 'mongoose';
import WithdrawalRequest, { type PayoutStatus } from '../models/WithdrawalRequest';
import AdminWithdrawalRequest from '../models/AdminWithdrawalRequest';
import Receiver from '../models/Receiver';
import {
  resolveWithdrawalPayoutAmount,
  resolveWithdrawalWalletDebitAmount,
} from '../constants/receiverWithdrawalFees';
import { resolveReceiverPayoutDestination } from '../utils/receiverPayoutDestination';
import { emitReceiverWithdrawalUpdate } from '../socket/socketRegistry';
import { razorpayContactEmailFromPhone } from '../utils/razorpayContact';

type RazorpayPayoutCreateResponse = {
  id?: string;
  status?: string;
  utr?: string | null;
  error?: { description?: string | null; reason?: string | null } | null;
  status_details?: { description?: string | null; reason?: string | null } | null;
};

type RazorpayPayoutFetchResponse = {
  id?: string;
  status?: string;
  utr?: string | null;
  error?: { description?: string | null; reason?: string | null } | null;
  status_details?: { description?: string | null; reason?: string | null } | null;
};

function roundInrToPaise(n: number): number {
  return Math.round(n * 100);
}

function safeTrim(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

function mapRazorpayPayoutStatusToPayoutStatus(status: string | undefined): PayoutStatus {
  const s = String(status ?? '').toLowerCase();
  if (s === 'processed') return 'success';
  if (s === 'failed' || s === 'rejected') return 'failed';
  // queued/processing/pending -> treat as in-flight
  return 'processing';
}

function extractRazorpayErrorMessage(payload: RazorpayPayoutCreateResponse | RazorpayPayoutFetchResponse): string {
  const desc = payload.error?.description || payload.status_details?.description || payload.error?.reason || payload.status_details?.reason;
  const fallback = 'Razorpay payout failed';
  return desc && desc.trim() ? desc.trim() : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function basicAuthHeader(keyId: string, keySecret: string): string {
  const raw = `${keyId}:${keySecret}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

type RazorpayFundAccount = import('../utils/receiverPayoutDestination').RazorpayPayoutFundAccount;

async function razorpayCreatePayout(params: {
  accountNumber: string;
  amountPaise: number;
  currency: 'INR';
  mode: 'IMPS' | 'NEFT' | 'RTGS' | 'UPI';
  purpose: string;
  fundAccount: RazorpayFundAccount;
  referenceId: string;
  narration: string;
  idempotencyKey: string;
}): Promise<RazorpayPayoutCreateResponse> {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error('Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET');
  }

  const apiUrl = 'https://api.razorpay.com/v1/payouts';

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(keyId, keySecret),
      'X-Payout-Idempotency': params.idempotencyKey,
    },
    body: JSON.stringify({
      account_number: params.accountNumber,
      amount: params.amountPaise,
      currency: params.currency,
      mode: params.mode,
      purpose: params.purpose,
      fund_account: params.fundAccount,
      queue_if_low_balance: true,
      reference_id: params.referenceId,
      narration: params.narration,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RazorpayX payout create failed (${res.status}): ${text || 'unknown error'}`);
  }

  return (await res.json()) as RazorpayPayoutCreateResponse;
}

async function razorpayFetchPayout(payoutId: string): Promise<RazorpayPayoutFetchResponse> {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error('Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET');
  }

  const apiUrl = `https://api.razorpay.com/v1/payouts/${encodeURIComponent(payoutId)}`;
  const res = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: basicAuthHeader(keyId, keySecret),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RazorpayX payout fetch failed (${res.status}): ${text || 'unknown error'}`);
  }

  return (await res.json()) as RazorpayPayoutFetchResponse;
}

async function debitReceiverWalletOnPayoutSuccess(options: { withdrawalId: string; amount: number }): Promise<void> {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const withdrawal = await WithdrawalRequest.findById(options.withdrawalId).session(session);
      if (!withdrawal) return;

      // Idempotent protection: only debit once per withdrawal.
      if (withdrawal.walletDebitedAt) return;

      const receiver = await Receiver.findById(withdrawal.receiverId).session(session).select('walletBalance');
      if (!receiver) return;

      if (receiver.walletBalance < options.amount) {
        throw new Error('Insufficient wallet balance at payout finalization');
      }
      receiver.walletBalance = Math.round((receiver.walletBalance - options.amount) * 100) / 100;
      await receiver.save();

      withdrawal.walletDebitedAt = new Date();
      await withdrawal.save();
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Initiates RazorpayX payout for an approved withdrawal and polls for terminal status.
 *
 * This function is intentionally safe to call multiple times:
 * - If payoutStatus isn't `processing`, it does nothing.
 * - It creates a payout only when `payoutId` is missing.
 */
export async function trackAndFinalizeRazorpayXPayout(withdrawalId: string): Promise<void> {
  const withdrawal = await WithdrawalRequest.findById(withdrawalId).lean<{
    _id: mongoose.Types.ObjectId;
    receiverId: mongoose.Types.ObjectId;
    amount: number;
    payoutAmount?: number | null;
    payoutMethod?: 'upi' | 'bank' | null;
    status: string;
    payoutStatus: PayoutStatus;
    payoutId: string | null;
    payoutReferenceId: string | null;
  }>();

  if (!withdrawal) return;
  if (withdrawal.payoutStatus !== 'processing') return;

  const payoutInr = resolveWithdrawalPayoutAmount(withdrawal);
  const walletDebitInr = resolveWithdrawalWalletDebitAmount(withdrawal);

  const receiver = await Receiver.findById(withdrawal.receiverId).select(
    'name email phone nameAsPerAadhaar upiId bankAccountHolderName bankAccountNumber bankIfsc bankName walletBalance'
  );
  if (!receiver) {
    await WithdrawalRequest.findByIdAndUpdate(withdrawalId, {
      payoutStatus: 'failed',
      payoutError: 'Receiver missing',
      status: 'rejected',
    });
    emitReceiverWithdrawalUpdate(String(withdrawal.receiverId), {
      withdrawalId,
      amount: payoutInr,
      payoutStatus: 'failed',
      message: 'Payment failed',
    });
    return;
  }

  const destination = resolveReceiverPayoutDestination({
    receiver,
    contactEmail: razorpayContactEmailFromPhone(safeTrim(receiver.phone)),
    preferredMethod: withdrawal.payoutMethod ?? null,
  });

  if (!destination) {
    const payoutError =
      withdrawal.payoutMethod === 'bank'
        ? 'Bank account or IFSC missing for this withdrawal'
        : withdrawal.payoutMethod === 'upi'
          ? 'UPI ID missing for this withdrawal'
          : 'Receiver payment/contact details missing';
    await WithdrawalRequest.findByIdAndUpdate(withdrawalId, {
      status: 'rejected',
      payoutStatus: 'failed',
      payoutError,
    });
    emitReceiverWithdrawalUpdate(String(withdrawal.receiverId), {
      withdrawalId,
      amount: payoutInr,
      payoutStatus: 'failed',
      message: 'Payment failed',
    });
    return;
  }

  const payoutAccountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim();
  const mode = destination.mode;
  const purpose = process.env.RAZORPAYX_PAYOUT_PURPOSE?.trim() || 'payout';
  const narration = safeTrim(process.env.RAZORPAYX_PAYOUT_NARRATION) || 'DatingApp Payout';

  if (!payoutAccountNumber) {
    await WithdrawalRequest.findByIdAndUpdate(withdrawalId, {
      status: 'rejected',
      payoutStatus: 'failed',
      payoutError: 'RAZORPAYX_ACCOUNT_NUMBER is not set',
    });
    emitReceiverWithdrawalUpdate(String(withdrawal.receiverId), {
      withdrawalId,
      amount: payoutInr,
      payoutStatus: 'failed',
      message: 'Payment failed',
    });
    return;
  }

  const amountPaise = roundInrToPaise(payoutInr);
  const referenceBase = withdrawal.payoutReferenceId || `wd_${String(withdrawal._id).slice(-10)}`;
  const idempotencyKey = `wd-${referenceBase}`.slice(0, 80);
  let payoutId: string | null = withdrawal.payoutId;

  try {
    if (!payoutId) {
      const refId = referenceBase.slice(0, 40);
      const fundAccount: RazorpayFundAccount = destination.fundAccount;

      const payout = await razorpayCreatePayout({
        accountNumber: payoutAccountNumber,
        amountPaise,
        currency: 'INR',
        mode,
        purpose,
        referenceId: refId,
        narration: narration.slice(0, 30),
        idempotencyKey,
        fundAccount,
      });

      const createdPayoutId = safeTrim(payout.id) || null;
      const payoutStatus = mapRazorpayPayoutStatusToPayoutStatus(payout.status);
      const utr = payout.utr ?? null;
      const payoutError = payoutStatus === 'failed' ? extractRazorpayErrorMessage(payout) : null;

      await WithdrawalRequest.findByIdAndUpdate(withdrawalId, {
        payoutId: createdPayoutId,
        payoutUtr: utr,
        payoutStatus,
        payoutError,
        status: payoutStatus === 'success' ? 'approved' : payoutStatus === 'failed' ? 'rejected' : 'approved',
      });

      payoutId = createdPayoutId;

      if (payoutStatus === 'failed') {
        emitReceiverWithdrawalUpdate(String(withdrawal.receiverId), {
          withdrawalId,
          amount: payoutInr,
          payoutStatus: 'failed',
          message: 'Payment failed',
        });
        return;
      }

      if (payoutStatus === 'success') {
        await debitReceiverWalletOnPayoutSuccess({ withdrawalId, amount: walletDebitInr });
        emitReceiverWithdrawalUpdate(String(withdrawal.receiverId), {
          withdrawalId,
          amount: payoutInr,
          payoutStatus: 'success',
          message: 'Payment successful',
        });
        return;
      }
    }

    if (!payoutId) return;

    // Poll until payout reaches a terminal state.
    const maxAttempts = Number(process.env.RAZORPAYX_PAYOUT_POLL_ATTEMPTS ?? 8);
    const delayMs = Number(process.env.RAZORPAYX_PAYOUT_POLL_DELAY_MS ?? 5000);

    for (let i = 0; i < maxAttempts; i += 1) {
      // Stop early if some other worker already resolved it.
      const current = await WithdrawalRequest.findById(withdrawalId).select('payoutStatus payoutId');
      if (!current || current.payoutId !== payoutId || current.payoutStatus !== 'processing') return;

      const payout = await razorpayFetchPayout(payoutId);
      const payoutStatus = mapRazorpayPayoutStatusToPayoutStatus(payout.status);

      if (payoutStatus === 'success') {
        await debitReceiverWalletOnPayoutSuccess({ withdrawalId, amount: walletDebitInr });
        await WithdrawalRequest.findByIdAndUpdate(withdrawalId, {
          payoutStatus: 'success',
          payoutUtr: payout.utr ?? null,
          payoutError: null,
          status: 'approved',
        });
        emitReceiverWithdrawalUpdate(String(withdrawal.receiverId), {
          withdrawalId,
          amount: payoutInr,
          payoutStatus: 'success',
          message: 'Payment successful',
        });
        return;
      }

      if (payoutStatus === 'failed') {
        const err = extractRazorpayErrorMessage(payout);
        await WithdrawalRequest.findByIdAndUpdate(withdrawalId, {
          payoutStatus: 'failed',
          payoutError: err,
          payoutUtr: payout.utr ?? null,
          status: 'rejected',
        });
        emitReceiverWithdrawalUpdate(String(withdrawal.receiverId), {
          withdrawalId,
          amount: payoutInr,
          payoutStatus: 'failed',
          message: 'Payment failed',
        });
        return;
      }

      await sleep(delayMs);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If we never managed to create a payoutId, mark as failed (wallet is unchanged).
    if (!payoutId) {
      await WithdrawalRequest.findByIdAndUpdate(withdrawalId, {
        status: 'rejected',
        payoutStatus: 'failed',
        payoutError: msg,
      });
      emitReceiverWithdrawalUpdate(String(withdrawal.receiverId), {
        withdrawalId,
        amount: payoutInr,
        payoutStatus: 'failed',
        message: 'Payment failed',
      });
      return;
    }

    // If we already created a payout but polling failed, keep it in processing and store error.
    await WithdrawalRequest.findByIdAndUpdate(withdrawalId, { payoutError: msg });
  }
}

async function markAdminWithdrawalEarningsDebited(withdrawalId: string): Promise<void> {
  await AdminWithdrawalRequest.findOneAndUpdate(
    { _id: withdrawalId, earningsDebitedAt: null },
    { earningsDebitedAt: new Date() }
  );
}

/**
 * RazorpayX payout for platform admin earnings (UPI only).
 */
export async function trackAndFinalizeAdminRazorpayXPayout(withdrawalId: string): Promise<void> {
  const withdrawal = await AdminWithdrawalRequest.findById(withdrawalId).lean<{
    _id: mongoose.Types.ObjectId;
    adminId: mongoose.Types.ObjectId;
    amount: number;
    status: string;
    payoutStatus: PayoutStatus;
    payoutId: string | null;
    payoutReferenceId: string | null;
    upiId: string;
    payeeName: string;
    contactPhone: string;
  }>();

  if (!withdrawal) return;
  if (withdrawal.payoutStatus !== 'processing') return;

  const upiId = safeTrim(withdrawal.upiId).toLowerCase();
  const payeeName = safeTrim(withdrawal.payeeName);
  const contactPhone = safeTrim(withdrawal.contactPhone);
  const hasUpi = /^[a-z0-9._-]{2,256}@[a-z]{3,}$/i.test(upiId);

  if (!hasUpi || !contactPhone || !payeeName) {
    await AdminWithdrawalRequest.findByIdAndUpdate(withdrawalId, {
      payoutStatus: 'failed',
      payoutError: 'Admin payout UPI/contact details missing',
      status: 'rejected',
    });
    return;
  }

  const payoutAccountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim();
  const purpose = process.env.RAZORPAYX_PAYOUT_PURPOSE?.trim() || 'payout';
  const narration = safeTrim(process.env.RAZORPAYX_PAYOUT_NARRATION) || 'Selecto Admin Payout';

  if (!payoutAccountNumber) {
    await AdminWithdrawalRequest.findByIdAndUpdate(withdrawalId, {
      payoutStatus: 'failed',
      payoutError: 'RAZORPAYX_ACCOUNT_NUMBER is not set',
      status: 'rejected',
    });
    return;
  }

  const amountPaise = roundInrToPaise(withdrawal.amount);
  const referenceBase = withdrawal.payoutReferenceId || `awd_${String(withdrawal._id).slice(-10)}`;
  const idempotencyKey = `awd-${referenceBase}`.slice(0, 80);
  let payoutId: string | null = withdrawal.payoutId;

  try {
    if (!payoutId) {
      const refId = referenceBase.slice(0, 40);
      const contact = {
        name: payeeName,
        email: razorpayContactEmailFromPhone(contactPhone),
        contact: contactPhone,
        type: 'customer',
        reference_id: `admin_${String(withdrawal.adminId).slice(-10)}`.slice(0, 40),
      };
      const fundAccount: RazorpayFundAccount = {
        account_type: 'vpa',
        vpa: { address: upiId },
        contact,
      };

      const payout = await razorpayCreatePayout({
        accountNumber: payoutAccountNumber,
        amountPaise,
        currency: 'INR',
        mode: 'UPI',
        purpose,
        referenceId: refId,
        narration: narration.slice(0, 30),
        idempotencyKey,
        fundAccount,
      });

      const createdPayoutId = safeTrim(payout.id) || null;
      const payoutStatus = mapRazorpayPayoutStatusToPayoutStatus(payout.status);
      const utr = payout.utr ?? null;
      const payoutError = payoutStatus === 'failed' ? extractRazorpayErrorMessage(payout) : null;

      await AdminWithdrawalRequest.findByIdAndUpdate(withdrawalId, {
        payoutId: createdPayoutId,
        payoutUtr: utr,
        payoutStatus,
        payoutError,
        status: payoutStatus === 'success' ? 'approved' : payoutStatus === 'failed' ? 'rejected' : 'approved',
      });

      payoutId = createdPayoutId;

      if (payoutStatus === 'failed') return;

      if (payoutStatus === 'success') {
        await markAdminWithdrawalEarningsDebited(withdrawalId);
        return;
      }
    }

    if (!payoutId) return;

    const maxAttempts = Number(process.env.RAZORPAYX_PAYOUT_POLL_ATTEMPTS ?? 8);
    const delayMs = Number(process.env.RAZORPAYX_PAYOUT_POLL_DELAY_MS ?? 5000);

    for (let i = 0; i < maxAttempts; i += 1) {
      const current = await AdminWithdrawalRequest.findById(withdrawalId).select('payoutStatus payoutId');
      if (!current || current.payoutId !== payoutId || current.payoutStatus !== 'processing') return;

      const payout = await razorpayFetchPayout(payoutId);
      const payoutStatus = mapRazorpayPayoutStatusToPayoutStatus(payout.status);

      if (payoutStatus === 'success') {
        await markAdminWithdrawalEarningsDebited(withdrawalId);
        await AdminWithdrawalRequest.findByIdAndUpdate(withdrawalId, {
          payoutStatus: 'success',
          payoutUtr: payout.utr ?? null,
          payoutError: null,
          status: 'approved',
        });
        return;
      }

      if (payoutStatus === 'failed') {
        const err = extractRazorpayErrorMessage(payout);
        await AdminWithdrawalRequest.findByIdAndUpdate(withdrawalId, {
          payoutStatus: 'failed',
          payoutError: err,
          payoutUtr: payout.utr ?? null,
          status: 'rejected',
        });
        return;
      }

      await sleep(delayMs);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!payoutId) {
      await AdminWithdrawalRequest.findByIdAndUpdate(withdrawalId, {
        status: 'rejected',
        payoutStatus: 'failed',
        payoutError: msg,
      });
      return;
    }
    await AdminWithdrawalRequest.findByIdAndUpdate(withdrawalId, { payoutError: msg });
  }
}
