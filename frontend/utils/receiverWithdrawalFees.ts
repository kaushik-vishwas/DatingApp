export const RECEIVER_MIN_WITHDRAWAL_INR = 200;
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
