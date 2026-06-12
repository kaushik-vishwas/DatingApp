"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackAndFinalizeRazorpayXPayout = trackAndFinalizeRazorpayXPayout;
exports.trackAndFinalizeAdminRazorpayXPayout = trackAndFinalizeAdminRazorpayXPayout;
const mongoose_1 = __importDefault(require("mongoose"));
const WithdrawalRequest_1 = __importDefault(require("../models/WithdrawalRequest"));
const AdminWithdrawalRequest_1 = __importDefault(require("../models/AdminWithdrawalRequest"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const socketRegistry_1 = require("../socket/socketRegistry");
const razorpayContact_1 = require("../utils/razorpayContact");
function roundInrToPaise(n) {
    return Math.round(n * 100);
}
function safeTrim(s) {
    return typeof s === 'string' ? s.trim() : '';
}
function mapRazorpayPayoutStatusToPayoutStatus(status) {
    const s = String(status ?? '').toLowerCase();
    if (s === 'processed')
        return 'success';
    if (s === 'failed' || s === 'rejected')
        return 'failed';
    // queued/processing/pending -> treat as in-flight
    return 'processing';
}
function extractRazorpayErrorMessage(payload) {
    const desc = payload.error?.description || payload.status_details?.description || payload.error?.reason || payload.status_details?.reason;
    const fallback = 'Razorpay payout failed';
    return desc && desc.trim() ? desc.trim() : fallback;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function basicAuthHeader(keyId, keySecret) {
    const raw = `${keyId}:${keySecret}`;
    return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}
async function razorpayCreatePayout(params) {
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
    return (await res.json());
}
async function razorpayFetchPayout(payoutId) {
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
    return (await res.json());
}
async function debitReceiverWalletOnPayoutSuccess(options) {
    const session = await mongoose_1.default.startSession();
    try {
        await session.withTransaction(async () => {
            const withdrawal = await WithdrawalRequest_1.default.findById(options.withdrawalId).session(session);
            if (!withdrawal)
                return;
            // Idempotent protection: only debit once per withdrawal.
            if (withdrawal.walletDebitedAt)
                return;
            const receiver = await Receiver_1.default.findById(withdrawal.receiverId).session(session).select('walletBalance');
            if (!receiver)
                return;
            if (receiver.walletBalance < options.amount) {
                throw new Error('Insufficient wallet balance at payout finalization');
            }
            receiver.walletBalance = Math.round((receiver.walletBalance - options.amount) * 100) / 100;
            await receiver.save();
            withdrawal.walletDebitedAt = new Date();
            await withdrawal.save();
        });
    }
    finally {
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
async function trackAndFinalizeRazorpayXPayout(withdrawalId) {
    const withdrawal = await WithdrawalRequest_1.default.findById(withdrawalId).lean();
    if (!withdrawal)
        return;
    if (withdrawal.payoutStatus !== 'processing')
        return;
    const receiver = await Receiver_1.default.findById(withdrawal.receiverId).select('name email phone nameAsPerAadhaar upiId bankAccountHolderName bankAccountNumber bankIfsc bankName walletBalance');
    if (!receiver) {
        await WithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
            payoutStatus: 'failed',
            payoutError: 'Receiver missing',
            status: 'rejected',
        });
        (0, socketRegistry_1.emitReceiverWithdrawalUpdate)(String(withdrawal.receiverId), {
            withdrawalId,
            amount: withdrawal.amount,
            payoutStatus: 'failed',
            message: 'Payment failed',
        });
        return;
    }
    const upiId = safeTrim(receiver.upiId).toLowerCase();
    const payeeName = safeTrim(receiver.nameAsPerAadhaar) || safeTrim(receiver.bankAccountHolderName) || safeTrim(receiver.name);
    const hasUpi = /^[a-z0-9._-]{2,256}@[a-z]{3,}$/i.test(upiId);
    const hasBank = Boolean(safeTrim(receiver.bankAccountNumber)) &&
        Boolean(safeTrim(receiver.bankIfsc)) &&
        Boolean(safeTrim(receiver.bankAccountHolderName));
    if ((!hasUpi && !hasBank) || !safeTrim(receiver.phone) || !payeeName) {
        await WithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
            status: 'rejected',
            payoutStatus: 'failed',
            payoutError: 'Receiver payment/contact details missing',
        });
        (0, socketRegistry_1.emitReceiverWithdrawalUpdate)(String(withdrawal.receiverId), {
            withdrawalId,
            amount: withdrawal.amount,
            payoutStatus: 'failed',
            message: 'Payment failed',
        });
        return;
    }
    const payoutAccountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim();
    const modeRaw = process.env.RAZORPAYX_PAYOUT_MODE?.trim().toUpperCase() || (hasUpi ? 'UPI' : 'IMPS');
    const mode = modeRaw === 'UPI' || (hasUpi && modeRaw !== 'NEFT' && modeRaw !== 'RTGS' && modeRaw !== 'IMPS')
        ? 'UPI'
        : modeRaw === 'NEFT' || modeRaw === 'RTGS' || modeRaw === 'IMPS'
            ? modeRaw
            : 'IMPS';
    const purpose = process.env.RAZORPAYX_PAYOUT_PURPOSE?.trim() || 'payout';
    const narration = safeTrim(process.env.RAZORPAYX_PAYOUT_NARRATION) || 'DatingApp Payout';
    if (!payoutAccountNumber) {
        await WithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
            status: 'rejected',
            payoutStatus: 'failed',
            payoutError: 'RAZORPAYX_ACCOUNT_NUMBER is not set',
        });
        (0, socketRegistry_1.emitReceiverWithdrawalUpdate)(String(withdrawal.receiverId), {
            withdrawalId,
            amount: withdrawal.amount,
            payoutStatus: 'failed',
            message: 'Payment failed',
        });
        return;
    }
    const amountPaise = roundInrToPaise(withdrawal.amount);
    const referenceBase = withdrawal.payoutReferenceId || `wd_${String(withdrawal._id).slice(-10)}`;
    const idempotencyKey = `wd-${referenceBase}`.slice(0, 80);
    let payoutId = withdrawal.payoutId;
    try {
        if (!payoutId) {
            const refId = referenceBase.slice(0, 40);
            const contact = {
                name: payeeName || 'Receiver',
                email: (0, razorpayContact_1.razorpayContactEmailFromPhone)(safeTrim(receiver.phone)),
                contact: safeTrim(receiver.phone),
                type: 'customer',
                reference_id: `recv_${String(receiver._id).slice(-10)}`.slice(0, 40),
            };
            const fundAccount = mode === 'UPI' && hasUpi
                ? {
                    account_type: 'vpa',
                    vpa: { address: upiId },
                    contact,
                }
                : {
                    account_type: 'bank_account',
                    bank_account: {
                        name: safeTrim(receiver.bankAccountHolderName) || payeeName || 'Receiver',
                        ifsc: safeTrim(receiver.bankIfsc),
                        account_number: safeTrim(receiver.bankAccountNumber),
                    },
                    contact,
                };
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
            await WithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
                payoutId: createdPayoutId,
                payoutUtr: utr,
                payoutStatus,
                payoutError,
                status: payoutStatus === 'success' ? 'approved' : payoutStatus === 'failed' ? 'rejected' : 'approved',
            });
            payoutId = createdPayoutId;
            if (payoutStatus === 'failed') {
                (0, socketRegistry_1.emitReceiverWithdrawalUpdate)(String(withdrawal.receiverId), {
                    withdrawalId,
                    amount: withdrawal.amount,
                    payoutStatus: 'failed',
                    message: 'Payment failed',
                });
                return;
            }
            if (payoutStatus === 'success') {
                await debitReceiverWalletOnPayoutSuccess({ withdrawalId, amount: withdrawal.amount });
                (0, socketRegistry_1.emitReceiverWithdrawalUpdate)(String(withdrawal.receiverId), {
                    withdrawalId,
                    amount: withdrawal.amount,
                    payoutStatus: 'success',
                    message: 'Payment successful',
                });
                return;
            }
        }
        if (!payoutId)
            return;
        // Poll until payout reaches a terminal state.
        const maxAttempts = Number(process.env.RAZORPAYX_PAYOUT_POLL_ATTEMPTS ?? 8);
        const delayMs = Number(process.env.RAZORPAYX_PAYOUT_POLL_DELAY_MS ?? 5000);
        for (let i = 0; i < maxAttempts; i += 1) {
            // Stop early if some other worker already resolved it.
            const current = await WithdrawalRequest_1.default.findById(withdrawalId).select('payoutStatus payoutId');
            if (!current || current.payoutId !== payoutId || current.payoutStatus !== 'processing')
                return;
            const payout = await razorpayFetchPayout(payoutId);
            const payoutStatus = mapRazorpayPayoutStatusToPayoutStatus(payout.status);
            if (payoutStatus === 'success') {
                await debitReceiverWalletOnPayoutSuccess({ withdrawalId, amount: withdrawal.amount });
                await WithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
                    payoutStatus: 'success',
                    payoutUtr: payout.utr ?? null,
                    payoutError: null,
                    status: 'approved',
                });
                (0, socketRegistry_1.emitReceiverWithdrawalUpdate)(String(withdrawal.receiverId), {
                    withdrawalId,
                    amount: withdrawal.amount,
                    payoutStatus: 'success',
                    message: 'Payment successful',
                });
                return;
            }
            if (payoutStatus === 'failed') {
                const err = extractRazorpayErrorMessage(payout);
                await WithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
                    payoutStatus: 'failed',
                    payoutError: err,
                    payoutUtr: payout.utr ?? null,
                    status: 'rejected',
                });
                (0, socketRegistry_1.emitReceiverWithdrawalUpdate)(String(withdrawal.receiverId), {
                    withdrawalId,
                    amount: withdrawal.amount,
                    payoutStatus: 'failed',
                    message: 'Payment failed',
                });
                return;
            }
            await sleep(delayMs);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If we never managed to create a payoutId, mark as failed (wallet is unchanged).
        if (!payoutId) {
            await WithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
                status: 'rejected',
                payoutStatus: 'failed',
                payoutError: msg,
            });
            (0, socketRegistry_1.emitReceiverWithdrawalUpdate)(String(withdrawal.receiverId), {
                withdrawalId,
                amount: withdrawal.amount,
                payoutStatus: 'failed',
                message: 'Payment failed',
            });
            return;
        }
        // If we already created a payout but polling failed, keep it in processing and store error.
        await WithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, { payoutError: msg });
    }
}
async function markAdminWithdrawalEarningsDebited(withdrawalId) {
    await AdminWithdrawalRequest_1.default.findOneAndUpdate({ _id: withdrawalId, earningsDebitedAt: null }, { earningsDebitedAt: new Date() });
}
/**
 * RazorpayX payout for platform admin earnings (UPI only).
 */
