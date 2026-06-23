"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECEIVER_WITHDRAWAL_PLATFORM_FEE_PERCENT = exports.RECEIVER_MIN_WITHDRAWAL_INR = void 0;
exports.computeReceiverWithdrawalBreakdown = computeReceiverWithdrawalBreakdown;
exports.isValidReceiverWithdrawalAmount = isValidReceiverWithdrawalAmount;
exports.resolveWithdrawalPayoutAmount = resolveWithdrawalPayoutAmount;
exports.resolveWithdrawalWalletDebitAmount = resolveWithdrawalWalletDebitAmount;
exports.RECEIVER_MIN_WITHDRAWAL_INR = 200;
/** Deducted from the requested withdrawal; remainder is paid to receiver UPI. */
exports.RECEIVER_WITHDRAWAL_PLATFORM_FEE_PERCENT = 5;
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
function computeReceiverWithdrawalBreakdown(requestedAmount) {
    const requested = Math.max(0, roundInr(requestedAmount));
    const platformFeePercent = exports.RECEIVER_WITHDRAWAL_PLATFORM_FEE_PERCENT;
    const platformFee = roundInr((requested * platformFeePercent) / 100);
    const netPayout = roundInr(Math.max(0, requested - platformFee));
    return {
        requestedAmount: requested,
        platformFeePercent,
        platformFee,
        netPayout,
    };
}
function isValidReceiverWithdrawalAmount(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n))
        return false;
    return roundInr(n) >= exports.RECEIVER_MIN_WITHDRAWAL_INR;
}
/** Razorpay payout INR; legacy rows without `payoutAmount` pay full `amount`. */
function resolveWithdrawalPayoutAmount(row) {
    if (typeof row.payoutAmount === 'number' && Number.isFinite(row.payoutAmount) && row.payoutAmount > 0) {
        return roundInr(row.payoutAmount);
    }
    return roundInr(row.amount);
}
/** Wallet debit INR on successful payout; legacy rows debit full `amount`. */
function resolveWithdrawalWalletDebitAmount(row) {
    return roundInr(row.amount);
}
