export const WALLET_RECHARGE_GST_PERCENT = 18;

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

export function walletRechargePlatformFeePercent(walletAmount: number): number {
  return walletAmount >= 1000 ? 5 : 10;
}

export type WalletRechargeBreakdown = {
  walletAmount: number;
  platformFeePercent: number;
  platformFee: number;
  gstPercent: number;
  gstAmount: number;
  totalPayable: number;
};

export function computeWalletRechargeBreakdown(walletAmount: number): WalletRechargeBreakdown {
  const wallet = Math.max(0, roundInr(walletAmount));
  const platformFeePercent = walletRechargePlatformFeePercent(wallet);
  const platformFee = roundInr((wallet * platformFeePercent) / 100);
  const preTax = roundInr(wallet + platformFee);
  const gstPercent = WALLET_RECHARGE_GST_PERCENT;
  const gstAmount = roundInr((preTax * gstPercent) / 100);
  const totalPayable = roundInr(preTax + gstAmount);
  return {
    walletAmount: wallet,
    platformFeePercent,
    platformFee,
    gstPercent,
    gstAmount,
    totalPayable,
  };
}

export function walletCreditForRecharge(walletAmount: number, bonusPercent: number): number {
  const wallet = Math.max(0, roundInr(walletAmount));
  const bonus = Number.isFinite(bonusPercent) ? bonusPercent : 0;
  return roundInr(wallet * (1 + bonus / 100));
}