async function trackAndFinalizeAdminRazorpayXPayout(withdrawalId) {
    const withdrawal = await AdminWithdrawalRequest_1.default.findById(withdrawalId).lean();
    if (!withdrawal)
        return;
    if (withdrawal.payoutStatus !== 'processing')
        return;
    const upiId = safeTrim(withdrawal.upiId).toLowerCase();
    const payeeName = safeTrim(withdrawal.payeeName);
    const contactPhone = safeTrim(withdrawal.contactPhone);
    const hasUpi = /^[a-z0-9._-]{2,256}@[a-z]{3,}$/i.test(upiId);
    if (!hasUpi || !contactPhone || !payeeName) {
        await AdminWithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
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
        await AdminWithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
            payoutStatus: 'failed',
            payoutError: 'RAZORPAYX_ACCOUNT_NUMBER is not set',
            status: 'rejected',
        });
        return;
    }
    const amountPaise = roundInrToPaise(withdrawal.amount);
    const referenceBase = withdrawal.payoutReferenceId || `awd_${String(withdrawal._id).slice(-10)}`;
    const idempotencyKey = `awd-${referenceBase}`.slice(0, 80);
    let payoutId = withdrawal.payoutId;
    try {
        if (!payoutId) {
            const refId = referenceBase.slice(0, 40);
            const contact = {
                name: payeeName,
                email: (0, razorpayContact_1.razorpayContactEmailFromPhone)(contactPhone),
                contact: contactPhone,
                type: 'customer',
                reference_id: `admin_${String(withdrawal.adminId).slice(-10)}`.slice(0, 40),
            };
            const fundAccount = {
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
            await AdminWithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
                payoutId: createdPayoutId,
                payoutUtr: utr,
                payoutStatus,
                payoutError,
                status: payoutStatus === 'success' ? 'approved' : payoutStatus === 'failed' ? 'rejected' : 'approved',
            });
            payoutId = createdPayoutId;
            if (payoutStatus === 'failed')
                return;
            if (payoutStatus === 'success') {
                await markAdminWithdrawalEarningsDebited(withdrawalId);
                return;
            }
        }
        if (!payoutId)
            return;
        const maxAttempts = Number(process.env.RAZORPAYX_PAYOUT_POLL_ATTEMPTS ?? 8);
        const delayMs = Number(process.env.RAZORPAYX_PAYOUT_POLL_DELAY_MS ?? 5000);
        for (let i = 0; i < maxAttempts; i += 1) {
            const current = await AdminWithdrawalRequest_1.default.findById(withdrawalId).select('payoutStatus payoutId');
            if (!current || current.payoutId !== payoutId || current.payoutStatus !== 'processing')
                return;
            const payout = await razorpayFetchPayout(payoutId);
            const payoutStatus = mapRazorpayPayoutStatusToPayoutStatus(payout.status);
            if (payoutStatus === 'success') {
                await markAdminWithdrawalEarningsDebited(withdrawalId);
                await AdminWithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
                    payoutStatus: 'success',
                    payoutUtr: payout.utr ?? null,
                    payoutError: null,
                    status: 'approved',
                });
                return;
            }
            if (payoutStatus === 'failed') {
                const err = extractRazorpayErrorMessage(payout);
                await AdminWithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
                    payoutStatus: 'failed',
                    payoutError: err,
                    payoutUtr: payout.utr ?? null,
                    status: 'rejected',
                });
                return;
            }
            await sleep(delayMs);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!payoutId) {
            await AdminWithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, {
                status: 'rejected',
                payoutStatus: 'failed',
                payoutError: msg,
            });
            return;
        }
        await AdminWithdrawalRequest_1.default.findByIdAndUpdate(withdrawalId, { payoutError: msg });
    }
}
