export const RECEIVER_MIN_WITHDRAWAL_INR = 200;
/** Deducted from the requested withdrawal; remainder is paid to receiver UPI. */
export const RECEIVER_WITHDRAWAL_PLATFORM_FEE_PERCENT = 5;

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ReceiverWithdrawalBreakdown = {
  requestedAmount: number;
  platformFeePercent: number;
  platformFee: number;
  netPayout: number;
};

export function computeReceiverWithdrawalBreakdown(requestedAmount: number): ReceiverWithdrawalBreakdown {
  const requested = Math.max(0, roundInr(requestedAmount));
  const platformFeePercent = RECEIVER_WITHDRAWAL_PLATFORM_FEE_PERCENT;
  const platformFee = roundInr((requested * platformFeePercent) / 100);
  const netPayout = roundInr(Math.max(0, requested - platformFee));
  return {
    requestedAmount: requested,
    platformFeePercent,
    platformFee,
    netPayout,
  };
}

export function isValidReceiverWithdrawalAmount(raw: unknown): boolean {
  const n = Number(raw);
  if (!Number.isFinite(n)) return false;
  return roundInr(n) >= RECEIVER_MIN_WITHDRAWAL_INR;
}

/** Razorpay payout INR; legacy rows without `payoutAmount` pay full `amount`. */
export function resolveWithdrawalPayoutAmount(row: {
  amount: number;
  payoutAmount?: number | null;
}): number {
  if (typeof row.payoutAmount === 'number' && Number.isFinite(row.payoutAmount) && row.payoutAmount > 0) {
    return roundInr(row.payoutAmount);
  }
  return roundInr(row.amount);
}

/** Wallet debit INR on successful payout; legacy rows debit full `amount`. */
export function resolveWithdrawalWalletDebitAmount(row: {
  amount: number;
}): number {
  return roundInr(row.amount);
}
